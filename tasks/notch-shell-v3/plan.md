# Implementation Plan: notch trên nhiều màn hình (notch-shell v3)

> Spec: `SPEC-notch-shell.md` §16 (duyệt 2026-09-18)
> Danh sách task: `tasks/todo.md`. Trạng thái plan: **xong (2026-09-18)**.
> Trước đó: `tasks/notch-shell/`, `tasks/command-bar/`, `tasks/notch-shell-v2/`, `tasks/media/`, `tasks/system/` (xong).

## Tổng quan

Thêm cài đặt `pill.monitor`: `primary` (một notch ở màn chính) hoặc `all` (mỗi màn một notch).
Bản đầu định cho notch nhảy theo chuột; bạn bỏ giữa chừng vì màn hình bị nháy, nên đổi sang mỗi màn một cửa sổ.

## Quyết định kiến trúc

- **Một cửa sổ cho mỗi màn:** `window::sync_windows` tạo/đóng cửa sổ cho khớp danh sách màn hình; mỗi cửa sổ nhớ màn của nó (`notch`, `notch-1`, …).
- **Sticky theo cửa sổ:** `StickyState` giữ một mục cho mỗi cửa sổ, nên mỗi màn có dải giữ chỗ riêng.
- **Luồng:** mở/đóng cửa sổ phải chạy **ngoài luồng chính** (nó chờ vòng lặp sự kiện); đặt lại vị trí/kích thước thì chạy trên luồng chính.
- **DPI:** đặt vị trí trước rồi đặt kích thước, và đặt lại khi Windows báo đổi DPI, vì Windows tự co cửa sổ khi nó sang màn có DPI khác.
- **Quyền:** `capabilities/default.json` phải cho phép `notch-*`.

## Danh sách task

- [x] Task 1: Cài đặt `pill.monitor` + một notch mỗi màn hình
- [x] Task 2: Kiểm hai màn hình thật, sticky theo màn, đo RAM, checklist

## Rủi ro và kết quả

| Rủi ro | Kết quả thật |
|---|---|
| App treo khi mở/đóng cửa sổ | Đã gặp; sửa bằng cách chạy ngoài luồng chính |
| Notch màn 2 sai kích thước do DPI | Đã gặp (262×26 thay vì 328×32); sửa bằng đặt lại khi đổi DPI |
| Cửa sổ thứ hai không gọi được lệnh | Đã gặp; thêm `notch-*` vào danh sách quyền |
| Tốn thêm RAM | +~25 MB mỗi màn; ở `all` tổng 146–149 MB, sát ngưỡng 150 MB |
