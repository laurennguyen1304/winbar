# Hook trạng thái Claude Code

Widget **Claude · phiên** và pill Claude cần một hook của Claude Code để biết phiên nào đang chạy và đang làm gì.
winbar **không tự cài hook này**: nó chỉ đọc thư mục cấu hình của Claude Code, không ghi vào đó. Nếu máy bạn chưa
có hook, widget vẫn bật được nhưng pill Claude sẽ không bao giờ hiện, và card Phiên chỉ có lịch sử Claude Desktop.

Trang này mô tả hook cần làm gì, và cho sẵn một prompt để Claude Code trên máy bạn tự tạo nó.

## Kiểm tra máy đã có hook chưa

```powershell
$dir = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { "$env:USERPROFILE\.claude" }
Get-ChildItem "$dir\statusbar\state.d" -Filter *.json   # mở một phiên Claude Code rồi chạy lệnh này
```

- Lệnh báo lỗi không tìm thấy thư mục, hoặc không liệt kê file nào dù đang có phiên Claude Code chạy: **chưa có
  hook**, làm theo phần dưới.
- Có file `.json` nhưng pill vẫn không hiện: xem [Vẫn không hiện](#vẫn-không-hiện).

Nếu bạn đã dùng widget `claude_code` của [YASB](https://github.com/amnweb/yasb), hook của nó ghi đúng định dạng
này rồi, không cần làm gì thêm.

## Tạo hook bằng Claude Code

Mở Claude Code trong một terminal bất kỳ và dán nguyên prompt sau:

````text
Tạo cho tôi một hook trạng thái Claude Code để app winbar đọc được. Yêu cầu:

1. Viết một script Node.js tại <thư mục cấu hình Claude>/statusbar/hook.js, trong đó
   <thư mục cấu hình Claude> là $CLAUDE_CONFIG_DIR nếu biến này được đặt, ngược lại là ~/.claude.
   Script nhận tên sự kiện qua đối số dòng lệnh và payload JSON của hook qua stdin.

2. Mỗi phiên có một file <thư mục cấu hình Claude>/statusbar/state.d/<session_id>.json với đúng dạng:
   {"sessionId":"…","state":"idle|thinking|tool|permission","label":"","cwd":"…","project":"…",
    "entrypoint":"…","startedAt":0,"ts":1790000000}
   - state: "idle", "thinking", "tool" hoặc "permission".
   - label: tên tool khi state là "tool", còn lại là chuỗi rỗng.
   - cwd: lấy từ trường cwd của payload; sự kiện nào thiếu thì giữ giá trị cũ của file.
   - project: tên thư mục cuối của cwd.
   - entrypoint: giá trị biến môi trường CLAUDE_CODE_ENTRYPOINT (rỗng nếu không có).
   - startedAt: epoch GIÂY lúc bắt đầu lượt hiện tại, 0 nếu không có.
   - ts: epoch GIÂY lúc ghi file. Luôn cập nhật mỗi lần ghi.
   - Tên file: session_id chỉ giữ ký tự [A-Za-z0-9._-], thay ký tự khác bằng "_", cắt còn 64 ký tự.

3. Gắn các sự kiện sau vào phần "hooks" của settings.json trong thư mục cấu hình Claude:
   - SessionStart      → state "idle". Đồng thời xoá các file trong state.d có ts cũ hơn 24 giờ.
   - UserPromptSubmit  → state "thinking", startedAt = bây giờ.
   - PreToolUse (matcher "*") → state "tool", label = tool_name.
   - PostToolUse (matcher "*") → state "thinking".
   - Notification      → state "permission", CHỈ khi notification_type là "permission_prompt";
                          các thông báo khác bỏ qua.
   - Stop              → state "idle", startedAt = 0.
   - SessionEnd        → xoá file của phiên.

4. Yêu cầu an toàn:
   - Ghi file kiểu nguyên tử: ghi ra file tạm cùng thư mục rồi rename đè lên. Trên Windows rename có thể
     lỗi tạm thời (EPERM/EACCES/EBUSY) khi có app đang đọc: thử lại vài lần rồi mới ghi đè trực tiếp.
   - Script không bao giờ in gì ra stdout, luôn thoát với mã 0, bắt mọi lỗi và bỏ qua. Hook này không
     được làm chậm hay chặn Claude Code.
   - Không ghi nội dung hội thoại, prompt hay kết quả tool vào file.

5. Sửa settings.json bằng cách THÊM vào các hook đang có, không xoá hay ghi đè hook nào khác. Sao lưu
   settings.json trước khi sửa, cho tôi xem phần thay đổi và chờ tôi đồng ý rồi mới ghi.

6. Sau khi xong, hướng dẫn tôi mở một phiên Claude Code mới và kiểm tra thư mục state.d có file của phiên đó.
````

Claude sẽ hỏi lại trước khi sửa `settings.json`. Đọc kỹ phần thay đổi rồi mới đồng ý: hook chạy với quyền của
chính bạn mỗi lần Claude Code phát sinh sự kiện.

Hook chỉ có hiệu lực với **phiên mở sau khi cài**. Các phiên đang chạy phải mở lại mới hiện trên notch.

## Định dạng winbar đọc

Dành cho ai muốn tự viết hook, hoặc kiểm tra hook có sẵn.

| | |
| --- | --- |
| Thư mục | `$CLAUDE_CONFIG_DIR\statusbar\state.d\` nếu biến này được đặt, ngược lại `%USERPROFILE%\.claude\statusbar\state.d\`. winbar đọc biến này **một lần lúc khởi động** |
| File | Một file `*.json` cho mỗi phiên. File khác đuôi bị bỏ qua |
| Mã hoá | UTF-8, có hoặc không có BOM |

| Trường | Kiểu | winbar dùng để |
| --- | --- | --- |
| `state` | `"idle"` · `"thinking"` · `"tool"` · `"permission"` | Chữ trạng thái trên pill: idle / Thinking / Cooking / wait for you. Giá trị lạ tính là `idle` |
| `label` | chuỗi | Tên tool, hiện cạnh "Cooking" khi `state` là `tool` |
| `cwd` | chuỗi | Tên dòng, và thư mục mở ra khi bấm. Chỉ nhận thư mục cục bộ có thật |
| `project` | chuỗi | Tên dự phòng khi `cwd` trống |
| `entrypoint` | chuỗi | `"claude-desktop"` là phiên của Claude Desktop, còn lại là phiên terminal |
| `ts` | số, epoch **giây** | Lần cuối phiên có hoạt động. **Bắt buộc**: thiếu hoặc bằng 0 thì file bị bỏ qua |
| `sessionId` | chuỗi | Hiện chưa dùng; winbar lấy tên file làm id |

Mọi trường đều có thể thiếu, trừ `ts`. File không parse được thì bị bỏ qua, không ảnh hưởng các file khác.

## Vẫn không hiện

Pill Claude chỉ hiện khi có ít nhất một phiên **còn sống**. Kiểm tra lần lượt:

1. **Layout Claude đang tắt.** Cài đặt có hai công tắc: widget *Phiên Claude* ở mục Widget, và *Bật layout
   Claude* ở mục Claude. Tắt công tắc thứ hai thì winbar không đọc gì về Claude, kể cả khi widget vẫn bật.
2. **Không có phiên nào đang chạy.** Đây là hành vi đúng: giống media khi không phát nhạc, pill Claude tự ẩn.
3. **Phiên đã quá lâu không hoạt động.** Phiên im lặng hơn 2 giờ bị xếp vào nhóm "im lặng" và không lên pill.
   File có `ts` cũ hơn 24 giờ bị bỏ qua hẳn. Hai phiên cùng thư mục thì phiên cũ hơn lùi xuống sau 5 phút.
4. **Khác thư mục cấu hình.** Nếu bạn đặt `CLAUDE_CONFIG_DIR` cho Claude Code (ví dụ chỉ trong một terminal) mà
   winbar khởi động không có biến đó, hai bên nhìn vào hai thư mục khác nhau. Đặt biến ở cấp người dùng của
   Windows rồi khởi động lại winbar.
5. **Thiếu `ts`.** File không có `ts`, hoặc `ts` bằng 0, bị bỏ qua. `ts` phải là epoch **giây**, không phải
   mili giây.
