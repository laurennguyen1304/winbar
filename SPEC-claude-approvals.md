# Spec: claude-approvals

> Trạng thái: **phát hành trong 0.3.0 (01/10/2026)** — chủ dự án duyệt bắt đầu ngày 01/10/2026 ("làm luôn đi"), dùng thử
> bản dev cùng ngày rồi chốt phát hành. Mockup ban đầu: `design/notch-approvals-mockup.html`. Capability map: module `claude-approvals`.
> Tham khảo: [Louis-CFM/coucou](https://github.com/Louis-CFM/coucou) (MIT) — cùng ý tưởng relay + named pipe và cách
> ghi `settings.json` có diff; không chép code, không dùng tài sản (nhân vật, âm thanh) của nó.
> Đây là module **duy nhất** của winbar ghi vào thư mục cấu hình của Claude Code. `SPEC-claude.md` §13 ("không bao
> giờ cài hook") vẫn đúng cho `claude-sessions` và `claude-usage`.

## 1. Mục tiêu

Khi Claude Code xin quyền chạy một tool, trả lời ngay trên notch mà không phải quay lại terminal.

- Pill hiện phiên nào đang xin và xin gì, kèm **Từ chối / Cho phép**.
- Bấm vào câu lệnh thì bung thẻ đầy đủ để đọc hết trước khi duyệt.
- Card Phiên Claude hiện ba bước gần nhất của phiên đang chạy.
- winbar tắt, treo, hay bị ẩn: Claude Code hỏi trong terminal như chưa từng có winbar.

**Không làm trong bản này:** "luôn cho phép" (ghi rule quyền), sửa tham số tool trước khi cho chạy, trả lời câu hỏi
của Claude, duyệt cho phiên chạy trên cloud, đổi âm thanh/thông báo hệ thống.

## 2. Đã khảo sát (01/10/2026, Claude Code 2.1.286 trên máy này)

| Điều | Nguồn |
|---|---|
| Hook `PermissionRequest` nhận `session_id`, `cwd`, `tool_name`, `tool_input`, `tool_use_id`; trả `{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow"\|"deny","message":…}}}` | Tài liệu hooks |
| Thoát mã 0 và **không in gì** = không quyết định, luồng xin quyền đi tiếp bình thường. Mã thoát khác 0 cũng không chặn | Tài liệu hooks |
| **Hộp thoại trong terminal hiện song song với hook**: hook được khởi chạy không `await`, rồi hộp thoại hiện ngay; ai trả lời trước thì tính (mẫu `claim()`). Trả lời ở terminal **không** dừng tiến trình hook | Đọc mã trong `claude.exe` (hàm gọi `executePermissionRequestHooks`) |
| Hook có trường `async: true` (chạy nền, không chặn) và `timeout` tính bằng giây (mặc định 600) | Tài liệu + chuỗi mô tả schema trong `claude.exe` |
| Hook dạng shell chạy qua Git Bash; máy không có Git Bash thì qua PowerShell | Tài liệu hooks |
| Máy này đã có sẵn hook của công cụ khác ở mọi sự kiện, kể cả `PermissionRequest` | `~/.claude/settings.json` |

Hệ quả của dòng thứ ba: pill trên notch là **đường thứ hai** để trả lời, không thay thế terminal. Và sau khi bạn trả
lời ở terminal, winbar phải tự nhận ra để gỡ pill (§4.4).

**Phiên không có ai ngồi trước** (`claude -p`, agent chạy nền): ở đó Claude Code không có hộp thoại nào để hiện, và
đọc mã cho thấy nó **chờ** hook `PermissionRequest` rồi mới từ chối nếu hook không quyết định
(`consultPermissionRequestHooksForUnpromptableAsk`). Với hook của winbar, yêu cầu của những phiên đó cũng lên pill —
duyệt được từ notch, điều trước đây không làm được — nhưng nếu không ai bấm thì chúng chờ tới hết hạn (§4.3) rồi mới
bị từ chối, thay vì bị từ chối ngay. Việc tự động hoá nào hay đụng tường quyền sẽ chậm đi tương ứng. Chưa kiểm trên
máy thật; nằm trong checklist. Chủ dự án chốt giữ hạn 300 giây cho cả loại phiên này (01/10); rút ngắn nếu sau này có
tự động hoá hay vấp quyền. Ở chế độ quyền `auto` của Claude Code, phần lớn lệnh được tự duyệt và không tới bước này.

## 3. Kiến trúc

```
Claude Code ──(hook, stdin JSON)──▶ winbar.exe --winbar-claude-hook ──(named pipe)──▶ winbar đang chạy ──▶ notch
                                         ▲                                                  │
                                         └────────────── "allow" / "deny" ◀─────────────────┘
```

| Quyết định | Chọn | Vì sao |
|---|---|---|
| Relay | **Chính `winbar.exe`** với tham số `--winbar-claude-hook`, rẽ nhánh ngay đầu `main` trước khi khởi tạo Tauri | Không thêm crate, không thêm file phải đóng gói và chép đi. Bản release 5 MB, không nạp WebView khi chạy nhánh này. Đo trên exe release: khoảng 20–40 ms mỗi lần khi có server trả lời |
| Kênh | Named pipe `\\.\pipe\winbar-claude-<SID>` | Không mở cổng mạng. Tên có SID nên hai tài khoản trên cùng máy không gặp nhau |
| Quyền trên pipe | SDDL `O:<SID>D:P(A;;GA;;;<SID>)S:(ML;;NWNR;;;ME)`: chủ sở hữu là chính SID đó (ghi tường minh), DACL chỉ một SID, nhãn integrity trung bình cấm đọc lẫn ghi từ dưới lên; `FILE_FLAG_FIRST_PIPE_INSTANCE`; `PIPE_REJECT_REMOTE_CLIENTS` | Tài khoản khác, tiến trình sandbox/integrity thấp và máy khác không nối vào được; không phục vụ chồng lên pipe người khác đã tạo trước |
| Relay kiểm tra server | **Chủ sở hữu của pipe** (`GetSecurityInfo`) phải là SID của mình, không thì không gửi gì; mở pipe ở mức `SECURITY_IDENTIFICATION` | Chủ sở hữu của một kernel object là thứ tài khoản khác không giả được. Bản đầu kiểm theo PID của server; lượt rà soát chỉ ra PID có thể đã chết và được cấp lại cho một tiến trình của chính nạn nhân, nên bỏ |
| Server | Một luồng nghe + một luồng cho mỗi kết nối, Win32 thuần qua crate `windows` | Không cần tokio. Đọc bằng `PeekNamedPipe` có hạn giờ; ghi câu trả lời không chờ client đọc (không `FlushFileBuffers`, không `DisconnectNamedPipe`), nên relay bị treo cũng không giữ luồng nào |
| Lệnh hook trong `settings.json` | Dạng shell: `'C:/…/winbar.exe' --winbar-claude-hook` (nháy đơn, `'` thoát thành `'\''`) | Chạy được dưới Git Bash; dưới PowerShell là lỗi cú pháp nên hook hỏng **mà không chạy gì**. Dạng exec (`args`) gọn hơn nhưng bản Claude Code cũ bỏ qua `args` sẽ chạy `winbar.exe` trần |
| Trạng thái | Chỉ trong bộ nhớ của tiến trình winbar | Câu lệnh và đường dẫn file không ghi ra đĩa, không ghi log |

Feature `windows` thêm: `Win32_System_Pipes`, `Win32_System_IO`, `Win32_Storage_FileSystem`, `Win32_Security`,
`Win32_Security_Authorization`. `serde_json` bật `preserve_order` để `settings.json` của bạn giữ nguyên thứ tự khoá
khi winbar ghi lại. Không thêm crate nào (`indexmap` đã có sẵn trong `Cargo.lock`).

## 4. Hành vi

### 4.1 Sự kiện hook

| Sự kiện | Kiểu | winbar làm gì |
|---|---|---|
| `PermissionRequest` | đồng bộ, `timeout` 310 giây | Hiện pill, chờ câu trả lời |
| `PreToolUse` | `async` | Thêm một bước vào dòng chạy của phiên |
| `PostToolUse` | `async` | Tool đã chạy xong: gỡ yêu cầu duyệt cùng `tool_use_id` nếu còn treo (bạn đã cho phép ở terminal) |
| `UserPromptSubmit` | `async` | Lượt mới: xoá các bước cũ và yêu cầu treo của phiên. **Nội dung prompt bị bỏ ngay ở relay**, không đi qua pipe |
| `Stop` | `async` | Hết lượt: gỡ yêu cầu treo của phiên |

Bốn sự kiện `async` không làm Claude chờ. Relay cho chúng tối đa 1,3 giây rồi thoát.

### 4.2 Relay không bao giờ giữ chân Claude Code

- Pipe không tồn tại (winbar tắt): thoát mã 0 ngay, không in gì.
- Nối: tối đa 300 ms, chỉ thử lại khi pipe báo bận.
- Mọi lỗi (JSON hỏng, pipe đứt, pipe của người khác): thoát mã 0, không in gì.
- `PermissionRequest`: chờ tối đa 305 giây. Luồng chính canh giờ và thoát khi hết hạn, kể cả khi luồng đọc đang kẹt.
- Chỉ in ra stdout khi nhận đúng chữ `allow` hoặc `deny`, và chỉ in một trong hai chuỗi JSON cố định.
- Không ghi stderr ở bất kỳ nhánh nào.

### 4.3 Server nhả yêu cầu ngay khi không ai trả lời được

Server đóng kết nối mà không trả lời (terminal tự lo) khi:

- layout Claude đang tắt, widget `claude-sessions` đang tắt, hoặc notch đang bị ẩn (xét lúc yêu cầu tới);
- trang notch không xác nhận đã hiện pill trong **2 giây** (WebView treo hoặc chưa sẵn sàng);
- đã có 16 yêu cầu đang treo, hoặc đang có 64 kết nối;
- quá **300 giây** không ai bấm.

Một cú bấm trùng đúng lúc hết hạn không bị mất: trước khi bỏ, luồng chờ nhìn lại kênh trả lời một lần cuối.

### 4.4 Gỡ pill khi đã trả lời ở chỗ khác

| Dấu hiệu | Ý nghĩa |
|---|---|
| Client đóng pipe | Claude Code đã dừng hook (bạn bấm Esc, từ chối ở terminal, hết giờ) |
| `PostToolUse` cùng `tool_use_id` | Bạn đã cho phép ở terminal và tool chạy xong |
| `Stop` hoặc `UserPromptSubmit` của phiên | Lượt đó đã qua |

**Giới hạn đã biết:** cho phép ở terminal một lệnh chạy lâu (ví dụ build 5 phút) thì pill còn nằm đó tới khi lệnh
xong hoặc hết 300 giây, vì Claude Code không phát sự kiện nào lúc tool *bắt đầu* chạy sau khi được duyệt. Bấm vào
pill lúc đó vô hại: Claude Code bỏ qua câu trả lời đến sau.

### 4.5 Trên notch

**Nguyên tắc: thứ bạn duyệt phải là thứ bạn thấy.** winbar không bao giờ mời duyệt một thứ nó chưa hiện đủ.

**Pill cảnh báo** (cỡ alert có sẵn, 490×40 với pill M), từ trái sang:

- ảnh trạng thái `permission`;
- **tên project** (hoặc tên thư mục), màu `--warn`, tối đa 110 px — `git push` ở repo này khác ở repo kia;
- một dòng tóm tắt, cắt bằng dấu `…` khi không vừa. Với `Bash`/`PowerShell` là chính câu lệnh; với tool khác là
  `Edit · <đích>`. Đường dẫn dài hơn 30 ký tự chỉ giữ hai đoạn cuối (`Edit · …\.ssh\config`), vì pill cắt ở bên phải
  và tên file mới là phần cần thấy. Trường `description` **không bao giờ** được dùng làm tóm tắt: đó là lời model tự
  kể về việc nó làm, không phải việc nó làm;
- `+N` nếu còn yêu cầu khác đang chờ;
- **Từ chối**, và một trong hai:
  - **Cho phép** — chỉ khi dòng tóm tắt *là toàn bộ yêu cầu* và *hiện đủ trên pill*: input chỉ có một trường đáng
    kể, một dòng, không bị rút gọn hay cắt, và vừa bề ngang pill (đo trên trang). Các trường không đổi việc tool làm
    được bỏ qua: `description`, `timeout`, `run_in_background` của `Bash`/`PowerShell`; `offset`, `limit` của `Read`.
    Trường lạ thì coi là đáng kể.
  - **Xem…** — mọi trường hợp còn lại (lệnh dài, lệnh nhiều dòng, `Edit`/`Write`, tool MCP, nội dung bị cắt). Nút
    này mở thẻ đầy đủ, không quyết định gì.

Hai nút quyết định **khoá nửa giây đầu**. Pill tự nở ra đè lên thứ đang ở mép trên màn hình (tab trình duyệt, thanh
tiêu đề); một cú bấm đang trên đường tới đó không được rơi vào **Cho phép**. Mỗi pill mới tính lại từ đầu, kể cả khi
yêu cầu kế tiếp trong hàng thế chỗ yêu cầu vừa trả lời. **Xem…** không khoá vì nó không quyết định gì.

Ưu tiên 5: trên cảnh báo hạn mức (3) và báo bản mới (1).

> Chủ dự án chọn ngày 01/10 là yêu cầu hiện ngay trên pill. Bản đầu để **Cho phép** luôn có trên pill; lượt rà soát bảo
> mật chỉ ra rằng như vậy là duyệt thứ chưa đọc hết với hầu hết lệnh thật, nên đổi thành quy tắc trên. Lệnh ngắn vẫn
> duyệt được bằng một cú bấm; lệnh dài mất hai. **Chủ dự án chốt giữ quy tắc này ngày 01/10**, sau khi dùng thử bản dev.

**Thẻ đầy đủ**: bấm vào phần chữ của pill, hoặc nút **Xem…**. Rộng 560, cao theo nội dung.

- Phiên, tool, rồi **toàn bộ** tham số: mỗi trường một dòng `tên: giá trị` sát lề trái; giá trị nhiều dòng nằm ở
  các dòng dưới, **thụt vào** — nên một dòng trong giá trị không thể giả làm một trường khác.
- Khung nội dung cao tối đa 240 px và cuộn được. **Cho phép khoá cho tới khi cuộn tới cuối**: dòng nguy hiểm của một
  lệnh dài có thể là dòng cuối.
- Nội dung đã bị cắt (chuỗi trên 4 000 ký tự, hoặc cả yêu cầu quá 256 KB): chỗ cắt ghi `… [đã cắt N ký tự]` ngay
  tại đó, và thẻ **không có nút Cho phép** — chỉ **Từ chối** và **Để terminal hỏi**. Thứ không đọc được ở đây thì
  không duyệt được ở đây.
- **Để terminal hỏi** nhả yêu cầu mà không quyết định.
- Thẻ được **ghim**: chuột rời không đóng (chủ dự án chốt 01/10). Đóng bằng nút thu gọn, Esc, bấm ra ngoài, hoặc khi đã
  trả lời. Nút trong thẻ không khoá nửa giây: mở thẻ đã là một cú bấm có chủ ý.

Nhiều yêu cầu cùng lúc: xếp hàng theo thứ tự đến, mỗi lần hiện một. Notch ở mọi màn hình (`pill.monitor = "all"`)
cùng hiện; bấm ở màn nào cũng được.

**Làm sạch chuỗi** (ở Rust, trước khi tới trang; áp dụng lại ở server dù relay đã làm):

- Ký tự điều khiển, ký tự đổi chiều chữ, ký tự vô hình, ký tự chọn biến thể, và mọi khoảng trắng không phải dấu cách
  thường (U+00A0, U+2000–200A, U+3000, U+2800…) hiện thành `\u{…}`, không bao giờ được vẽ nguyên dạng.
- Xuống dòng trong dòng tóm tắt hiện thành `⏎`.
- Chữ trong dòng tóm tắt, thẻ và các bước được vẽ theo đúng thứ tự lưu, trái sang phải (`unicode-bidi:
  bidi-override`): chữ Ả Rập hay Do Thái không kéo số và dấu cạnh nó sang vị trí khác.
- winbar không bao giờ gửi `updatedInput`: Claude Code chạy đúng tham số nó đã hỏi.
- Trang chỉ vẽ các chuỗi này dưới dạng text node; không có `innerHTML` ở đâu cả.

### 4.6 Dòng chạy các bước

Dưới dòng của phiên đang `Thinking`/`Cooking`/`wait for you` trong card Phiên Claude: tối đa ba bước gần nhất, bước
cuối là bước đang chạy. Nhãn do relay dựng, tối đa 80 ký tự:

| Tool | Nhãn |
|---|---|
| `Bash`, `PowerShell` | dòng đầu của lệnh |
| `Read`, `Edit`, `Write`, `MultiEdit`, `NotebookEdit` | **tên file**, không kèm thư mục |
| `Grep`, `Glob` | mẫu tìm |
| `WebFetch` | tên miền |
| `WebSearch` | câu tìm |
| `Task`, `Agent` | mô tả |
| còn lại | chỉ tên tool |

Mỗi phiên giữ 6 bước, tối đa 24 phiên, chỉ trong bộ nhớ.

Một bước là thứ nằm trên màn hình mà không ai được hỏi có muốn xem không — khác với yêu cầu duyệt, vốn phải đọc được
mới trả lời được. Nên lệnh nào trông như mang theo khoá hay mật khẩu (cùng bộ nhận diện với clipboard, SPEC-clipboard
§5.4) chỉ hiện là `Bash · (ẩn: có vẻ chứa bí mật)`. Yêu cầu duyệt cho chính lệnh đó thì vẫn hiện đầy đủ.

Các bước cần hook trạng thái (`docs/claude-status-hook.md`) mới có chỗ hiện: không có nó thì card Phiên không có
dòng nào để gắn các bước vào.

### 4.7 Cài và gỡ hook (Cài đặt › Claude)

- Trạng thái: *chưa cài* · *đã cài* · *đã cài nhưng trỏ tới bản winbar khác* (đường dẫn exe đã đổi). Đã cài mà winbar
  không mở được pipe (tên đã bị chiếm) thì hàng này báo rõ, vì khi đó hook có mà không gì tới được notch.
- **Cài hook…** hiện đúng phần sẽ đổi trong `settings.json` (diff), đường dẫn file sao lưu, rồi mới có nút **Ghi**.
  Không có đường nào ghi mà không qua màn xem trước; lệnh ghi chỉ cửa sổ Cài đặt gọi được.
- Ghi: đọc file → so dấu vân tay với lúc xem trước (khác thì dừng, bắt xem lại) → sao lưu
  `settings.json.winbar-<yyyymmdd-hhmmss>.bak` (không bao giờ đè bản sao lưu cũ: trùng tên thì thêm `-2`, `-3`) →
  ghi file tạm cùng thư mục và ép xuống đĩa → **đọc lại lần cuối** (Claude Code cũng ghi file này) → thay bằng
  `ReplaceFileW` (giữ quyền và thuộc tính của file cũ), không được thì rename. Ghi hỏng ở bước nào cũng dọn cả file
  tạm lẫn bản sao lưu vừa tạo.
- File không đọc được, không phải JSON object, lớn hơn 4 MB, hoặc mục `hooks` có dạng lạ: **từ chối**, không coi như
  file rỗng. Phần thay đổi dài tới mức không hiện nổi diff: cũng từ chối — không xem trước được thì không ghi.
- Chỉ thêm/bớt **từng hook** có lệnh đúng dạng `'<đường dẫn>' --winbar-claude-hook`: dấu nhận biết là cờ này, không
  phải tên file exe, và phải đúng nguyên dạng (một script bọc ngoài có truyền cờ đó là hook của người viết script).
  Hook của công cụ khác giữ nguyên thứ tự và nội dung, kể cả khi bạn đã gom hook của winbar vào chung một nhóm với
  hook của mình.
- Gỡ xong thì file trở lại đúng nội dung cũ, trừ hai trường hợp: `"hooks": {}` rỗng có từ trước, hoặc một sự kiện
  của winbar có danh sách rỗng từ trước — hai thứ đó không còn sau khi gỡ.
- Thư mục cấu hình: `CLAUDE_CONFIG_DIR` nếu có, không thì `~/.claude` — cùng quy tắc với `claude-sessions`.
- `settings.json` là một symlink (người để dotfiles trong repo): ghi vào **file đích**, link giữ nguyên. Máy viết
  module này không tạo được symlink (cần Developer Mode), nên test cho trường hợp này tự bỏ qua ở đây — **chưa kiểm**.
- Diff so hai bản đã được winbar viết lại, nên không cho thấy những thứ chỉ khác cách viết: thụt lề, BOM, CRLF,
  `\uXXXX`, khoá lặp lại (giữ khoá cuối, như Claude Code đọc). Khi file khác cách winbar viết, màn xem trước nói rõ
  điều đó; bản gốc từng byte nằm trong file sao lưu.
- Gỡ winbar mà quên gỡ hook: lệnh hook trỏ tới file không còn, Claude Code báo lỗi không chặn và hỏi như thường.
- Máy chỉ có PowerShell (không Git Bash): hook lỗi cú pháp ở cả năm sự kiện, mỗi tool call một lần. Cài đặt chưa
  kiểm tra Git Bash trước khi cài.

## 5. Notch shell đổi gì

- `PillAlert` thêm `Detail?: ComponentType`. Bấm vào phần chữ của một alert có `Detail` thì notch mở **thẻ đó**
  thay cho panel, rộng 560. Alert không có `Detail` giữ hành vi cũ (mở panel).
- `ShellApi` thêm `openDetail(alertId)`: cho một nút nằm trong alert mở thẻ của chính alert đó (cú bấm vào nút không
  tới được pill). Chỉ có tác dụng với alert đang ở trên pill và có `Detail`.
- Máy trạng thái thêm `detail` (id của alert có thẻ đang mở): khi có, `pointerLeave` không đóng. Sự kiện `detailGone`
  thu notch lại khi alert đó bị gỡ, không nháy panel.
- Khay hệ thống và command bar vẫn mở panel, không mở thẻ.
- **M1 đổi** (SPEC-notch-shell §5.3): lớn lên dùng đường cong lò xo (`linear()` của CSS, 700 ms, tương đương
  response 0,5 / damping 0,72 của coucou); nhỏ lại 340 ms `cubic-bezier(.45,0,.2,1)`, không nảy. Không thêm thư viện.
  Cửa sổ native vẫn lớn trước khi morph và chỉ thu sau khi morph xong (340 ms).

## 6. Giao diện với Rust

```ts
interface ClaudeApproval {
  id: string;            // 128 bit ngẫu nhiên do winbar sinh, không phải tool_use_id
  sessionId: string;
  title: string;         // worktree hoặc tên thư mục, như card Phiên
  project?: string;
  tool: string;
  summary: string;       // một dòng, đã làm sạch
  complete: boolean;     // summary là toàn bộ yêu cầu: pill được phép có nút Cho phép
  detail: string;        // toàn bộ tham số, đã làm sạch
  truncated: boolean;    // có thứ đã bị cắt: không duyệt được từ winbar
  receivedAt: number;    // epoch ms
}
type Decision = "allow" | "deny" | "release";   // release = để terminal hỏi

interface ClaudeHookStatus { state: "absent" | "installed" | "stale"; settingsPath: string; listening: boolean; }
interface ClaudeHookPreview {
  diff: string; backupPath: string; settingsPath: string;
  fingerprint: string; stamp: string; reformats: boolean; unchanged: boolean;
}
```

| Lệnh / sự kiện | Ai gọi được | |
|---|---|---|
| `claude_approvals()` | cửa sổ notch | danh sách đang treo |
| `claude_approval_shown(id)` | cửa sổ notch | trang đã hiện pill |
| `claude_approval_decide(id, decision)` | cửa sổ notch | trả lời |
| `claude_steps()` | cửa sổ notch | `{ [sessionId]: string[] }` |
| `claude_hook_status()` · `claude_hook_preview(install)` | mọi cửa sổ | chỉ đọc |
| `claude_hook_apply(install, fingerprint, stamp)` | cửa sổ Cài đặt | ghi `settings.json` |
| sự kiện `claude-approvals-changed`, `claude-steps-changed` | | rỗng; trang tự hỏi lại |

## 7. Cấu trúc thư mục

```
src-tauri/src/claude/approvals/
  mod.rs        state, lệnh Tauri, cổng vào (bật/tắt, ẩn), serve()
  protocol.rs   thông điệp relay→server, làm sạch chuỗi, tóm tắt, nhãn bước (thuần, có test)
  relay.rs      nhánh --winbar-claude-hook
  pipe.rs       named pipe: server, client, SID, chủ sở hữu (cfg(windows))
  pending.rs    hàng yêu cầu đang treo và các bước (thuần, có test)
  install.rs    đọc/ghép/ghi settings.json, diff (thuần + test trên thư mục tạm)
src/widgets/claude/
  approvals.ts            store + lệnh native
  ApprovalAlert.tsx       pill, thẻ đầy đủ, đồng bộ alert
  SessionsCard.tsx        thêm dòng các bước
src/settings/
  ClaudeHookRow.tsx · claude-hook.ts
```

## 8. Kiểm thử

| Mức | Nội dung |
|---|---|
| Rust thuần | chọn trường từ JSON của hook; bỏ prompt và kết quả tool; cắt chuỗi có đánh dấu; làm sạch ký tự; tóm tắt và `complete`; nhãn bước và ẩn bí mật; JSON trả lời đúng từng byte; thoát nháy cho bash; ghép hook giữ nguyên hook lạ, kể cả khi chung nhóm; gỡ trả lại nguyên trạng; BOM; JSON hỏng, file quá lớn, `hooks` dạng lạ, vân tay cũ, stamp sai đều bị từ chối; sao lưu không đè; hàng đợi: trả lời, nhả, gỡ theo `tool_use_id`, gỡ theo phiên, quá 16; id không đoán được |
| Rust qua pipe thật | relay ↔ server trên một pipe tên riêng của test: allow, deny, nhả, client bỏ đi, server không ack, hết giờ, rác; chủ sở hữu pipe; câu trả lời còn đó sau khi server đóng |
| Exe thật | `winbar.exe --winbar-claude-hook` (debug và release) với pipe server giả bằng PowerShell; qua Git Bash từ thư mục có dấu cách, `$`, backtick, nháy đơn |
| TS | máy trạng thái `detail`; Notch mở thẻ, ghim, tự thu khi alert bị gỡ; `openDetail`; pill: khoá nửa giây, Cho phép hay Xem…, đo tràn; thẻ: cuộn hết mới duyệt, bị cắt thì không duyệt; card hiện các bước; hàng Cài đặt: xem trước → ghi, file đã đổi, pipe không mở được |
| Trình duyệt thật | component thật trong Edge chạy ẩn, điều khiển qua DevTools theo thời gian thật: bấm thật vào nút, xem lệnh nào được gửi |
| Thủ công | `tests/manual-claude-approvals.md`: chạy Claude Code thật, duyệt trên notch, duyệt ở terminal, tắt winbar giữa chừng |

## 9. Tiêu chí hoàn thành

1. Cài hook từ Cài đặt: diff chỉ có các mục của winbar; có file sao lưu; hook của công cụ khác còn nguyên.
2. Claude Code xin quyền: pill hiện trong 1 giây; **Cho phép** làm tool chạy, **Từ chối** làm Claude nhận lời từ chối.
3. Trả lời ở terminal trước: pill tự biến mất (theo §4.4).
4. Thoát winbar rồi để Claude Code xin quyền: terminal hỏi ngay, không trễ thấy được.
5. Lệnh dài, nhiều dòng, hoặc có ký tự đổi chiều chữ: pill không có **Cho phép**, thẻ hiện đúng như §4.5.
6. Gỡ hook: `settings.json` trở lại như trước khi cài.
7. Card Phiên hiện các bước của phiên đang chạy; lượt mới thì bắt đầu lại.
8. Không có câu lệnh, đường dẫn hay prompt nào trong log hoặc file của winbar.
9. `npm test`, `cargo test`, clippy, `npm run lint` qua.

Tiêu chí 9 đã đạt (01/10: 332 test Rust, 539 test giao diện, clippy không có cảnh báo mới, lint sạch). Tiêu chí 1–8 cần
Claude Code thật và bản winbar mới đang chạy: xem checklist.

## 10. Bảo mật: đã chặn gì, chưa chặn được gì

Viết sau hai lượt đọc lại code: một lượt của người viết, một lượt rà soát độc lập (01/10/2026) tìm ra 1 lỗi mức cao,
5 mức vừa, 9 mức thấp. Bảng dưới ghi cả những gì đã sửa theo lượt đó.

| Đã chặn | Cách |
|---|---|
| Tài khoản khác trên máy đọc nội dung tool call, hoặc trả lời `allow` thay bạn | Tên pipe có SID; DACL chỉ một SID; relay kiểm **chủ sở hữu pipe** trước khi ghi byte nào và mở ở mức identification; server từ chối phục vụ chồng lên tên đã có người tạo. *(Sửa sau rà soát: bản đầu kiểm PID của server, giả được bằng cách chờ PID được cấp lại)* |
| Tiến trình sandbox hoặc integrity thấp của chính bạn nối vào pipe | Nhãn bắt buộc mức trung bình, cấm đọc và ghi từ dưới lên; AppContainer bị DACL chặn. Chưa kiểm bằng một tiến trình integrity thấp thật |
| Máy khác nối vào | `PIPE_REJECT_REMOTE_CLIENTS`; không có cổng mạng nào |
| Một dòng trên pipe tự sinh ra `allow` | Không có thông điệp nào làm được việc đó: `allow` chỉ đến từ lệnh `claude_approval_decide`, và lệnh đó chỉ cửa sổ notch gọi được |
| Đoán id để trả lời yêu cầu mình không được hiện | Id 128 bit ngẫu nhiên *(sửa sau rà soát: bản đầu đếm `a1`, `a2`…)* |
| Bấm nhầm **Cho phép** vì pill hiện ra dưới con trỏ | Hai nút quyết định khoá 0,5 giây đầu, tính lại cho mỗi pill |
| Duyệt thứ chưa đọc hết trên pill | **Cho phép** chỉ có khi dòng tóm tắt là toàn bộ yêu cầu và vừa pill; còn lại là **Xem…** *(lỗi mức cao của lượt rà soát; bản đầu luôn có Cho phép)* |
| Duyệt thứ chưa đọc hết trong thẻ | Phải cuộn tới cuối mới bấm được; nội dung bị cắt thì không có nút **Cho phép**; chỗ cắt được đánh dấu tại chỗ |
| Lời model tự kể được hiện như việc nó làm | `description` không được dùng làm tóm tắt |
| Lệnh bị giấu, đảo thứ tự hoặc giả dạng khi vẽ | Ký tự điều khiển, đổi chiều, vô hình, khoảng trắng lạ hiện thành `\u{…}`; `⏎` cho xuống dòng; vẽ theo thứ tự lưu; giá trị nhiều dòng thụt vào nên không giả được trường khác; đường dẫn dài giữ phần cuối |
| HTML/script trong câu lệnh chạy trong notch | Mọi chuỗi là text node; không có `innerHTML` trong `src`. Có test với `<img onerror>` |
| Câu lệnh, đường dẫn, prompt ra đĩa hoặc log | Chỉ trong bộ nhớ khi yêu cầu còn mở; `eprintln!` chỉ in loại lỗi; relay không ghi stderr; sự kiện Tauri rỗng |
| Prompt, kết quả tool, đường dẫn transcript rời khỏi relay | Relay chỉ chép các trường có tên; kiểm trên exe thật: server không thấy chữ nào của prompt |
| Bí mật trong lệnh hiện ở dòng các bước | Lệnh trông như chứa khoá/mật khẩu chỉ hiện tên tool |
| Cửa sổ Cài đặt hay command bar đọc hoặc trả lời yêu cầu | Bốn lệnh về yêu cầu và các bước chỉ cửa sổ notch gọi được |
| Relay giữ chân Claude Code | Hạn giờ ở relay lẫn server; thoát mã 0 mọi nhánh; đo trên exe release khi winbar tắt: 22–196 ms qua 10 lần, trung vị 43 ms |
| Relay bị treo giữ luồng của winbar | Ghi câu trả lời không chờ client đọc; 64 kết nối, 16 yêu cầu, 2 giây đọc là hết |
| Ghi hỏng `settings.json` | Từ chối file không đọc được; xem trước bắt buộc; vân tay + đọc lại lần cuối; sao lưu không đè; ép xuống đĩa; thay nguyên tử; dọn sạch khi hỏng |
| Xoá hook của công cụ khác | Gỡ từng hook đúng nguyên dạng lệnh của winbar *(sửa sau rà soát: bản đầu gỡ cả nhóm chứa cờ)* |
| File tên lạ do trang đưa xuống | `stamp` phải đúng dạng `yyyymmdd-hhmmss`; lệnh ghi chỉ cửa sổ Cài đặt gọi được |
| File hoặc diff khổng lồ làm treo app | Trên 4 MB từ chối; diff chỉ lập bảng cho đoạn thật sự khác, quá lớn thì từ chối; các lệnh này chạy ngoài luồng chính |

| **Chưa chặn được / chưa kiểm** | Vì sao |
|---|---|
| WebView của winbar không có CSP (`"csp": null`, có từ trước module này) | Nếu sau này có một chỗ chèn được script vào cửa sổ notch, script đó gọi được lệnh trả lời. Hiện không tìm thấy chỗ chèn nào. Đặt CSP chặt là việc cho cả app và cần chạy thử app thật (ảnh `data:`, IPC của Tauri), nên chưa làm ở đây |
| Tiến trình khác của chính bạn, cùng integrity | Nó gửi được yêu cầu giả lên pill (không tự duyệt được), và vốn đã sửa được `settings.json` của Claude Code. Không phải lớp winbar chặn được |
| Chữ từ bảng chữ cái khác trông giống chữ Latin | `а` Cyrillic trong tên miền hay đường dẫn vẽ ra y như `a`. Chưa đánh dấu |
| Pill còn treo sau khi cho phép ở terminal một lệnh chạy lâu | §4.4. Bấm vào không gây hại |
| Phiên không có người ngồi trước chờ tới 300 giây | §2. Đổi lại là duyệt được chúng từ notch |
| File `winbar.exe` nằm ở chỗ tài khoản khác ghi được | Hook chạy file đó mỗi tool call, với quyền của bạn. Cũng là rủi ro sẵn có của khởi động cùng Windows; hook làm nó chạy thường xuyên hơn. Để exe trong thư mục của riêng bạn |
| Bản sao lưu tích lại và chứa mọi thứ `settings.json` có (kể cả token trong `env`) | Không tự xoá. Đường dẫn hiện ra sau mỗi lần ghi để bạn tự dọn |
| Khoảng vài mili-giây giữa lần đọc cuối và lúc thay file | Một lần ghi của Claude Code rơi đúng vào đó sẽ bị đè. Bản sao lưu vẫn có bản trước đó |
| `settings.json` là symlink; winbar chạy với quyền admin; máy chỉ có PowerShell | Code có xử lý hoặc hỏng an toàn, nhưng chưa kiểm được trên máy này |
| Nửa giây khoá nút tính từ lúc pill được dựng, không phải lúc cửa sổ thật sự hiện | Chênh nhau vài chục mili-giây |
