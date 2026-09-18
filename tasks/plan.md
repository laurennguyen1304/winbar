# Implementation Plan: notch trên nhiều màn hình (notch-shell v3)

> Spec: `SPEC-notch-shell.md` §16 (duyệt 2026-09-18)
> Danh sách task: `tasks/todo.md`. Trạng thái plan: **xong (2026-09-18)**.
> Trước đó: `tasks/notch-shell/`, `tasks/command-bar/`, `tasks/notch-shell-v2/`, `tasks/media/`, `tasks/system/` (xong).
> Sau plan này: module `clipboard` (`SPEC-clipboard.md` đã viết, chờ duyệt phần kéo file).

## Tổng quan

Thêm cài đặt `pill.monitor`: notch ở màn chính (như hiện nay) hoặc nhảy sang màn hình đang có con trỏ chuột.
Vẫn chỉ một cửa sổ notch.

## Quyết định kiến trúc

- **Chọn màn hình trong Rust:** `GetCursorPos` + `monitor_from_point` của Tauri. Không dùng hook chuột, chỉ xem vị trí con trỏ 300ms/lần khi cài đặt là `mouse`.
- **Một chỗ quyết định:** `window::target_geometry()` trả về hình học màn hình cần dùng; `apply` và `sticky` dùng chung nó, nên dải giữ chỗ luôn theo màn hình của notch.
- **Không chuyển khi panel đang mở:** người dùng đang đọc thì notch đứng yên; chuyển ngay sau khi thu gọn.
- **Phần thuần có test:** chọn màn hình theo điểm con trỏ, và kẹp `offsetX` trong màn hình mới.

## Danh sách task

- [x] Task 1: Cài đặt `pill.monitor` + chọn màn hình theo con trỏ (Rust) + mục chọn trong Cài đặt
- [x] Task 2: Kiểm trên hai màn hình thật, sticky theo màn, checklist

## Rủi ro

| Rủi ro | Mức | Cách xử lý |
|---|---|---|
| Notch nhảy qua lại khi chuột đi ngang mép hai màn | Trung bình | Chỉ chuyển khi màn đổi hẳn; kiểm tra lại sau 300ms trước khi chuyển |
| Chuyển màn lúc panel đang mở gây giật | Trung bình | Hoãn tới khi thu gọn |
| Sticky để lại dải trên màn cũ | Trung bình | Gỡ AppBar trước khi chuyển, đăng ký lại ở màn mới |
| Đo vị trí chuột 300ms/lần tốn CPU | Thấp | Chỉ chạy khi cài đặt là `mouse`; `GetCursorPos` rất rẻ; đo ở Task 2 |
