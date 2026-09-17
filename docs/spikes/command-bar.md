# Spike: command bar (Task 1)

> Ngày chạy: 2026-09-17. Máy: Windows 11 Pro ARM64, 12 nhân, màn hình 1920×1200 ở 125%. Build release, WebView2 153.
> Code spike **đã xóa** sau khi đo. Có 2 phần:
> - Cửa sổ thứ hai ẩn sẵn, gắn vào phím tắt: sửa tạm trong app.
> - Gọi COM và Everything: project nháp ngoài repo.

## Kết luận nhanh

| Rủi ro | Kết quả | Đề xuất |
|---|---|---|
| R1 Focus khi nhấn phím tắt | **Đạt.** Từ cả 4 app, cửa sổ thứ hai đều lên trước và nhận chữ gõ | Dùng `show()` + `set_focus()` trong handler phím tắt, không cần mẹo |
| — Thời gian mở | **28–62ms** từ lúc nhấn tới khung hình đầu. Mục tiêu ≤ 150ms | Tạo sẵn cửa sổ ẩn như spec |
| R2 RAM khi thêm WebView thứ hai | **+17 đến +22 MB** (Task Manager). Cả app **103–108 MB** < 150 MB | Giữ tạo sẵn. Đo lại ở Task 13 khi đã có React + icon |
| R3 Everything SDK | **Đạt.** Giấy phép MIT, có `EverythingARM64.dll`, gọi được từ Rust | Kèm DLL đúng kiến trúc, nạp lúc chạy bằng `LoadLibraryW` (không thêm crate) |
| R4 COM từ Rust trên ARM64 | **Đạt.** Liệt kê app, icon ra PNG, truy vấn Windows Search đều chạy | Làm theo spec, feature `windows` như mục 3 |

Không cần đổi spec. Có 3 điều ghi thêm cho các task sau, ở cuối file.

## 1. Focus và thời gian mở (R1)

**Cách làm:**
1. Tạo sẵn một cửa sổ Tauri thứ hai: không viền, trong suốt, luôn nằm trên, ẩn, trong trang có một ô nhập.
2. Handler phím tắt gọi `show()` rồi `set_focus()`.
3. Phím thử là `Ctrl+Alt+F9` (YASB đang giữ `Ctrl+Space`).
4. Với từng app:
   - script mở một cửa sổ **mới** của app đó và đưa nó lên trước,
   - nhấn phím tắt,
   - kiểm tra cửa sổ nào đang ở trước,
   - gõ `zq`,
   - nhấn phím tắt lần nữa để ẩn,
   - đóng cửa sổ mới.

   Không đụng vào các cửa sổ bạn đang mở.

| App ở trước | Cửa sổ ở trước sau phím tắt | Ô nhập nhận `zq` | Nhấn phím → sự kiện `focus` | Nhấn phím → khung hình đầu |
|---|---|---|---|---|
| Notepad | winbar | ✅ | 47ms | 62ms (lần mở đầu tiên) |
| Explorer | winbar | ✅ | 18ms | 36ms |
| Windows Terminal | winbar | ✅ | 15ms | 32ms |
| Chrome | winbar | ✅ | 19ms | 28ms |

Trong Rust, `show()` mất 7–8ms, `set_focus()` mất 10–31ms, và `set_focus` luôn trả về thành công.

Chưa thử khi app đang ở trước chạy **quyền admin**, vì mở app admin cần bấm UAC. Theo cơ chế UIPI của Windows, trường hợp này có thể không nhận focus. Mục này nằm trong checklist thủ công ở Task 13.

## 2. RAM khi có cửa sổ thứ hai (R2)

Cùng một bản release, bật/tắt cửa sổ thứ hai bằng biến môi trường. Mỗi lượt để yên 60 giây rồi lấy trung bình 4 lần đo cách nhau 5 giây.

| Lượt | Cửa sổ thứ hai | Tiến trình | Task Manager ("Memory") | Private bytes |
|---|---|---|---|---|
| 1 | không | 7 | 86.2 MB | 143.4 MB |
| 1 | có | 8 | 108.4 MB | 178.8 MB |
| 2 | không | 7 | 86.7 MB | 143.8 MB |
| 2 | có | 8 | 103.1 MB | 171.3 MB |

**Tổng hợp:**
- Cửa sổ thứ hai tốn **+17 đến +22 MB** theo Task Manager, và +28 đến +35 MB private bytes. Riêng renderer của nó khoảng 14.5 MB, phần còn lại là tiến trình WebView2 chính và GPU tăng thêm.
- Tiêu chí 13 của spec (Task Manager < 150 MB) vẫn đạt, còn dư khoảng 40 MB.
- Private bytes đã vượt 150 MB. Spec đo theo Task Manager nên vẫn đạt, nhưng khoảng dư sẽ hẹp lại khi thêm media và clipboard.
- Một lần đo riêng (chạy 112 giây) có lúc lên **137 MB** rồi giữ ở đó. Con số dao động giữa các lần chạy.

**Nếu sau này thiếu RAM**, theo thứ tự nên thử:
1. Khi command bar ẩn, đặt `MemoryUsageTargetLevel = Low` cho WebView của nó (API của WebView2, gọi qua `with_webview`).
2. Tạo cửa sổ khi mở lần đầu, hủy sau 5 phút không dùng. Lần mở đầu sẽ chậm hơn, cần đo lại.

## 3. Everything SDK (R3)

- **Nguồn:** `https://www.voidtools.com/Everything-SDK.zip`. SDK có sẵn `Everything32.dll`, `Everything64.dll`, `EverythingARM.dll`, `EverythingARM64.dll` (bản PE ARM64, 81.5 KB).
- **Giấy phép:** mã nguồn SDK (`src/Everything.c`, `include/Everything.h`) dùng giấy phép **MIT** (Copyright David Carpenter). Được phép kèm DLL theo app, chỉ cần giữ thông báo bản quyền.
- **Gọi từ Rust:**
  - Nạp `EverythingARM64.dll` bằng `LoadLibraryW` + `GetProcAddress`, gọi `Everything_SetSearchW` + `Everything_QueryW`.
  - Máy chưa có Everything nên `Everything_QueryW` trả về lỗi `EVERYTHING_ERROR_IPC` (2) trong **0ms**. Nhờ vậy phát hiện được ngay khi Everything không chạy, để chuyển sang Windows Search.
  - **Chưa thử được truy vấn thật.** Cần cài Everything, sẽ hỏi bạn ở Task 11.
- **Kèm theo app:** chọn DLL đúng kiến trúc lúc build (`target_arch`), đặt vào `resources/`, kèm thông báo MIT.

## 4. COM từ Rust trên ARM64 (R4)

Project nháp dùng crate `windows` 0.61.3 (cùng bản Tauri đang dùng, không kéo thêm bản mới).

| Phép thử | Kết quả |
|---|---|
| Liệt kê `FOLDERID_AppsFolder` (`SHGetKnownFolderItem` + `BHID_EnumItems`) | **196 app** trong 561ms, bằng số của `Get-StartApps`. Có tên và id, ví dụ `Microsoft.VisualStudioCode`, `Microsoft.WindowsTerminal_8wekyb3d8bbwe!App`, `Chrome`, id đường dẫn exe cho app không có AUMID |
| Icon → PNG (`IShellItemImageFactory` 40px + WIC PNG encoder) | Icon VS Code 1.85 KB, rõ nét, nền trong suốt, **136ms** (lần đầu, gồm cả tạo WIC factory) |
| Windows Search qua OLE DB (`IDataInitialize` → `Search.CollatorDSO` → `ICommandText` → `IRowset`) | "brief" 20 dòng **78ms** · "invoice" 3 dòng 53ms · "config" 20 dòng 96ms · "spec" 20 dòng 81ms · "winbar" 20 dòng 82ms (mỗi lần tạo kết nối mới) |

## Ghi chú cho các task sau

1. **Hàm lấy dòng của OLE DB:** `IRowset::GetNextRows` trong `windows` 0.61 bọc sai (tham số mảng hàng). Phải gọi thẳng qua vtable. Đặt trong một hàm nhỏ có chú thích.
2. **Kết quả Windows Search có file rác trong `target/`, `node_modules`, `.cargo`** (ví dụ "winbar" ra `winbar.d`). Task 10 nên loại các thư mục này trong câu SQL, và ghi vào spec khi làm.
3. **Liệt kê app mất ~0.5s** nên chạy nền lúc khởi động, như spec đã ghi. Mỗi icon ~100ms lần đầu, cần cache (Task 8).
