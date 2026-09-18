# Checklist thủ công: clipboard

> Spec: `SPEC-clipboard.md` §11 · Chạy lần đầu: 2026-09-18 (Task 1–5)
> Máy: Windows 11 Pro ARM64, 12 nhân, RAM 31.6 GB, màn 1920×1200 ở 125%, WebView2 153
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
> Ngày 2026-09-18 cách làm cũ đã xóa mất ~7 mục thật của Lauren. Script giờ dùng `snapshot` + `remove-new`.

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
| Chữ | Kéo HTML5 của WebView2, `text/plain` | [ ] 👤 |
| Ảnh | `tauri-plugin-drag` 2.1.1 → `DoDragDrop` + `CF_HDROP` | [ ] 👤 |

- [x] ✅ Plugin đã nạp và được cấp quyền trên app thật (gọi `plugin:drag|start_drag` đi tới được lệnh).
- [x] ✅ Nội dung đầy đủ được đọc **trước** khi kéo (lúc chuột chạm dòng), không phải đoạn preview 200 ký tự.
- [ ] 👤 **Không tự kiểm được:** kéo thật cần thao tác chuột thật. Kéo một dòng chữ thả vào Notepad, và một dòng
      ảnh thả vào Explorer (phải ra file `.png`) hoặc vào Word/Paint.

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

Xem bảng số ở mục 10 dưới.

## 10. Số đo bản release

_(điền sau khi đo)_

## 11. Chưa làm / giới hạn đã biết

- Copy **file** (`CF_HDROP`) không được lưu — bạn chốt "chỉ chữ và ảnh".
- Ảnh lớn hơn 64 MB (dạng DIB trong bộ nhớ) bị bỏ qua.
- Text dài hơn 100 000 ký tự bị cắt, dòng ghi "đã cắt bớt".
- Lịch sử không đồng bộ giữa các máy, và không có tìm kiếm trong nội dung đầy đủ — chỉ tìm trong preview 200 ký tự.
