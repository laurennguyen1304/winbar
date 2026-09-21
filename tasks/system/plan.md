# Implementation Plan: system

> Spec: `SPEC-system.md` (bản 2, 2026-09-18) · Mockup: `design/winbar-mockup.html` (card "Hệ thống")
> Danh sách task: `tasks/todo.md`. Trạng thái plan: **xong (2026-09-18)**. Trước đó: `tasks/notch-shell/`, `tasks/command-bar/`, `tasks/notch-shell-v2/`, `tasks/media/` (xong).

## Tổng quan

Widget `system` nhỏ: card hiện CPU và RAM (đo 2 giây một lần, chỉ khi card đang hiện) và một nút mở Task Manager.
Command bar có thêm một dòng "Mở Task Manager".

## Quyết định kiến trúc

- **Rust đọc số:** `GlobalMemoryStatusEx` cho RAM, `GetSystemTimes` cho CPU. Phần tính toán (`% CPU` từ hai mốc, định dạng GB) tách vào `model.rs` thuần, có test.
- **Mốc đo giữ trong Rust:** lệnh `system_stats` so với lần gọi trước; mốc cũ quá 10 giây thì tự đo nhanh 150ms trên luồng blocking.
- **Frontend không có tiến trình nền:** hook `use-stats.ts` chỉ chạy khi card được vẽ; rời card là dừng, giống đồng hồ tiến độ của media.
- **Không đụng vào pill:** module này không có `Pill`/`MidPill`, nên không ảnh hưởng quy tắc media tự lên pill.

## Danh sách task

- [x] Task 1: Rust đọc CPU/RAM + mở Task Manager (`system_stats`, `open_task_manager`)
- [x] Task 2: Card "Hệ thống" + hook đo + search provider
- [x] Task 3: Đo hiệu năng, checklist thủ công, so số với Task Manager

## Rủi ro

| Rủi ro | Mức | Cách xử lý |
|---|---|---|
| Số CPU lệch so với Task Manager | Trung bình | Dùng đúng công thức idle/kernel/user; so trực tiếp ở Task 3 |
| Hook đo vẫn chạy sau khi panel đóng | Trung bình | Test component kiểm số lần gọi sau khi rời card; kiểm lại trên máy bằng log lệnh |
| Thêm feature crate `windows` làm nặng bản build | Thấp | Hai feature nhỏ; đo lại RAM và dung lượng exe ở Task 3 |
