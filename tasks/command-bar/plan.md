# Implementation Plan: command-bar

> Spec: `SPEC-command-bar.md` (đã duyệt 2026-09-17) · Mockup: phần Command bar trong `design/winbar-mockup.html`
> Danh sách task chi tiết: `tasks/command-bar/todo.md`. Trạng thái plan: **xong (2026-09-17)**. Module trước: `tasks/notch-shell/` (xong).

## Tổng quan

Thêm cửa sổ command bar thứ hai vào app winbar.
- **Mở:** bằng phím tắt hoặc menu khay. Nếu đang mở thì đưa lên trước.
- **Đóng:** chỉ bằng Esc khi command bar đang có focus.
- **Tìm kiếm:** app, file (Everything, không có thì Windows Search), máy tính, đổi đơn vị, web, hành động winbar, và provider của widget.
- **Vị trí:** kéo đi và nhớ chỗ đã kéo.

## Quyết định kiến trúc

- **Làm rủi ro cao nhất trước.** Task 1 là spike cho 4 việc:
  - lấy focus khi nhấn phím tắt (R1),
  - RAM khi có WebView thứ hai (R2),
  - Everything SDK trên ARM64 và giấy phép (R3),
  - crate `windows` gọi COM trên ARM64.

  Dừng lại cho bạn xem kết quả trước khi làm tiếp.
- **Cửa sổ tạo sẵn, ẩn.** Mở chỉ là `show` + `set_focus`. Cửa sổ khớp chiều cao nội dung, giữ cạnh trên, cách làm giống notch.
- **Provider chạy trong cửa sổ command bar.**
  - Cửa sổ này nạp cùng registry widget, lọc theo `settings.widgets`, nghe `settings-changed`.
  - Dữ liệu native (app, file, lịch sử) lấy qua lệnh Rust.
  - Nguồn có sẵn dùng đúng interface `SearchProvider` như widget.
- **Logic thuần có test trước.**
  - TS: máy tính, đổi đơn vị, chấm điểm tên + bỏ dấu, tách tiền tố, gộp nhóm.
  - Rust: vị trí, lịch sử, escape SQL, kiểm tra `launch`.
- **Rust là nguồn sự thật** cho vị trí, cài đặt, lịch sử. WebView không tự ghi file.
- **Mọi việc COM/tìm file chạy ngoài luồng UI** (`spawn_blocking`). Mỗi lần tìm có số thứ tự: kết quả của lần cũ bị bỏ.

## Danh sách task

### Giai đoạn 0 — Spike
- [x] Task 1: Spike cửa sổ thứ hai: focus, thời gian mở, RAM, Everything ARM64, COM

### Checkpoint 0 — Bạn xem `docs/spikes/command-bar.md` ✓

### Giai đoạn 1 — Khung command bar
- [x] Task 2: Cửa sổ command bar + giao diện tĩnh + mở/Esc/không đóng khi mất focus
- [x] Task 3: Vị trí mặc định, kéo ⠿, nhớ vị trí
- [x] Task 4: Hợp đồng provider, bộ gộp kết quả, bàn phím, provider widget demo

### Checkpoint 1 — Mở, gõ, chọn, chạy được với provider demo; kéo và nhớ vị trí

### Giai đoạn 2 — Nguồn không cần native
- [x] Task 5: Máy tính + đổi đơn vị + copy + toast
- [x] Task 6: Tìm web + hành động winbar + lệnh `launch` an toàn

### Giai đoạn 3 — App và lịch sử
- [x] Task 7: Liệt kê app (AppsFolder), chấm điểm tên, mở app
- [x] Task 8: Icon app (PNG cache, tải dần)
- [ ] Task 9: Lịch sử + nhóm "Gần đây"

### Checkpoint 2 — (dời lên sau Task 11, xem "Thứ tự làm")

### Giai đoạn 4 — File và cài đặt
- [x] Task 10: Tìm file bằng Windows Search + Ctrl+Enter mở thư mục chứa
- [x] Task 11: Tìm file bằng Everything + tự chọn nguồn
- [x] Task 12: Mục Command bar trong Cài đặt
- [x] Task 13: Đo hiệu năng, checklist thủ công, so mockup, 15 tiêu chí

### Checkpoint cuối — Đạt 15 tiêu chí ở mục 11 của spec

## Thứ tự làm sau Checkpoint 1 (bạn chốt 2026-09-17)

Bạn cần máy tính và tìm file sớm nhất, nên thứ tự thực hiện đổi (số task giữ nguyên):

1. Task 5 — máy tính + đổi đơn vị
2. Task 10 — tìm file bằng Windows Search. Làm luôn phần `launch.rs` cho file (mở file, Ctrl+Enter mở thư mục chứa). Icon file tạm theo loại (icon có sẵn), icon thật ở Task 8.
3. Task 11 — Everything + tự chọn nguồn

   **Checkpoint 2** — máy tính + tìm file dùng được hằng ngày
4. Task 6 (phần web) — tìm web; thêm kiểm tra URL `http`/`https` vào `launch.rs`
5. Task 7 — tìm app
6. Task 8 — icon thật cho app và file
7. Task 6 (phần hành động) — hành động của winbar
8. Task 9 — lịch sử + "Gần đây"
9. Task 12 — mục Command bar trong Cài đặt
10. Task 13 — đo và checklist

## Việc tiếp theo sau command-bar (bạn chốt 2026-09-17)

Nâng cấp `notch-shell`. Làm **sau** khi xong command-bar, **mockup HTML trước**, rồi cập nhật `SPEC-notch-shell.md` và chia task.

- **Dạng giọt nước:** notch dính liền mép trên màn hình, hai bên loe cong dần ra hai góc dưới (góc lõm nối vào mép trên). Là một layout chọn được trong Cài đặt, bên cạnh pill nổi hiện tại.
- **Kéo notch:** kéo tự do theo chiều ngang, luôn bám mép trên màn hình, nhớ vị trí. Để không đè lên phần browser đang full screen.
- **Sticky:** giữ chỗ phía trên màn hình (Windows AppBar) để cửa sổ phóng to bắt đầu ngay dưới notch thu gọn.
  - Windows chỉ giữ được cả dải ngang hết màn hình, bạn đã đồng ý.
  - Panel mở rộng vẫn nổi đè lên.
  - Chạy cùng YASB thì hai dải chồng nhau.
- **Emoji trạng thái Claude:** nhận thêm file cho từng trạng thái.
  - Định dạng nên dùng: WebP động (hoặc APNG), cỡ gấp đôi ô hiển thị, nền trong suốt.
  - Tránh GIF (viền răng cưa trên nền tối).

## Rủi ro và cách xử lý

| Rủi ro | Mức | Cách xử lý |
|---|---|---|
| R1 Nhấn phím tắt nhưng cửa sổ không nhận focus | Cao | Task 1 thử từ trình duyệt, Terminal, Explorer. Không đạt thì thử `AllowSetForegroundWindow` / phím Alt giả; báo bạn nếu vẫn không được |
| R2 WebView thứ hai đẩy RAM quá 150 MB | Trung bình | Task 1 đo. Vượt thì đề xuất tạo khi mở lần đầu và hủy sau 5 phút; hỏi trước |
| R3 Everything64.dll: giấy phép hoặc không có bản ARM64 | Trung bình | Task 1 kiểm. Không được thì gọi IPC của Everything từ Rust, hỏi trước |
| R4 OLE DB Windows Search khó gọi từ Rust | Trung bình | Task 1 thử một câu truy vấn thật từ Rust; không được thì báo trước Task 10 |
| R5 App admin đang ở trước chặn focus (UIPI) | Thấp | Ghi vào checklist, không chạy winbar quyền admin |
| R6 `Ctrl+Space` bị YASB giữ | Thấp | Dev bằng phím khác; bạn tắt Quick Launch của YASB khi chuyển hẳn |

## Song song hóa

Làm tuần tự. Sau Checkpoint 1, Task 5–6 (TS thuần) và Task 7–8 (Rust) độc lập với nhau, nhưng làm song song không đáng vì codebase nhỏ.

## Câu hỏi còn mở

Không có câu hỏi chặn. Kết quả Task 1 có thể dẫn tới câu hỏi mới ở Checkpoint 0.
