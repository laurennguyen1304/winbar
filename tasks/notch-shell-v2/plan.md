# Implementation Plan: notch-shell v2

> Spec: `SPEC-notch-shell.md` §15 (duyệt 2026-09-17) · Mockup: `design/notch-upgrade-mockup.html`
> Danh sách task: `tasks/todo.md`. Trạng thái plan: **xong (2026-09-17)**. Trước đó: `tasks/notch-shell/`, `tasks/command-bar/` (xong).

## Tổng quan

Đổi notch sang dạng giọt nước dính mép trên với nền liquid glass (mặc định), cho kéo ngang dọc mép trên, và thêm chế độ sticky giữ chỗ phía trên màn hình.
Bạn muốn xem hình dạng thật trên máy sớm để quyết chiều cao, nên Task 1 làm hình dạng + nền trước.

## Quyết định kiến trúc

- **Một viền liền:** hình notch là một path tính theo kích thước hiện tại.
  - Nền: lớp `clip-path: path()`.
  - Viền: SVG `path` mở ở cạnh trên.
  - Vẽ lại theo `ResizeObserver` trong lúc notch co giãn (CSS transition vẫn giữ nguyên).
- **Hàm hình học thuần** (`notch-shape.ts`) có test: path giọt nước, path pill, bo góc bị giới hạn theo kích thước.
- **Cửa sổ native:**
  - dạng giọt nước: rộng thêm 2×14px cho phần loe, `topGap` = 0;
  - kéo ngang (Task 2): Rust đặt vị trí theo `offsetX`, kẹp trong màn hình.
- **Sticky** (Task 3) là phần Rust riêng: `SHAppBarMessage` ABM_NEW/SETPOS/REMOVE, cập nhật khi kích thước notch thu gọn hoặc màn hình đổi, gỡ khi thoát app.

## Danh sách task

- [x] Task 1: Dạng giọt nước + nền liquid glass (cài đặt `layout`, `material`)
- [x] Task 2: Kéo ngang dọc mép trên + lưu `offsetX` + "Về giữa"

### Checkpoint 1 — Bạn xem trên máy, chốt chiều cao pill

- [x] Task 3: Sticky (Windows AppBar)
- [x] Task 4: Đo, checklist thủ công, so mockup

## Rủi ro

| Rủi ro | Mức | Cách xử lý |
|---|---|---|
| Vẽ lại path theo từng khung khi co giãn bị giật | Trung bình | ResizeObserver chỉ đặt thuộc tính; đo trên máy. Nếu giật, bỏ transition viền, chỉ vẽ khi xong |
| Nền trong hơn khó đọc trên trang sáng | Trung bình | Giữ độ đục ~0.75–0.8; có tùy chọn "Đặc" trong Cài đặt |
| AppBar đụng với YASB (cũng giữ chỗ phía trên) | Trung bình | Chỉ bật khi bạn chọn; ghi rõ trong Cài đặt |
| Kéo notch lẫn với hover mở / bấm mở | Thấp | Ngưỡng 6px; kéo thì hủy hẹn giờ hover |
