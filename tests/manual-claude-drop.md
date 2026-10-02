# Kiểm tay: thả file vào notch, báo phiên dừng

Những thứ test tự động không chạm tới được, vì cần chuột thật hoặc một phiên Claude Code thật. Ghi ngày và kết quả
vào cột cuối mỗi lần kiểm.

## Thả file (SPEC-claude-drop)

| # | Làm | Phải thấy | Kết quả |
|---|---|---|---|
| 1 | Kéo một file `.pdf` từ Explorer lên pill, giữ một giây | Pill nở ra: *Thả để hỏi Claude* và tên file | ✅ 02/10, bản dev, cả hai màn hình |
| 2 | Thả | Pill báo *Đang mở Claude*; một cửa sổ console mở ra và **ở lại**, Claude ở dấu nhắc trống | ✅ 02/10, bản dev |
| 3 | Lần đầu: Claude Code hỏi có tin thư mục `claude-drop` không → Yes. Thoát, thả lại | Lần hai không hỏi nữa | ✅ 02/10, bản dev |
| 4 | Gõ một câu hỏi về file | Claude xin phép đọc file; yêu cầu hiện trên notch | ✅ 02/10 (bản đầu, khi Claude còn đọc ngay lúc mở) |
| 5 | Kéo một file `.exe`, một file `.txt`, một thư mục | Con trỏ dấu cấm; pill: *Chỉ nhận PDF, ảnh, CSV, Excel và Word* | `.exe` ✅ 02/10; `.txt`, thư mục: chưa |
| 6 | Kéo 11 file PDF cùng lúc | Dấu cấm; pill: *Tối đa 10 file mỗi lần thả* | chưa |
| 7 | Thả ba file ở hai thư mục khác nhau, hỏi về cả ba | Claude biết cả ba | chưa |
| 8 | `.docx`, `.xlsx`, ảnh | Mở phiên như PDF; Claude đọc được (máy cần skill tương ứng cho Word/Excel) | chưa |
| 9 | Tắt widget Phiên Claude, kéo file | Dấu cấm, pill không đổi | chưa |
| 10 | Bản **phát hành** (không phải dev): lặp lại 1–2 | Như trên | chưa |
| 11 | Máy không có `claude.exe` trên `PATH` | Cửa sổ PowerShell mở, báo không tìm thấy `claude`, cửa sổ ở lại | chưa |

## Báo phiên dừng và agent con (SPEC-claude-notices)

Trước hết: Cài đặt › Claude › *Cài lại…*, rồi mở một phiên Claude Code **mới**.

| # | Làm | Phải thấy | Kết quả |
|---|---|---|---|
| 1 | Giao một việc chạy trên 30 giây, chuyển sang cửa sổ khác | `✓ <dự án> · xong — <một dòng>` trong 5 giây | ✅ 02/10, bản dev: sự kiện giả qua relay thật thì thấy; một lượt thật 74 giây có sinh thông báo |
| 2 | Hỏi một câu trả lời trong vài giây | Không báo gì | chưa |
| 3 | Lỗi thật (ngắt mạng giữa lượt, hoặc chạm giới hạn dùng) | `▲ <dự án> · dừng: <lý do>` trong 8 giây, đúng lý do | sự kiện giả `rate_limit` ✅ 02/10; lỗi thật: chưa |
| 4 | Nhờ Claude dùng một agent con | `+1 agent` trên card, `+1` trên pill; hết khi agent xong | chưa |
| 5 | Có yêu cầu duyệt quyền đang chờ, một phiên khác xong lượt dài | Yêu cầu duyệt vẫn ở trên pill; thông báo xong không che nó | chưa (có test tự động) |
| 6 | Tắt *Báo khi phiên dừng* | Không báo cả xong lẫn lỗi | chưa (có test tự động) |

Gửi một sự kiện giả để xem thông báo mà không cần chờ phiên thật: chạy `winbar.exe --winbar-claude-hook` với JSON
của hook trên stdin, từ PowerShell (`ProcessStartInfo`, chuyển hướng stdin) — xem `tests/tools/claude-relay-check.ps1`
để lấy mẫu. Gửi `UserPromptSubmit`, chờ 31 giây, rồi gửi `Stop` với cùng `session_id`.
