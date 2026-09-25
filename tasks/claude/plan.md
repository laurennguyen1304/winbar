# Implementation Plan: claude-sessions + claude-usage

> Spec: `SPEC-claude.md` (đã khảo sát trên máy thật 2026-09-18) · Mockup: `design/winbar-mockup.html` (tab Claude)
> Danh sách task: `tasks/todo.md`. Trạng thái plan: **đang thực hiện**.
> Trước đó: `tasks/{notch-shell,command-bar,notch-shell-v2,media,system,notch-shell-v3,clipboard}/` (xong).

## Tổng quan

Layout Claude: một tab riêng trong notch với hai card — phiên đang sống và hạn mức — cộng nội dung pill khi
`claude-sessions` là widget ưu tiên. **Chỉ đọc**: không ghi gì vào `~/.claude`, không cài hook.

## Quyết định kiến trúc

- **Ba nguồn, ba file Rust riêng.** `sessions.rs` (đọc `state.d` + lịch sử Desktop), `usage.rs` (payload + cache),
  `http.rs` (một lệnh GET qua WinHTTP). Mỗi file có phần thuần tách riêng để test không cần máy thật.
- **Đẩy sự kiện, không để TS poll.** Rust xem `mtime` của `state.d` mỗi giây và phát `claude-sessions-changed`;
  frontend chỉ nghe. Cùng kiểu với media.
- **WinHTTP thay vì thêm crate HTTP.** Lý do ở spec §4; chỉ thêm feature `Win32_Networking_WinHttp`.
- **Token không bao giờ rời `usage.rs`.** Không nằm trong struct nào phát ra frontend, không vào log.
- **Ảnh trạng thái là data URL từ Rust**, giống `clipboard_thumb` — vì ảnh người dùng thêm nằm ngoài bundle.
- **Chỉ chạy khi thấy được.** Timer luân phiên ảnh và vòng quét chỉ sống khi pill/panel đang hiện Claude.

## Thứ tự và phụ thuộc

```
Task 1 (Rust: phiên — state.d, Desktop, đường dẫn Orca)
   └→ Task 3 (card "Phiên Claude" + ảnh luân phiên)
Task 2 (Rust: hạn mức — WinHTTP, parser, cache)
   └→ Task 4 (card "Hạn mức" + pill + tự ẩn)
         └→ Checkpoint: bạn dùng thử
               └→ Task 5 (command bar + Cài đặt)
                     └→ Task 6 (đo, checklist thủ công)
```

Task 1 và Task 2 độc lập nhau; Task 2 rủi ro cao nhất (endpoint không công khai) nên làm sớm.

## Danh sách task

- [x] Task 1: Rust — phiên đang sống, lịch sử Desktop, tên project theo Orca
- [x] Task 2: Rust — hạn mức qua WinHTTP, parser, cache
- [x] Task 3: Card "Phiên Claude" + ảnh trạng thái luân phiên
- [x] Task 4: Card "Hạn mức" + nội dung pill + tự ẩn khi không có phiên

### Checkpoint: bạn dùng thử

- [x] Task 5: Provider command bar + mục Cài đặt
- [x] Task 6: Đo hiệu năng, checklist thủ công — xong 21/09 (năm vòng đo, xem `tests/manual-claude.md` §7)

## Rủi ro

| Rủi ro | Mức | Cách xử lý |
|---|---|---|
| Endpoint usage đổi hoặc bị chặn | **Cao** | Làm sớm (Task 2); parser chịu được thiếu trường; lỗi thì giữ cache và nói rõ |
| Token lọt vào log hay struct gửi ra frontend | **Cao** | Token chỉ sống trong `usage.rs`; checklist có mục kiểm; đọc lại diff trước khi commit |
| Poll 1 giây tốn CPU | Trung bình | Chỉ `stat` một thư mục; đo ở Task 6 như các module trước |
| Ảnh động tốn CPU | Trung bình | Bài học media: chỉ chạy khi thấy được; đo CPU khi panel đóng |
| Bóng ma phiên cũ làm danh sách sai | Trung bình | Gom theo `cwd`, dùng `ts` (spec §5.2); không bao giờ nói phiên "đã chết" |
| WinHTTP viết tay rò handle | Trung bình | Một hàm GET duy nhất; handle đóng bằng `Drop`; test URL sai và mất mạng |
