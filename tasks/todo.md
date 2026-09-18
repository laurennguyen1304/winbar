# Tasks: clipboard

> Plan: `tasks/plan.md` · Spec: `SPEC-clipboard.md`
> Lệnh chung: `npm test` · `cargo test --manifest-path src-tauri/Cargo.toml` · `npm run lint` · `npm run tauri dev`

### Task 1: Spike — bắt clipboard và thử kéo ra ngoài

**Mô tả:**
- **Feature:** bật `Win32_System_DataExchange` cho crate `windows`.
- **Nghe clipboard:** `AddClipboardFormatListener` trên cửa sổ notch chính; `WM_CLIPBOARDUPDATE` vào subclass đã có.
- **Đọc thử:** text (`CF_UNICODETEXT`) và ảnh (`CF_DIB`); ghi log **chỉ** loại + độ dài, không ghi nội dung.
- **Thử kéo:** trang thử trong notch: kéo một chuỗi và một file ảnh ra Notepad / Explorer; kết luận WebView2 làm được tới đâu.

**Tiêu chí chấp nhận:**
- [ ] Copy chữ và copy ảnh: log ghi đúng loại, trong 1 giây.
- [ ] Cờ của trình quản lý mật khẩu (`ExcludeClipboardContentFromMonitorProcessing`…) đọc được.
- [ ] Kết luận rõ về kéo: chữ được / không; file ảnh được / không; nếu không thì phương án nào.
- [ ] App không treo khi copy liên tục 20 lần.

**Kiểm tra:** `cargo test`, clippy; thủ công trên app thật.

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
