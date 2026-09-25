# Implementation Plan: update

> Spec: `SPEC-update.md` (đã duyệt, bản 2, 2026-09-25) · Danh sách task: `tasks/todo.md`.
> Trạng thái plan: **chờ duyệt**.
> Trước đó: `tasks/{notch-shell,command-bar,notch-shell-v2,media,system,notch-shell-v3,clipboard,claude}/`.
> Plan Claude cất vào `tasks/claude/` khi còn dở: `claude-approvals` vẫn hoãn, vài mục kiểm tay chưa đánh dấu.

## Tổng quan

winbar tự đọc số phiên bản trên `main` của repo công khai, tối đa 7 ngày một lần, và báo trên pill khi có bản mới.
Không có card, không có widget: một module Rust chạy nền, một alert do shell đẩy, một mục trong Cài đặt.

## Quyết định kiến trúc

- **`http.rs` ra chỗ dùng chung.** Chuyển nguyên `claude/http.rs` sang `src-tauri/src/http.rs`, `claude` gọi qua
  đường mới. Không đổi hành vi, không thêm thư viện.
- **Phần thuần tách riêng (`update/model.rs`).** Đọc version, so phiên bản, tính tới hạn, quyết định có báo không.
  Mọi nhánh có test mà không cần mạng hay đĩa.
- **Trạng thái ở `update.json`, không ở file cài đặt** (spec §7). Ghi kiểu nguyên tử như cache hạn mức Claude.
- **Luồng nền thức dậy mỗi ngày**, không phải mỗi 7 ngày: máy ngủ hay tắt thì một `sleep(7 ngày)` sẽ trôi sai.
  Mỗi lần thức chỉ so mốc trên đĩa với giờ hiện tại; tới hạn mới gọi mạng.
- **Alert do shell đẩy, không qua widget.** `App.tsx` nghe `update-available` và đẩy alert vào shell hiện có.
  `PillAlert.source` đang là `WidgetId`; dùng `"winbar"` cho alert của chính app (chỉ để hiện tên khi alert lỗi).
- **Link là hằng số.** `update_open_changelog` không nhận tham số; frontend không truyền URL nào xuống Rust.

## Thứ tự

```
Task 1  http.rs dùng chung        (không đổi hành vi, chạy lại test claude)
   ↓
Task 2  update/model.rs thuần      (song song được với Task 1)
   ↓
Task 3  update/mod.rs: lệnh, update.json, luồng nền, cài đặt `update.check`
   ↓
Task 4  Alert trên pill            ─┐
Task 5  Mục Cập nhật trong Cài đặt ─┴ song song được
   ↓
Task 6  Phiên bản 0.2.0, test ba file cùng số, README, CHANGELOG
   ↓
Checkpoint: kiểm tay (spec §11) rồi publish
```

## Rủi ro và cách xử lý

| Rủi ro | Cách xử lý |
|---|---|
| Chuyển `http.rs` làm hỏng hạn mức Claude | Task 1 chỉ đổi đường dẫn module; chạy lại toàn bộ test `claude` và mở card hạn mức |
| Kiểm tay cần một bản mới hơn trên GitHub, mà lúc làm thì chưa có | Spec §11: hạ tạm `version` trên máy xuống `0.0.1` (không commit). Trên GitHub đang là `0.1.0` |
| Test gọi mạng thật | Không có test nào gọi mạng; phần mạng chỉ là `http::get`, đã có sẵn và đã chạy thật |
| Luồng nền tốn CPU | Thức mỗi 24 giờ, mỗi lần đọc một file nhỏ; không đáng đo |

## Điểm kiểm tra

- Sau Task 1: `cargo test` sạch, card hạn mức Claude vẫn có số.
- Sau Task 3: gọi `update_check` từ devtools trả đúng `current`/`latest` với bản đã hạ số.
- Sau Task 6: toàn bộ tiêu chí ở spec §12.
