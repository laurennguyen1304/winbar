# Implementation Plan: claude-approvals

> Spec: `SPEC-claude-approvals.md` · Mockup: `design/notch-approvals-mockup.html` · Danh sách task: `todo.md` cùng thư mục.
> Trạng thái: **xong, phát hành trong 0.3.0 (01/10/2026)**. Các mục chưa kiểm được: `tests/manual-claude-approvals.md`.

## Tổng quan

Trả lời yêu cầu cấp quyền của Claude Code ngay trên pill, đọc đủ tham số trong một thẻ riêng trước khi duyệt, và
thấy ba bước gần nhất của phiên đang chạy. Đây là module duy nhất ghi vào cấu hình của Claude Code, nên phần cài hook
đi qua màn xem trước và không có đường tắt.

## Quyết định kiến trúc

- **Relay là chính `winbar.exe`** (`--winbar-claude-hook`), rẽ nhánh ở dòng đầu của `main`. Không thêm crate, không
  thêm file phải đóng gói. Đo trên bản release: 20–40 ms mỗi lần chạy.
- **Named pipe có SID trong tên, DACL chỉ cho SID đó, nhãn integrity trung bình**, Win32 thuần. Relay kiểm tra **chủ
  sở hữu của pipe** trước khi gửi (không kiểm PID: PID giả được). Không mở cổng mạng.
- **Pill không mời duyệt thứ nó chưa hiện đủ.** Rust tính `complete`, trang đo xem dòng có vừa pill không; không đạt
  cả hai thì nút là *Xem…*.
- **Chỉ `PermissionRequest` là hook đồng bộ.** Bốn sự kiện còn lại chạy `async`, nên một tool call không chờ winbar.
- **Trạng thái chỉ nằm trong bộ nhớ.** Lệnh, đường dẫn và các bước không ghi ra đĩa, không vào log.
- **Phần thuần tách khỏi phần Win32.** `protocol.rs` và `pending.rs` không đụng pipe hay cửa sổ; `serve()` nhận một
  hàm `notify` thay cho `AppHandle`, nên cả lượt hỏi–đáp được test qua pipe thật mà không cần Tauri.
- **Shell không biết gì về Claude.** `PillAlert` thêm `Detail`; máy trạng thái thêm `detail`. Widget nào cũng dùng được.
- **Lò xo bằng `linear()` của CSS**, không thêm thư viện chuyển động.

## Thứ tự và phụ thuộc

```
Task 1 (giao thức, hàng đợi — thuần)
   └→ Task 2 (named pipe + relay + server)
         └→ Task 3 (cài/gỡ hook trong settings.json)
Task 4 (shell: thẻ riêng của alert, ghim, chuyển động)
   └→ Task 5 (pill + thẻ duyệt quyền, dòng các bước)
         └→ Task 6 (mục Cài đặt)
               └→ Task 7 (rà bảo mật, kiểm trên exe thật, tài liệu)
                     └→ Checkpoint: bạn dùng thử với Claude Code thật
```

## Rủi ro

| Rủi ro | Mức | Cách xử lý |
|---|---|---|
| Ghi hỏng `settings.json` của Claude Code | **Cao** | Từ chối file không đọc được; xem trước bắt buộc; so vân tay; sao lưu; ghi tạm rồi rename; test trên thư mục tạm với file có BOM, CRLF, hook của công cụ khác |
| Duyệt nhầm thứ mình không thấy | **Cao** | Làm sạch mọi chuỗi ở Rust; `⏎` cho xuống dòng; *Cho phép* trên pill chỉ khi hiện đủ; thẻ phải cuộn hết; nội dung bị cắt thì không duyệt được; nút trên pill khoá 0,5 giây đầu; không gửi `updatedInput` |
| Relay làm Claude Code chờ | **Cao** | Hết giờ ở cả relay lẫn server; thoát mã 0 trong mọi trường hợp; đo: 22–196 ms khi winbar tắt |
| Lỗ hổng người viết không tự thấy | **Cao** | Một lượt rà soát độc lập sau khi code xong: 1 lỗi cao, 5 vừa, 9 thấp; đã sửa hoặc ghi vào spec §10 |
| Pill còn treo sau khi đã trả lời ở terminal | Trung bình | Ba dấu hiệu gỡ (§4.4); giới hạn đã ghi cho lệnh chạy lâu |
| Claude Code đổi định dạng hook | Trung bình | Chỉ đọc các trường có tên; sự kiện lạ bị bỏ qua; relay im lặng khi không hiểu |
| Người dùng không có Git Bash | Thấp | Lệnh hook là lỗi cú pháp dưới PowerShell: hook hỏng mà không chạy gì; ghi trong tài liệu |
