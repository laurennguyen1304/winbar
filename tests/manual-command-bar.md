# Checklist thủ công: command-bar

> Spec: `SPEC-command-bar.md` §10, §11. Chạy lần đầu: 2026-09-17 (Task 13).
> Máy: Windows 11 Pro ARM64, 12 nhân, màn 1920×1200 ở 125%, WebView2 153. Chưa cài Everything.
>
> Ký hiệu: ✅ qua · 👤 bạn cần tự kiểm · ⚠️ qua nhưng có ghi chú

## Cách chạy

| Việc | Lệnh |
|---|---|
| Tự động | `npm test` · `cargo test --manifest-path src-tauri/Cargo.toml` · `npm run lint` |
| Bản release | `npm run tauri build -- --no-bundle` → `src-tauri\target\release\winbar.exe` |
| Điều khiển WebView2 khi test | `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9333` |

**Trước khi test**, sao lưu:
- `%APPDATA%\winbar\settings.json`,
- `%APPDATA%\winbar\command-history.json`,
- mục `HKCU\…\Run\winbar`.

**Sau khi test**, trả lại như cũ:
- Bản release tự thêm `Run\winbar` khi `launchAtStartup` bật.
- Bản release không có widget demo, nên xóa chúng khỏi `settings.json`.

Lần chạy này đã trả lại cả ba.

Script test chỉ nhấn `Ctrl+Space` sau khi xác nhận winbar đang giữ phím này. Còn lại điều khiển qua trang, không gửi phím vào app khác.

## 1. Mở nhanh, có focus (tiêu chí 1)

- [x] ✅ Bản release, 5 lần nhấn `Ctrl+Space`:

  | Lần | Nhấn → sự kiện mở | Nhấn → khung hình đầu |
  |---|---|---|
  | 1 | 101ms | 118ms |
  | 2 | 47ms | 60ms |
  | 3 | 49ms | 68ms |
  | 4 | 57ms | 87ms |
  | 5 | 85ms | 99ms |

  Mục tiêu ≤ 150ms.
- [x] ✅ Nhận focus khi đang ở Notepad, Explorer, Windows Terminal, Chrome (spike Task 1 và Task 2).
- [x] ✅ Nhấn lại khi đang mở: không đóng, chỉ đưa lên trước (Task 2).
- [ ] 👤 Nhấn phím tắt khi một app chạy **quyền admin** đang ở trước. Windows có thể không cho lấy focus (UIPI). Chưa thử vì cần bấm UAC.

## 2. App (tiêu chí 2, 3)

- [x] ✅ 187 app (196 trước khi lọc link web và trình gỡ cài đặt). Danh sách trả về trong 5ms trên bản release.
- [x] ✅ Kết quả chạy thật:
  - `code` → Visual Studio Code;
  - `term` → Terminal;
  - `vsc` → Visual Studio Code;
  - `sett` → Settings, WSL Settings.
- [x] ✅ Icon thật cho app desktop và app Store. Tạo sẵn 187 icon lúc khởi động; lấy 32 icon mất 129ms.
- [ ] 👤 Enter mở một app desktop (VS Code) và một app Store (Calculator). Ctrl+Enter trên VS Code mở thư mục cài. Mình không tự mở app trên máy bạn.

## 3. File (tiêu chí 4, 5)

- [x] ✅ Windows Search, bản release:

  | Gõ | Thời gian | Kết quả |
  |---|---|---|
  | `brief` | 137ms | 20 |
  | `spec` | 148ms | 9 |
  | `config` | 172ms | 20 |
  | `invoice` | 111ms | 3 |
  | `*.pdf` | 107ms | 20 |

- [x] ⚠️ Cộng thêm 120ms chờ gõ xong: tối đa khoảng 292ms, sát mục tiêu 300ms.
- [x] ✅ Không có Everything: `auto` tự dùng Windows Search. DLL ARM64 kèm theo app nạp được và báo "Everything không chạy" ngay (test Rust).
- [x] ✅ Thư mục rác được loại: `node_modules`, `target`, `AppData`, `.cargo`, `.rustup`, `.venv`, `__pycache__`.
- [ ] 👤 **Có Everything:** tìm file ngoài thư mục người dùng. Cần cài Everything, chưa kiểm.
- [ ] 👤 **Ctrl+Enter trên file:** Explorer mở và chọn đúng file.
- [x] ✅ Nguồn file lỗi: nhóm File hiện một dòng mờ giải thích, các nhóm khác vẫn chạy (test component).

## 4. Máy tính, đổi đơn vị (tiêu chí 6)

- [x] ✅ Kết quả hiển thị:
  - `12*7+3` → `= 87`;
  - `2^10` → `= 1,024`;
  - `sqrt(144)` → `= 12`;
  - `5 km to mi` → `3.10686 mi`;
  - `30 c to f` → `86 °F`.

  Có 72 test cho phần này.
- [x] ✅ Bạn đã thử: phép tính hoạt động. Enter copy số trơn, có toast.
- [x] ✅ Sửa trong Task 13: khi có kết quả tính, không còn thêm dòng "Tìm trên Google" bên dưới.

## 5. Web (tiêu chí 7)

- [x] ✅ `? lofi` ra Google, YouTube, Reddit, X, trang ưu tiên đứng đầu. `/g`, `/y`, `/r`, `/x` tìm đúng một trang.
- [x] ✅ Bạn đã thử: `/y lofi` + Enter mở YouTube.
- [x] ✅ Rust từ chối `javascript:`, `file:`, `ms-settings:`, và địa chỉ có dấu cách.

## 6. Gần đây (tiêu chí 8)

- [x] ✅ Ô trống hiện "Gần đây" theo thứ tự dùng: Cài đặt winbar ×2, rồi file, rồi app. File không còn tồn tại bị bỏ.
- [x] ✅ Bản release: ghi 1 mục → khởi động lại app → `history_list` vẫn trả về mục đó. Đã xóa lịch sử thử sau khi kiểm.

## 7. Vị trí (tiêu chí 9)

- [x] ✅ Kéo (-300, +150) → lưu (247, 470). Ẩn rồi mở lại, và khởi động lại app: vẫn đúng chỗ (Task 3).
- [x] ✅ Vị trí đã lưu nằm ngoài mọi màn hình: mở ở vị trí mặc định, không xóa vị trí đã lưu (Task 3 + test Rust).
- [ ] 👤 Rút màn hình phụ đang chứa command bar. Máy này chỉ có 1 màn.

## 8. Đóng và gõ tiếng Việt (tiêu chí 10)

- [x] ✅ Chỉ Esc (ô trống, đang focus) mới đóng. Esc khi có chữ chỉ xóa chữ. Click ra ngoài và chạy kết quả không đóng (Task 2).
- [x] ✅ Mất focus thì viền mờ đi; bấm vào bar thì con trỏ về ô nhập (Task 2).
- [ ] 👤 Gõ tiếng Việt bằng UniKey hoặc bàn phím Telex của Windows, rồi Enter ngay khi đang ghép chữ.
  Code bỏ qua phím khi `isComposing`. UniKey không dùng cơ chế ghép chữ của Windows nên không bị ảnh hưởng.

## 9. Widget và Cài đặt (tiêu chí 11, 12)

- [x] ✅ `demo` → nhóm Demo. Tắt widget demo → nhóm biến mất ngay, bật lại thì hiện lại (Task 4).
- [x] ✅ Cài đặt › Command bar:
  - chọn YouTube → `? lofi` đưa YouTube lên đầu;
  - Tắt tìm file → `/f` không ra file;
  - trạng thái nguồn đúng (Everything không chạy, đang dùng Windows Search, 223ms);
  - "Đặt lại vị trí" hoạt động (Task 12).

## 10. Hiệu năng khi đứng yên (tiêu chí 13)

Bản release, không bật cổng debug. Đo từ giây thứ 60 sau khi mở: icon app được tạo nền lúc khởi động. Command bar đóng, notch thu gọn, 8 tiến trình.

| Thời điểm | Task Manager ("Memory") | Private bytes |
|---|---|---|
| +38s | 109.6 MB | 179.5 MB |
| +76s | 109.3 MB | 179.1 MB |
| +113s | 109.2 MB | 179.0 MB |
| +151s | 115.6 MB | 186.2 MB |

- [x] ✅ CPU trung bình 0.022% trên 12 nhân. RAM theo Task Manager 109–116 MB, dưới 150 MB.
- [x] ⚠️ So với notch-shell (78 MB): tăng khoảng 30–38 MB. Gồm WebView thứ hai (spike: +17–22 MB), React của command bar, danh sách app và icon trong bộ nhớ.
  Còn dư ~35 MB cho media, clipboard và Claude: cần đo lại sau mỗi module.

## 11. So với mockup (tiêu chí 14)

Mockup được dựng bằng Edge chạy ẩn (profile riêng): khung command bar 585×463 ở tỉ lệ 0.887, tức rộng 660. Ảnh app chụp trên bản release 825px ở 125%, cũng là 660.

- [x] ✅ **Khớp:**
  - rộng 660, bo góc 20;
  - hàng trên: tay nắm ⠿, kính lúp, chữ 18px, nút "Xóa";
  - tiêu đề nhóm viết hoa;
  - dòng: ô icon 32, tên, dòng phụ; dòng đang chọn nền sáng + "Mở ↵";
  - khối máy tính `= 87` chữ mono lớn;
  - hàng gợi ý phím dưới cùng.
- [x] ⚠️ **Khác có chủ đích:**
  - nền không blur: quyết định css-dense của notch-shell;
  - icon thật thay cho ô chữ màu;
  - hàng gợi ý ghi `/f` và `/g /y /r /x` theo lệnh bạn chốt;
  - mở/đóng chỉ mờ dần, dòng chọn không trượt (M11, M12 bản v1).

## 12. Tự động (tiêu chí 15)

- [x] ✅ `npm test`: 29 file, 280 test.
- [x] ✅ `cargo test`: 72 test. `cargo clippy -D warnings`: sạch.
- [x] ✅ `npm run lint`: sạch.
- [x] ✅ `npm run tauri build -- --no-bundle`: `winbar.exe` 4.5 MB.

## Dọn dẹp sau lần chạy 2026-09-17

- [x] Gỡ `Run\winbar` do bản release thêm vào.
- [x] Xóa lịch sử thử.
- [x] Trả `settings.json` từ bản sao lưu: bản release đã bỏ các widget demo khỏi file.
- [x] Tắt bản release và Edge chạy ẩn.
- [x] Mở lại app dev.
