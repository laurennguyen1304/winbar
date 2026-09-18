# Implementation Plan: media

> Spec: `SPEC-media.md` (duyệt 2026-09-17) · Mockup: `design/winbar-mockup.html` (card "Đang phát", pill media, nửa always)
> Danh sách task: `tasks/todo.md`. Trạng thái plan: **xong (2026-09-18)**. Trước đó: `tasks/notch-shell/`, `tasks/command-bar/`, `tasks/notch-shell-v2/` (xong).

## Tổng quan

Widget `media` đọc phiên media của Windows trong Rust (WinRT), đẩy trạng thái lên frontend bằng sự kiện, và hiện
ở card, pill ưu tiên và nửa always. Có điều khiển, tua, đổi app, và tự ẩn khi không có phiên nào.

## Quyết định kiến trúc

- **Rust sở hữu WinRT.**
  - Một luồng riêng giữ manager và session, đăng ký 5 sự kiện.
  - Handler gom thay đổi (debounce ~50ms) rồi phát `media-changed`.
  - Phần thuần tách vào `model.rs` để test không cần WinRT: chọn phiên, `trackKey`, độ dài hợp lệ, tên app.
- **Ảnh bìa tách khỏi sự kiện:** `media_art(trackKey)` đọc stream, thu nhỏ bằng WIC (dùng lại code icon), cache một ảnh.
- **Frontend:**
  - `store.ts` theo `useSyncExternalStore`, dùng chung cho Card/Pill/MidPill/Background.
  - Tiến độ tự ước lượng, đồng hồ chỉ chạy khi card đang hiện.
- **Tự ẩn qua hợp đồng shell:** `ShellApi.setHidden`. Background của media gọi nó theo `current === null`.
- **Nguồn test không đụng nhạc của bạn:** một tiến trình PowerShell dùng `Windows.Media.Playback.MediaPlayer` phát file WAV im lặng, tắt tiếng, đặt tên bài/nghệ sĩ giả. Script tắt được lúc nào cũng được.
  - Nếu PowerShell không tạo được phiên, sẽ hỏi bạn trước khi thử với app thật.

## Thứ tự và phụ thuộc

```
Task 1 (spike + Rust đọc trạng thái) ─┐
Task 2 (shell setHidden)             ─┼─→ Task 3 (card hiển thị + ảnh bìa + tự ẩn)
                                      │        │
                                      │   Checkpoint 1 (bạn xem card thật)
                                      │        │
                                      └─→ Task 4 (điều khiển, tua, đổi app) → Task 5 (pill + nửa always) → Task 6 (đo + checklist)
```

## Danh sách task

- [x] Task 1: Spike WinRT + Rust đọc trạng thái (`media_state`, `media-changed`)
- [x] Task 2: `ShellApi.setHidden` trong notch-shell
- [x] Task 3: Card "Đang phát" (hiển thị, ảnh bìa, tiến độ chỉ xem) + tự ẩn

### Checkpoint 1: bạn xem card với nhạc thật

- [x] Task 4: Điều khiển ⏮ ⏯ ⏭, tua, đổi app
- [x] Task 5: Pill ưu tiên + nửa always
- [x] Task 6: Đo hiệu năng, checklist thủ công, so mockup

## Rủi ro

| Rủi ro | Mức | Cách xử lý |
|---|---|---|
| WinRT event handler trên luồng lạ gây deadlock/crash | Trung bình | Spike ở Task 1 trước khi làm UI; handler không chạm cửa sổ |
| PowerShell không tạo được phiên media để test | Trung bình | Thử ngay Task 1; không được thì hỏi bạn cho test với app thật |
| Cột sóng ở pill tốn CPU | Trung bình | Đo ở Task 6; phương án dự phòng ghi trong spec §12 |
| `setHidden` làm lệch pill/always đã ổn | Thấp | Task 2 riêng, test shell trước |
