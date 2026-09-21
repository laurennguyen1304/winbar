# Checklist thủ công: clipboard

> Spec: `SPEC-clipboard.md` §11 · Chạy lần đầu: 2026-09-18 (Task 1–5)
> Máy: Windows 11, màn 1920×1200 ở 125%, WebView2 153
>
> Ký hiệu: ✅ qua · 👤 bạn cần tự kiểm · ⚠️ qua nhưng có ghi chú

## Cách chạy

| Việc | Lệnh |
|---|---|
| Tự động | `npm test` · `cargo test --manifest-path src-tauri/Cargo.toml` · `npm run lint` |
| Đọc lịch sử qua app đang chạy | `node clip-task2.mjs list` (scratchpad) |
| Copy thử nhiều loại | `clip-task2.ps1` — **luôn** ghi lại id có sẵn trước rồi chỉ xóa mục do test tạo |
| Cờ riêng tư kiểu trình quản lý mật khẩu | `clip-private.ps1` |

> ⚠️ **Quy tắc bắt buộc khi test trên máy thật:** không bao giờ gọi `clipboard_clear` hay chép đè thư mục
> `%APPDATA%\winbar\clipboard` khi app đang chạy. App giữ danh sách trong bộ nhớ và sẽ ghi đè file ngay sau đó.
> Ngày 2026-09-18 cách làm cũ đã xóa mất ~7 mục thật của chủ dự án. Script giờ dùng `snapshot` + `remove-new`.

## 1. Bắt được copy, đúng loại (tiêu chí 1, 2)

Copy 4 thứ rồi đọc `clipboard_list`:

| Copy | Nhận được |
|---|---|
| Câu chữ thường | `text`, 41 ký tự, app `powershell` |
| `https://tauri.app/v2/guides/` | `link` |
| `fn main() { … }` | `code` |
| Ảnh 640×400 | `image`, preview "Ảnh 640×400", có thumbnail |

- [x] ✅ Mục mới hiện đầu danh sách trong 1 giây (chờ 0,4 s giữa các lần copy vẫn kịp).
- [x] ✅ Ảnh có thumbnail thật trong card và ghi đúng kích thước.
- [x] ✅ Mỗi dòng ghi tên app đã copy (`powershell`, `chrome`, `Monosnap`).

## 2. Copy lại (tiêu chí 3)

- [x] ✅ `clipboard_copy` đưa lại đúng link vào clipboard; danh sách **không** tăng thêm mục (không tự bắt lại mình).
- [x] ✅ Dòng nháy "Đã copy" 1,2 giây (test component).
- [x] ✅ Pill nháy "Đã copy" khi panel đóng lại (test component; `shell.flashPill`).
- [ ] 👤 Bấm một dòng rồi dán ra Notepad bằng tay: ra đúng nội dung.

## 3. Ghim và dọn (tiêu chí 4, 5)

- [x] ✅ Copy 55 lần khi đang có 1 mục ghim: còn **51 mục** = 50 chưa ghim + mục ghim.
- [x] ✅ Mục cũ nhất biến mất trước.
- [x] ✅ Dọn theo hạn giữ: test Rust (`prune`) cho cả hai luật và cho mục ghim.
- [ ] 👤 Đổi hạn giữ 1 ↔ 2 ngày trong Cài đặt rồi để qua đêm, xem mục hôm qua còn hay mất.

## 4. Kéo ra app khác (tiêu chí 6)

| Kéo gì | Cách làm | Trạng thái |
|---|---|---|
| Ảnh | `tauri-plugin-drag` 2.1.1 → `DoDragDrop` + `CF_HDROP` | [x] ✅ chủ dự án xác nhận chạy (20/09) |
| Chữ | **Bỏ hẳn** | — |

- [x] ✅ Plugin đã nạp và được cấp quyền trên app thật (gọi `plugin:drag|start_drag` đi tới được lệnh).
- [x] ✅ **Kéo chữ: bỏ (20/09).** chủ dự án thử trên máy thật — ảnh kéo được, chữ thì không. Kéo HTML5 của WebView2
      **không** được chuyển ra Windows. Chủ dự án nói không cần kéo chữ, chỉ cần bấm là copy. Nên dòng chữ không còn
      nhận `draggable`, và bỏ luôn phần rê chuột đọc trước nội dung.
- [x] ✅ Kiểm trên app đang chạy sau khi sửa: dòng ảnh `draggable=true`, con trỏ `grab`; dòng chữ
      `draggable=false`, con trỏ `pointer`.
- [x] ✅ **Bấm dòng chữ thì copy** — chạy thật hai lần (trước và sau khi sửa): clipboard nhận đúng nội dung dòng
      đó. Ảnh đang nằm trên clipboard của chủ dự án được lưu ra file rồi trả lại nguyên vẹn, cả hai lần.

## 5. Nội dung nhạy cảm (tiêu chí 7)

Bốn lớp của §5.4:

| Lớp | Thử gì | Kết quả |
|---|---|---|
| 1. Cờ của app | Copy kèm `ExcludeClipboardContentFromMonitorProcessing` | ✅ không lưu |
| 1. Cờ của app | `CanIncludeInClipboardHistory` = 0 | ✅ không lưu |
| 1. Cờ của app | Cùng format nhưng = 1 | ✅ có lưu (không nhận nhầm) |
| 2. Mẫu chuỗi | `sk-proj-…`, `password=hunter22` | ✅ không lưu, danh sách đứng yên |
| 2. Mẫu chuỗi | JWT, `ghp_…`, `AKIA…`, `-----BEGIN … PRIVATE KEY-----` | ✅ test Rust |
| 2. Mẫu dễ nhầm | Hash git 40 ký tự, câu tiếng Việt, đường dẫn Windows, đoạn code | ✅ **có** lưu, không nhận nhầm |
| 3. Danh sách app | 8 trình quản lý mật khẩu mặc định | ✅ test Rust; [ ] 👤 thử với app thật |
| 4. Tạm dừng | Nút trong card và trong Cài đặt | ✅ test component |

- [ ] 👤 **Việc quan trọng nhất cần bạn soi:** dùng vài hôm rồi mở lịch sử xem có mục nào đáng lẽ không được lưu.
      Cách lọc theo mẫu chuỗi không thể bắt hết mọi loại bí mật — ví dụ mật khẩu là một từ thường như `hoa2024`
      thì không có dấu hiệu nào để nhận ra. Trình quản lý mật khẩu nào đặt cờ đúng thì lớp 1 chặn được.

## 6. Tạm dừng (tiêu chí 8)

- [x] ✅ Bật/tắt được từ card và từ Cài đặt; nút đổi nhãn thành "Đang tạm dừng".
- [x] ✅ Trạng thái nằm trong `settings.json` nên nhớ sau khi khởi động lại.
- [ ] 👤 Bật tạm dừng, copy vài thứ, xem lịch sử đứng yên; tắt đi thì ghi tiếp.

## 7. Command bar (tiêu chí 9)

- [x] ✅ Gõ `cb`: hiện các mục mới nhất, kèm tên app, dòng đang chọn ghi "Copy ↵".
- [x] ✅ Gõ `unboxing` (không cần prefix): đúng 2 mục khớp, không nhóm nào khác chen vào.
- [x] ✅ Không vào "Gần đây": provider không gọi `history.record` — không có đường nào để item lọt vào.
- [ ] 👤 Ctrl+Enter trên một dòng ảnh: mở file ảnh.

## 8. Riêng tư (tiêu chí 10)

- [x] ✅ `index.json` chỉ chứa mục đã được nhận; mục bị bỏ qua không bao giờ chạm đĩa.
- [x] ✅ Log của app không có nội dung clipboard — chỉ loại, cỡ, tên app, danh sách format.
- [x] ✅ Sự kiện `clipboard-skipped` chỉ mang lý do (`app-flag` · `secret` · `ignored-app` · `paused`).
- [x] ✅ Nội dung đầy đủ chỉ rời Rust khi card hỏi đúng một mục theo id (`clipboard_text`).
- [x] ✅ `Store::open` dọn file ảnh mồ côi, trừ khi index hỏng (lúc đó ảnh là thứ duy nhất còn lại).
- [ ] ⚠️ Thư mục `%APPDATA%\winbar\clipboard` **không mã hóa**. Ai đọc được máy bạn thì đọc được lịch sử.

## 9. Hiệu năng (tiêu chí 11)

Bản release, notch ở **cả 2 màn** (`pill.monitor = all`, sticky bật) — đúng cấu hình bạn đang dùng, nên mốc so sánh
là số của notch-shell v3 ở chế độ `all`: **146–149 MB, 9 tiến trình, CPU 0,006–0,014%**.

| Trạng thái | RAM (private WS) | CPU, panel đóng | Tiến trình |
|---|---|---|---|
| Trước module (mốc v3, `all`) | 146–149 MB | 0,006–0,014% | 9 |
| Lịch sử rỗng | 150,2–153,8 MB | 0,019% (48 s) | 9 |
| **50 mục (45 chữ + 5 ảnh)** | **160,6–161,3 MB** | **0,010% (89 s)** | 9 |

- [x] ✅ RAM tăng **≈ 13 MB** so với trước module (yêu cầu ≤ 15 MB) — sát trần, chủ yếu là thumbnail và index
      trong bộ nhớ. Nếu sau này thấy chật thì bỏ thumbnail khỏi bộ nhớ, chỉ đọc khi dòng hiện ra.
- [x] ✅ CPU khi panel đóng cùng bậc với trước module; lịch sử đầy **không** đắt hơn lịch sử rỗng.
- [x] ✅ Đĩa: `index.json` 23 KB · 5 ảnh 1920×1080 → 102 KB · thumbnail 12 KB.
- [x] ✅ RAM đứng yên qua 4 lần đo trong 89 giây (160,6 → 161,3 MB), không leo.

> Bản đo là commit `1b55dc2`. Hai commit sau đó (`same_content` không còn gộp hai ảnh khác nhau, và `insert` xóa
> luôn file của mục bị thay) chỉ **giảm** dung lượng đĩa, không đổi số RAM/CPU.

## 10. Việc để lại trên máy sau khi đo

- [x] ✅ Lịch sử thật được **chuyển** đi (không phải chép) trong lúc **cả hai** app đều đã tắt, rồi chuyển lại.
- [x] ✅ Khóa `Run\winbar` do bản release tự thêm đã bị xóa.
- [x] ✅ `settings.json` khôi phục từ bản sao (`monitor = all`, `sticky = true`, 8 widget).

## 11. Lỗi tìm ra khi dùng thật (2026-09-18)

Bạn báo: "phần clipboard kéo dài gần hết màn hình" và "chữ/link không copy và không kéo thả được, ảnh thì được".

**Hai triệu chứng là một lỗi.** Cửa sổ notch có chặn ở 80% màn hình (864 px) nhưng **nội dung thì không**:
card clipboard cao 1501 px, nên mọi dòng từ 864 px trở xuống nằm **ngoài cửa sổ** — thấy được nhưng không bấm,
không kéo được. Ảnh của bạn là item mới nhất nên ở trên cùng, trong vùng sống; chữ và link nằm dưới. Không liên
quan gì tới loại nội dung: `clipboard_copy` trên một item chữ chạy đúng, đưa đủ 1597 ký tự vào clipboard.

| | Trước | Sau |
|---|---|---|
| Chiều cao cửa sổ | 864 px | **595 px** |
| Đáy card | 1554 px (ngoài cửa sổ 690 px) | 583 px (trong cửa sổ) |
| Danh sách | không cuộn, cao 1343 px | cuộn được, cao 372 px |
| Dòng bấm được | 13/23 | **23/23** |

Sửa: `panelMaxHeight()` dùng chung cho cả cửa sổ lẫn nội dung, và danh sách clipboard chặn ở ~7 dòng.
Test `notch-sizes.test.ts` giữ cho hai con số đó luôn bằng nhau.

## 12. Chưa làm / giới hạn đã biết

- Copy **file** (`CF_HDROP`) không được lưu — bạn chốt "chỉ chữ và ảnh".
- Ảnh lớn hơn 64 MB (dạng DIB trong bộ nhớ) bị bỏ qua.
- Text dài hơn 100 000 ký tự bị cắt, dòng ghi "đã cắt bớt".
- Lịch sử không đồng bộ giữa các máy, và không có tìm kiếm trong nội dung đầy đủ — chỉ tìm trong preview 200 ký tự.
