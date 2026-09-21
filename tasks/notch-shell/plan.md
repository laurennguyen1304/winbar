# Implementation Plan: notch-shell

> Spec: `SPEC-notch-shell.md` (đã duyệt 2026-09-16) · Mockup: `design/winbar-mockup.html` · Bản đồ module: `CAPABILITY-MAP.md`
> Danh sách task chi tiết: `tasks/notch-shell/todo.md`. Trạng thái plan: **xong (2026-09-17)**.

## Tổng quan

Dựng vỏ app winbar bằng Tauri 2 + React/TS ngay ở gốc worktree `firefish`: cửa sổ notch kính mờ, 4 trạng thái
(pill, alert, always, expanded), khung cắm widget, hàng đợi alert, cửa sổ Cài đặt riêng, icon khay, phím tắt,
chạy một bản, khởi động cùng Windows. Chưa có widget thật; widget `demo` dùng để kiểm chứng mọi đường đi.

## Quyết định kiến trúc

- **Làm rủi ro cao nhất trước.** Task 2 là spike kính mờ + bo góc (R1) và đo RAM (R4). Kết quả spike quyết định cách vẽ nền
  cho mọi task sau, nên dừng lại cho bạn xem trước khi làm tiếp.
- **Một cửa sổ notch khớp khối notch.** Không dùng cửa sổ trong suốt toàn màn hình, để vùng ngoài notch luôn click xuyên được.
  Khi mở rộng: đặt cửa sổ lên kích thước đích trước rồi animate bằng CSS; khi thu gọn: animate xong mới thu cửa sổ (R2).
- **Logic thuần tách khỏi UI.** Máy trạng thái notch, hàng đợi alert, thuật toán bố cục widget, validate cài đặt là hàm/TS
  module thuần, có test trước; component React chỉ hiển thị.
- **Cài đặt: Rust là nguồn sự thật.** Rust đọc/ghi/validate `settings.json`, phát sự kiện khi đổi; cửa sổ notch và cửa sổ
  Cài đặt cùng nghe sự kiện đó, nên hai cửa sổ luôn khớp nhau.
- **Kích thước và chuyển động khai báo một chỗ** (`src/design/tokens.css` + `src/shell/notch-sizes.ts`), lấy số từ mockup.
- **Icon tạm** cho tới khi có bộ icon bạn cung cấp; icon đi qua một lớp `Icon` để thay một lần.

## Danh sách task

### Giai đoạn 0 — Nền móng và spike
- [x] Task 1: Scaffold Tauri 2 + React/TS + công cụ test/lint
- [x] Task 2: Spike kính mờ, bo góc và RAM

### Checkpoint 0 — Bạn xem kết quả spike và chọn cách vẽ nền ✓ (css-dense)

### Giai đoạn 1 — Notch lõi
- [x] Task 3: Pill tĩnh đúng vị trí, kích thước, DPI
- [x] Task 4: Máy trạng thái notch + mode hover/click + chuyển động mở/thu
- [x] Task 5: Hợp đồng widget, registry, tab Core/Claude, bố cục, widget demo

### Checkpoint 1 — Mở/thu notch với card demo chạy đúng

### Giai đoạn 2 — Alert và always
- [x] Task 6: Hàng đợi alert + trạng thái alert trên pill
- [x] Task 7: Mode always (pill lớn hai widget)

### Checkpoint 2 — Đủ 4 trạng thái, so với mockup

### Giai đoạn 3 — Cài đặt
- [x] Task 8: Mô hình cài đặt (Rust) + áp dụng trực tiếp lên notch
- [x] Task 9: Cửa sổ Cài đặt (Pill, Widget, Cỡ chữ)

### Checkpoint 3 — Cài đặt đổi là notch đổi, khởi động lại vẫn nhớ

### Giai đoạn 4 — Tích hợp hệ thống
- [x] Task 10: Icon khay và menu
- [x] Task 11: Phím tắt toàn cục + phát hiện trùng
- [x] Task 12: Chạy một bản + khởi động cùng Windows
- [x] Task 13: Đo hiệu năng, checklist thủ công, soát lại với mockup

### Checkpoint cuối — Đạt 11 tiêu chí ở mục 11 của spec

## Rủi ro và cách xử lý

| Rủi ro | Mức | Cách xử lý |
|---|---|---|
| R1 Acrylic + bo góc lớn bị viền vuông/răng cưa | Cao | Task 2 thử trước; không đạt thì nền mờ đặc, bạn chọn ở Checkpoint 0 |
| R2 Đổi kích thước cửa sổ native bị giật | Trung bình | Cửa sổ nhảy tới kích thước đích, animate bằng CSS (Task 4) |
| R3 `Ctrl+Space` trùng yasb/IME | Trung bình | Task 11 phát hiện và báo; bạn tắt phím tắt bên yasb |
| R4 WebView2 vượt 150 MB RAM | Trung bình | Đo ở Task 2 và Task 13; vượt thì báo trước khi làm tiếp |
| R5 Đổi màn hình/DPI khi đang chạy | Thấp | Task 3 định vị lại khi cấu hình màn hình đổi |
| Cài VS Build Tools cần quyền admin (UAC) | Thấp | Đang cài; nếu hộp thoại UAC hiện, bạn bấm đồng ý |

## Song song hóa

Làm tuần tự: cùng một codebase nhỏ, các task dùng chung máy trạng thái và hợp đồng widget. Có thể làm song song
Task 10–12 sau Checkpoint 3 nếu muốn nhanh hơn.

## Câu hỏi còn mở

- Bộ icon: định dạng và giấy phép (không chặn; dùng icon tạm tới Task 10).
