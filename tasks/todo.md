# Tasks: clipboard

> Plan: `tasks/plan.md` · Spec: `SPEC-clipboard.md`
> Lệnh chung: `npm test` · `cargo test --manifest-path src-tauri/Cargo.toml` · `npm run lint` · `npm run tauri dev`

### Task 1: Spike — bắt clipboard và thử kéo ra ngoài ✅

**Đã làm:**
- Bật `Win32_System_DataExchange`, `Win32_System_Memory`, `Win32_System_Ole` cho crate `windows`.
- `clipboard/native.rs`: cửa sổ message-only riêng (**không** dùng subclass của notch — notch bị đóng/mở lại khi đổi màn hình), `AddClipboardFormatListener`.
- **Hai luồng:** luồng cửa sổ chỉ báo hiệu; luồng đọc chờ 60 ms rồi mới mở clipboard.
- `clipboard/mod.rs`: `Sighting` (loại, cỡ, app nguồn, cờ riêng tư, danh sách format) + lệnh `clipboard_probe`. Không ghi và không phát nội dung.

**Tiêu chí chấp nhận:**
- [x] Copy chữ và copy ảnh: nhận đúng loại trong 1 giây (chữ 41 ký tự; ảnh 12 424 byte `CF_DIBV5`; file `CF_HDROP`), kèm app nguồn `powershell`.
- [x] Cờ trình quản lý mật khẩu đọc được: `ExcludeClipboardContentFromMonitorProcessing` → riêng tư; `CanIncludeInClipboardHistory` = 0 → riêng tư; = 1 → bình thường.
- [x] Copy liên tục 20 lần trong 1,3 giây: app không treo, **0 lần copy bị từ chối**, 20 lần gộp còn 1 lần đọc.
- [ ] Kéo ra ngoài: xem bảng dưới — cần bạn chọn hướng.

**Kiểm tra:** `cargo test` (113 pass, 7 test mới), clippy sạch; thử trên app thật qua CDP.

#### Chuyện đã sửa giữa chừng

Bản đầu đọc clipboard ngay trong `WM_CLIPBOARDUPDATE`. Windows chỉ cho **một** tiến trình giữ clipboard, và app đang copy
không thử lại — nên copy liên tục làm PowerShell báo *"Requested Clipboard operation did not succeed"*. Đổi sang đọc trễ
trên luồng nền thì hết (0/20 lỗi). Đây cũng là lý do nhiều app "đứng hình khi copy" khi cài trình quản lý clipboard.

#### Kéo ra app khác — tình hình

| Kéo cái gì | WebView2 làm được? | Ghi chú |
|---|---|---|
| Chữ | Được | Kéo HTML5 bình thường của Chromium, không cần gì thêm |
| **File ảnh** | Chưa chắc | Cần Windows `DoDragDrop` + `CF_HDROP`. Chromium có `DownloadURL` nhưng WebView2 nhúng thường không nối phần này |

**Bạn chọn:** thêm `tauri-plugin-drag` 2.1.1 — sẽ thêm ở Task 4, lúc dùng tới. 👤 Kéo thật bằng chuột vẫn cần bạn thử tay ở Task 4.

**Phụ thuộc:** không
**Quy mô:** M

### Task 2: Rust — lưu trữ, dọn, lọc nhạy cảm

**Mô tả:**
- **`model.rs`:** phân loại text/link/code, cắt preview 200 ký tự, dọn theo 50 mục + hạn giữ, giữ mục ghim.
- **`secrets.rs`:** nhận diện key/token theo spec §5.4 lớp 2.
- **`store.rs`:** `index.json`, ảnh PNG + thumbnail 160px, ghi tạm rồi đổi tên.
- **Lệnh:** `clipboard_list`, `clipboard_copy`, `clipboard_pin`, `clipboard_remove`, `clipboard_clear`, `clipboard_pause`, `clipboard_text`; sự kiện `clipboard-changed`, `clipboard-skipped`.

**Tiêu chí chấp nhận:**
- [ ] Copy 3 thứ khác loại: `clipboard_list` trả đúng thứ tự mới nhất trước, đúng loại.
- [ ] Copy quá 50 mục: mục cũ nhất biến mất, mục ghim còn nguyên.
- [ ] Copy chuỗi `sk-…`, JWT, `password=…`, và copy từ app trong danh sách bỏ qua: **không** vào lịch sử, có sự kiện `clipboard-skipped`.
- [ ] `clipboard_copy` đưa lại đúng nội dung vào clipboard; winbar không tự bắt lại mục đó.
- [ ] Test Rust cho `model.rs`, `secrets.rs`, đọc/ghi index hỏng.

**Phụ thuộc:** Task 1
**Quy mô:** L (nếu quá thì tách lọc nhạy cảm ra task riêng)

### Task 3: Card "Clipboard"

**Mô tả:** danh sách cuộn theo mockup, ô tìm (không dấu), chip lọc, bấm để copy lại (pill nháy "Đã copy"), ghim, xóa, xóa tất cả có xác nhận, nút tạm dừng, dòng "đã bỏ qua một mục nhạy cảm".

**Tiêu chí chấp nhận:**
- [ ] Copy vài thứ rồi mở panel: danh sách đúng, ảnh có thumbnail.
- [ ] Bấm item: dán ra Notepad đúng nội dung.
- [ ] Ghim/xóa/xóa tất cả hoạt động, có xác nhận cho "xóa tất cả".
- [ ] Tạm dừng: không ghi gì, trạng thái nhớ sau khi khởi động lại.
- [ ] Test component + test lọc/tìm thuần.

**Phụ thuộc:** Task 2
**Quy mô:** M

## Checkpoint: bạn dùng thử vài hôm

- [ ] Bạn kiểm: đúng thứ cần, không lưu nhầm thứ nhạy cảm, tốc độ ổn

### Task 4: Kéo ra app khác + command bar + Cài đặt

**Tiêu chí chấp nhận:**
- [ ] Kéo chữ vào Notepad ra đúng nội dung; ảnh theo kết luận của Task 1.
- [ ] Command bar: `cb` + từ khóa ra item, Enter copy lại, không vào "Gần đây".
- [ ] Cài đặt: thời gian giữ 1/2 ngày, danh sách app bỏ qua, nút xóa toàn bộ lịch sử.

**Phụ thuộc:** Checkpoint
**Quy mô:** M

### Task 5: Đo, checklist thủ công

**Tiêu chí chấp nhận:**
- [ ] Bản release, 50 mục có 5 ảnh: RAM tăng ≤ 15 MB; CPU khi panel đóng như trước module.
- [ ] `tests/manual-clipboard.md` theo tiêu chí §11 của spec.

**Phụ thuộc:** Task 4
**Quy mô:** S
