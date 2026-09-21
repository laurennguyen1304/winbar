# Implementation Plan: clipboard

> Spec: `SPEC-clipboard.md` (bạn chốt phạm vi 2026-09-18: chỉ chữ và ảnh) · Mockup: `design/winbar-mockup.html` (card "Clipboard")
> Danh sách task: `tasks/todo.md`. Trạng thái plan: **xong** (còn 👤 kéo bằng chuột thật và checkpoint bạn dùng thử).
> Trước đó: `tasks/notch-shell/`, `tasks/command-bar/`, `tasks/notch-shell-v2/`, `tasks/media/`, `tasks/system/`, `tasks/notch-shell-v3/` (xong).

## Tổng quan

Lịch sử clipboard ngắn hạn: 50 mục trong 1 ngày (Cài đặt cho tối đa 2 ngày), chữ và ảnh, tìm được, ghim được,
kéo ra app khác, và **không lưu** thứ nhạy cảm. Đây là module lớn nhất của nhóm Core nên chia 5 task.

## Quyết định kiến trúc

- **Bắt clipboard trong Rust:** `AddClipboardFormatListener` trên một **cửa sổ message-only riêng** (notch bị đóng/mở lại khi đổi màn hình nên không gắn vào đó được), nhận `WM_CLIPBOARDUPDATE`. Luồng cửa sổ **chỉ báo hiệu**; một luồng đọc chờ 60 ms rồi mới mở clipboard — mở ngay trong handler làm app đang copy bị lỗi (xem Task 1).
- **Phần thuần tách riêng:** phân loại, cắt preview, dọn theo số mục/hạn giữ, nhận diện key/token — tất cả trong `model.rs` và `secrets.rs`, có test, không cần Windows.
- **Lưu trữ:** `%APPDATA%\winbar\clipboard\index.json` + `images/<id>.png` + `thumbs/<id>.png`; ghi tạm rồi đổi tên, như các file khác.
- **Riêng tư:** nội dung không bao giờ ra log; mục bị bỏ qua không ghi xuống đĩa; item clipboard không vào "Gần đây" của command bar.
- **Kéo ra ngoài:** chữ dùng kéo HTML5 của WebView2; file ảnh cần `DoDragDrop` + `CF_HDROP` nên dùng crate `tauri-plugin-drag` 2.1.1 (bạn đồng ý sau Task 1), thêm ở Task 4.

## Thứ tự và phụ thuộc

```
Task 1 (spike: bắt clipboard + thử kéo ra ngoài)
   └→ Task 2 (Rust: lưu, dọn, lọc nhạy cảm, lệnh + sự kiện)
         └→ Task 3 (card: danh sách, tìm, lọc, copy lại, ghim, xóa, tạm dừng)
               ├→ Checkpoint: bạn dùng thử vài hôm
               └→ Task 4 (kéo ra ngoài + command bar + mục Cài đặt)
                     └→ Task 5 (đo, checklist thủ công)
```

## Danh sách task

- [x] Task 1: Spike — bắt `WM_CLIPBOARDUPDATE` + thử kéo chữ/ảnh ra app khác
- [x] Task 2: Rust — lưu trữ, dọn, lọc nhạy cảm, lệnh và sự kiện
- [x] Task 3: Card "Clipboard" trong panel

### Checkpoint: bạn dùng thử

- [x] Task 4: Kéo ra app khác + provider command bar + mục Cài đặt
- [x] Task 5: Đo hiệu năng, checklist thủ công

## Rủi ro

| Rủi ro | Mức | Cách xử lý |
|---|---|---|
| ~~Kéo file ảnh ra ngoài~~ | — | Đã chốt sau Task 1: `tauri-plugin-drag` 2.1.1 |
| Bỏ sót nội dung nhạy cảm | Cao | 4 lớp lọc (spec §5.4); test nhiều mẫu thật; nút tạm dừng |
| Nhận nhầm nội dung thường là key | Trung bình | Test cả chuỗi dễ nhầm: hash git, base64 ngắn, câu tiếng Việt |
| RAM tăng vì ảnh | Trung bình | Chỉ giữ thumbnail trong bộ nhớ; ảnh gốc trên đĩa; ở chế độ 2 màn RAM đã 146–149 MB nên phải đo kỹ |
| Vòng lặp tự bắt chính mình khi copy lại | Trung bình | Bỏ qua lần đổi ngay sau khi winbar tự ghi clipboard |
