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
- [x] Kéo ra ngoài: kết luận rõ — xem bảng dưới.

**Kiểm tra:** `cargo test` (113 pass, 7 test mới), clippy sạch; thử trên app thật qua CDP.

#### Chuyện đã sửa giữa chừng

Bản đầu đọc clipboard ngay trong `WM_CLIPBOARDUPDATE`. Windows chỉ cho **một** tiến trình giữ clipboard, và app đang copy
không thử lại — nên copy liên tục làm PowerShell báo *"Requested Clipboard operation did not succeed"*. Đổi sang đọc trễ
trên luồng nền thì hết (0/20 lỗi). Đây cũng là lý do nhiều app "đứng hình khi copy" khi cài trình quản lý clipboard.

#### Kéo ra app khác — tình hình

| Kéo cái gì | WebView2 làm được? | Ghi chú |
|---|---|---|
| Chữ | Được | Kéo HTML5 bình thường của Chromium, không cần gì thêm |
| **File ảnh** | Không | Cần Windows `DoDragDrop` + `CF_HDROP`; WebView2 nhúng không nối phần `DownloadURL` của Chromium |

**Bạn chọn:** thêm `tauri-plugin-drag` 2.1.1 — sẽ thêm ở Task 4, lúc dùng tới. 👤 Kéo thật bằng chuột vẫn cần bạn thử tay ở Task 4.

**Phụ thuộc:** không
**Quy mô:** M

### Task 2: Rust — lưu trữ, dọn, lọc nhạy cảm ✅

**Đã làm:**
- **`model.rs`:** phân loại text/link/code, cắt preview 200 ký tự, cắt text quá dài (100 000 ký tự), dọn theo 50 mục + hạn giữ, giữ mục ghim, gộp bản copy trùng.
- **`secrets.rs`:** nhận diện key/token theo spec §5.4 lớp 2 — kèm cả mẫu dễ nhầm (hash git, câu tiếng Việt, chuỗi in hoa dài).
- **`store.rs`:** `index.json` + `images/` + `thumbs/`, ghi tạm rồi đổi tên; xóa mục thì xóa luôn file ảnh; index hỏng thì giữ `.bak`.
- **`image.rs`:** DIB → PNG + thumbnail 160 px bằng WIC, và PNG → DIB khi copy lại (phần đọc header BMP là thuần, có test).
- **Lệnh:** `clipboard_list`, `clipboard_text`, `clipboard_copy`, `clipboard_pin`, `clipboard_remove`, `clipboard_clear`, `clipboard_pause`, `clipboard_status`; sự kiện `clipboard-changed`, `clipboard-skipped`.
- **Cài đặt:** `clipboard.retentionDays` (1–2), `clipboard.ignoredApps` (8 app mặc định), `clipboard.paused`.

**Tiêu chí chấp nhận:**
- [x] Copy 4 thứ khác loại: danh sách đúng thứ tự mới nhất trước, đúng loại (`text`, `link`, `code`, `image` — ảnh ghi "Ảnh 320×200").
- [x] Copy 55 lần + 1 mục ghim: còn 51 mục = 50 chưa ghim + mục ghim.
- [x] Copy `sk-proj-…` và `password=hunter22`: danh sách vẫn 4 mục, không lưu gì.
- [x] `clipboard_copy` đưa lại đúng link vào clipboard, danh sách vẫn 4 mục — không tự bắt lại.
- [x] Test Rust: 152 pass (thêm 39 test mới), clippy sạch, TS 351 pass.

**Ghi chú:** luồng đọc gọi `CoInitializeEx` vì WIC là COM.

**Phụ thuộc:** Task 1
**Quy mô:** L

### Task 3: Card "Clipboard" ✅

**Đã làm:** card `tall` theo mockup — ô tìm (không dấu), 5 chip lọc, danh sách cuộn, mỗi dòng có icon theo loại
hoặc thumbnail 84×52, tên app, thời gian tương đối; hover ra nút ghim và nút xóa; bấm dòng thì copy lại và nháy
"Đã copy"; nút Tạm dừng ở header; "Xóa tất cả" có xác nhận; dòng "Đã bỏ qua một mục nhạy cảm".
Thumbnail lấy từng dòng một qua lệnh mới `clipboard_thumb` (data URL) thay vì nhét cả megabyte ảnh vào danh sách.

**Tiêu chí chấp nhận:**
- [x] Copy 4 thứ rồi mở panel trên app thật: đủ 4 dòng, đúng thứ tự, ảnh có thumbnail, mỗi dòng ghi app nguồn.
- [x] Bấm item: clipboard đổi đúng (đã kiểm ở Task 2), dòng nháy "Đã copy".
- [x] Ghim / xóa / xóa tất cả có xác nhận — test component.
- [x] Tạm dừng: đổi được, nút đổi nhãn thành "Đang tạm dừng"; trạng thái nằm trong `settings.json` nên nhớ sau khi khởi động lại.
- [x] Test: 21 test mới (12 lọc/tìm thuần + 9 component), tổng TS 372 pass; Rust 154 pass; clippy sạch.

**Thêm ngoài kế hoạch:** `Store::open` dọn file ảnh mồ côi (không dòng nào trỏ tới) — trừ khi index hỏng, vì lúc
đó ảnh là thứ duy nhất còn lại. Phát hiện ra vì script test của tôi để lại đúng loại rác này trên máy bạn.

**Phụ thuộc:** Task 2
**Quy mô:** M

## Checkpoint: bạn dùng thử vài hôm

- [ ] Bạn kiểm: đúng thứ cần, không lưu nhầm thứ nhạy cảm, tốc độ ổn

### Task 4: Kéo ra app khác + command bar + Cài đặt ✅ (còn 👤 kéo bằng chuột thật)

**Đã làm:**
- **Kéo:** `drag.ts` — chữ đi bằng kéo HTML5 của WebView2, ảnh đi bằng `tauri-plugin-drag` 2.1.1 (Windows `DoDragDrop` + `CF_HDROP`), thumbnail làm ảnh xem trước. Nội dung đầy đủ được đọc **trước** khi kéo (lúc chuột chạm dòng) vì `dragstart` không chờ được.
- **Command bar:** provider `clipboard`, nhóm "Clipboard", tiền tố `cb`. Gõ `cb` một mình thì hiện mục mới nhất; gõ từ khóa (≥ 2 ký tự) thì lọc, không dấu cũng ra. Enter copy lại, Ctrl+Enter mở file ảnh. Provider **không** gọi `history.record` nên item clipboard không bao giờ vào "Gần đây".
- **Cài đặt:** mục "Clipboard" — giữ 1/2 ngày, nút Đang ghi/Đang tạm dừng, danh sách app bỏ qua (thêm/xóa/đặt lại mặc định), "Xóa toàn bộ lịch sử" có xác nhận.

**Tiêu chí chấp nhận:**
- [x] Command bar trên app thật: `cb` ra 7 mục mới nhất kèm tên app và chữ "Copy ↵"; gõ "unboxing" ra đúng 2 mục, không nhóm nào khác chen vào.
- [x] Không vào "Gần đây": provider không ghi lịch sử — không có đường nào để item lọt vào.
- [x] Cài đặt trên app thật: đủ 4 dòng, có mục "Clipboard" ở thanh bên.
- [x] Plugin kéo đã nạp và được cấp quyền (gọi `plugin:drag|start_drag` đi tới được lệnh, chỉ lỗi vì tôi cố tình gửi sai tham số).
- [ ] 👤 **Cần bạn thử bằng chuột thật:** kéo một dòng chữ thả vào Notepad, và kéo một dòng ảnh thả vào Explorer / Word. Tôi không tự kéo được vì không tạo được thao tác chuột thật trên máy bạn.

**Test:** 392 test TS (thêm 20: 8 command bar, 5 kéo, 7 Cài đặt), Rust 155, clippy sạch.

**Phụ thuộc:** Checkpoint
**Quy mô:** M

### Task 5: Đo, checklist thủ công ✅

**Đo trên bản release** (notch ở cả 2 màn, đúng cấu hình bạn đang dùng; mốc so sánh là notch-shell v3 chế độ `all`:
146–149 MB, CPU 0,006–0,014%):

| Trạng thái | RAM | CPU, panel đóng |
|---|---|---|
| Lịch sử rỗng | 150,2–153,8 MB | 0,019% |
| 50 mục (45 chữ + 5 ảnh) | 160,6–161,3 MB | 0,010% |

**Tiêu chí chấp nhận:**
- [x] RAM tăng **≈ 13 MB** (yêu cầu ≤ 15 MB) — sát trần.
- [x] CPU khi panel đóng cùng bậc với trước module; lịch sử đầy không đắt hơn lịch sử rỗng.
- [x] Đĩa: index 23 KB + 5 ảnh 102 KB + thumbnail 12 KB. RAM đứng yên qua 89 giây.
- [x] `tests/manual-clipboard.md` viết xong theo 12 tiêu chí của spec §11.
- [x] Dọn sạch sau khi đo: lịch sử thật trả về, khóa `Run\winbar` đã xóa, `settings.json` khôi phục.

**Hai lỗi đo xong mới lộ ra (đã sửa):**
1. `same_content` gộp **hai ảnh khác nhau cùng kích thước** thành một — hai ảnh chụp cùng cửa sổ có preview giống
   nhau ("Ảnh 1920×1080"), nên bản mới sẽ âm thầm đè mất bản cũ. Giờ chỉ **chữ** mới được coi là trùng nhau.
2. `insert` bỏ mục trùng nhưng **không xóa file ảnh** của nó → rác đọng lại tới lần khởi động sau. Giờ đi qua
   `remove` nên xóa luôn file.
   Đã kiểm lại trên app thật: copy 2 ảnh khác nhau → đúng 2 dòng, 2 file.

**Test cuối:** Rust 156, TS 393, clippy sạch, lint sạch.

**Phụ thuộc:** Task 4
**Quy mô:** S
