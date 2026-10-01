# Checklist thủ công: claude-approvals

> Spec: `SPEC-claude-approvals.md` §9 · Chạy lần đầu: 2026-10-01
> Máy: Windows 11 Pro, Claude Code 2.1.286, Git Bash có sẵn
>
> Ký hiệu: ✅ đã kiểm · 👤 bạn cần tự kiểm · ⚠️ chưa kiểm được trên máy này
>
> **Vì sao còn nhiều 👤:** lúc viết module này winbar bản cũ đang chạy trên máy và bạn đang làm việc. Chạy bản mới
> cần thoát bản đang chạy, và kiểm với Claude Code thật cần một phiên có hộp thoại xin quyền. Tôi không làm hai việc
> đó thay bạn. Mọi thứ không cần chúng đã được kiểm bằng test tự động, trên file exe thật, hoặc trên component thật
> trong trình duyệt chạy ẩn; ghi rõ bên dưới là kiểm bằng cách nào.

## Cách chạy

| Việc | Lệnh |
|---|---|
| Tự động | `npm test` · `cargo test --manifest-path src-tauri/Cargo.toml` · `npm run lint` |
| Bản để dùng thử | Thoát winbar đang chạy (khay hệ thống › Thoát winbar), rồi `npm run tauri dev` hoặc build lại như thường |
| Relay trên exe thật (mục 1) | `tests/tools/claude-relay-check.ps1 -Exe <winbar.exe>` · `tests/tools/claude-hook-bash-check.ps1 -Exe <winbar.exe>`. Cả hai cần winbar **không** chạy (chúng đứng thay server trên đúng tên pipe), không mở cửa sổ nào và không gửi phím hay chuột |

## 1. Relay: không bao giờ giữ chân Claude Code

Kiểm trên **file exe thật** (bản debug và bản release build ra thư mục riêng), bằng một pipe server giả viết bằng
PowerShell đứng đúng tên pipe thật.

- [x] ✅ winbar không chạy: relay thoát mã 0, không in gì. Bản release: 22–196 ms (10 lần, trung vị 43 ms).
- [x] ✅ stdin không phải JSON: thoát mã 0, không in gì.
- [x] ✅ Server trả `allow`: stdout đúng `{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow"}}}`.
- [x] ✅ Server trả `deny`: stdout là JSON `deny` kèm `message`.
- [x] ✅ Server đóng mà không nói gì, hoặc nói một chữ lạ (`always`): không in gì.
- [x] ✅ Bản release (không có cửa sổ console) vẫn ghi được stdout khi được gọi qua pipe.
- [x] ✅ Gọi qua **Git Bash** đúng chuỗi lệnh ghi vào `settings.json`, từ thư mục tên ``odd $HOME `id` it's dir``:
      chạy đúng exe, trả đúng JSON. Không có gì trong tên thư mục bị shell diễn giải.
- [x] ✅ Dòng server nhận được chỉ có `event`, `session`, `cwd`, `tool`, `toolUseId`, `input`, `truncated` — không có
      `transcript_path`. Với `UserPromptSubmit`: chỉ `event` và `session`, **không có nội dung prompt**.
- [x] ✅ stderr rỗng trong cả bảy trường hợp.
- [x] ✅ Relay kiểm chủ sở hữu của pipe (không còn kiểm PID) và vẫn nói chuyện được với server của cùng tài khoản.
- [ ] ⚠️ Pipe do **tài khoản khác** tạo trước: relay phải im lặng. Máy này không có tài khoản thứ hai để dựng tình
      huống; chỉ có test "không đọc được chủ sở hữu thì không tin".

## 2. Server và hàng đợi (test tự động qua pipe thật)

- [x] ✅ Cho phép / Từ chối / Để terminal hỏi tới đúng relay đang chờ.
- [x] ✅ Trang không xác nhận đã hiện pill: nhả sau hạn ngắn, không chờ đủ 300 giây.
- [x] ✅ Không ai bấm: nhả đúng hạn, yêu cầu biến khỏi danh sách.
- [x] ✅ Relay bị dừng giữa chừng: yêu cầu tự biến mất; bấm muộn không tới đâu cả.
- [x] ✅ `PostToolUse` cùng `tool_use_id`: yêu cầu đang treo được nhả.
- [x] ✅ Các bước cộng dồn; `UserPromptSubmit` xoá sạch.
- [x] ✅ Rác trên pipe: không đổi gì, không phát sự kiện.
- [x] ✅ winbar thứ hai không phục vụ chồng lên cùng tên pipe.
- [x] ✅ Câu trả lời vẫn tới relay sau khi server đã đóng đầu của nó (server không chờ relay đọc).
- [ ] ⚠️ Tiến trình integrity thấp của cùng tài khoản không mở được pipe: nhãn đã đặt, chưa có tiến trình như vậy để thử.

## 3. Cài và gỡ hook

- [x] ✅ Test tự động đi hết một vòng trên thư mục tạm với file có BOM và CRLF, có hook của công cụ khác ở cùng sự
      kiện: xem trước → cài → cài lần nữa (không đổi gì, không thêm bản sao lưu) → gỡ → file đúng từng byte như ban đầu.
- [x] ✅ File hỏng, file đã đổi sau khi xem trước, file trên 4 MB, mục `hooks` dạng lạ: từ chối, không ghi gì, không
      tạo file nào.
- [x] ✅ Hook của bạn nằm chung nhóm với hook của winbar: gỡ winbar thì hook của bạn còn nguyên.
- [x] ✅ Cài rồi gỡ trong cùng một giây: hai bản sao lưu, không cái nào đè cái nào.
- [ ] ⚠️ `settings.json` là symlink: code ghi vào file đích; máy này không tạo được symlink nên test tự bỏ qua.
- [x] ✅ Trên máy thật (01/10, bản dev): Cài đặt › Claude › *Cài hook…* thêm 5 mục chứa `--winbar-claude-hook`, đường
      dẫn exe đúng là bản winbar đang chạy, có file `settings.json.winbar-<ngày-giờ>.bak` cạnh `settings.json`.
- [x] ✅ Cài trên máy thật (01/10, bản dev): `settings.json` có đúng 5 hook của winbar; bỏ 5 hook đó ra thì file trùng
      khớp với bản sao lưu, kể cả thứ tự khoá. Hook của các công cụ khác còn nguyên, đúng thứ tự.
- [ ] 👤 *Gỡ hook…* rồi so lại với bản sao lưu: chỉ khác cách viết JSON, nếu có.

## 4. Trên notch, với Claude Code thật

> Phiên Claude Code phải ở chế độ hỏi quyền (`claude --permission-mode default`). Ở chế độ `auto`, Claude Code tự
> duyệt phần lớn lệnh và không phát yêu cầu nào, nên pill không có gì để hiện.
> 01/10: một yêu cầu thử gửi qua đúng đường hook vào bản dev đang chạy được giữ chờ trả lời (pill hiện); chủ dự án
> dùng thử và chốt. Các mục dưới chưa được ghi lại từng mục.

- [ ] 👤 Mở một phiên Claude Code **mới** (sau khi cài hook), bảo nó chạy một lệnh ngắn chưa được cấp quyền (ví dụ
      `npm test`). Trong 1 giây pill hiện tên project, câu lệnh, **Từ chối** và **Cho phép**. Terminal vẫn hiện hộp
      thoại như thường.
- [ ] 👤 Bấm **Cho phép** trên pill: lệnh chạy, hộp thoại trong terminal tự đóng.
- [ ] 👤 Lần khác, bấm **Từ chối**: Claude nhận lời từ chối ("Denied by the user from winbar.").
- [ ] 👤 Một lệnh dài, hoặc một lần sửa file: pill có **Xem…** thay cho **Cho phép**. Bấm vào: thẻ mở, hiện đủ tham
      số. Rê chuột ra ngoài: thẻ vẫn mở. Nội dung dài thì phải cuộn hết mới bấm được **Cho phép**.
- [ ] 👤 Lần khác, trả lời **trong terminal** trước: pill tự biến mất. Với lệnh chạy nhanh là gần như ngay; với lệnh
      chạy lâu, pill có thể còn tới khi lệnh xong (giới hạn đã biết, spec §4.4).
- [ ] 👤 Trong thẻ, **Để terminal hỏi**: pill biến mất, terminal vẫn đang hỏi.
- [ ] 👤 Thoát winbar rồi để Claude Code xin quyền: terminal hỏi ngay, không thấy trễ.
- [ ] 👤 Ẩn notch từ khay hệ thống rồi để Claude Code xin quyền: không có gì hiện, terminal hỏi như thường.
- [ ] 👤 Mở panel khi Claude đang chạy tool: dưới tên phiên có ba bước gần nhất, bước cuối có ánh chạy.
- [ ] 👤 **Phiên không có người** (`claude -p "…"` với một lệnh cần quyền): yêu cầu có lên pill không, và nếu không
      bấm thì sau bao lâu phiên đó đi tiếp. Spec §2 dự đoán: có lên, và chờ tới 5 phút. Nếu bạn hay chạy tự động hoá
      kiểu này và 5 phút là quá lâu, báo lại để rút ngắn.

## 5. Giao diện

Component thật (không phải mockup) trong Edge chạy ẩn với dữ liệu giả, điều khiển qua DevTools theo thời gian thật:
chuột bấm thật vào nút trong trang, rồi đọc lại trạng thái và lệnh đã gửi.

- [x] ✅ Lệnh ngắn (`npm test -- cart`): pill 490×40 có **Cho phép**; bấm thì gửi `allow` và pill về 340×36.
- [x] ✅ Lệnh dài hơn pill (`git push origin checkout-fix --force-with-lease`): pill có **Xem…**; bấm thì thẻ mở
      560 rộng; rê chuột ra ngoài thẻ vẫn mở; **Cho phép** trong thẻ gửi `allow`.
- [x] ✅ Sửa file 22 dòng: **Cho phép** trong thẻ khoá; bấm thật vào nút đang khoá không gửi gì; cuộn hết thì mở
      khoá; bấm thì gửi `allow`.
- [x] ✅ Nội dung bị cắt: thẻ chỉ có **Từ chối** và **Để terminal hỏi**; nút sau gửi `release`.
- [x] ✅ Ảnh chụp: pill, thẻ, panel có ba bước, hàng Cài đặt với khung diff tô màu.
- [ ] 👤 **Chuyển động thật.** Mở và đóng panel vài lần: mở có nảy nhẹ, đóng không nảy, viền notch bám theo suốt lúc
      co giãn. Nếu thấy giật hoặc viền bị cắt ở mép cửa sổ thì báo lại. Tôi chỉ kiểm được kích thước cuối, không
      nhìn được chuyển động.
- [ ] 👤 Tắt "Animation effects" của Windows: notch đổi trạng thái tức thì.
- [ ] 👤 Nửa giây đầu sau khi pill hiện, **Từ chối** và **Cho phép** mờ và không bấm được.

## 6. Riêng tư và bảo mật (tiêu chí 8)

Xem `SPEC-claude-approvals.md` §10 để biết đã chặn gì và **chưa chặn được gì**.

- [x] ✅ `eprintln!` trong module chỉ in loại lỗi (`err.kind()`), không in đường dẫn, lệnh hay tên phiên.
- [x] ✅ Không có đường nào ghi yêu cầu hay các bước ra đĩa: `pending.rs` không mở file nào.
- [x] ✅ Lệnh có thẻ HTML hiện thành chữ; ký tự đổi chiều chữ, ký tự vô hình và khoảng trắng lạ hiện thành `\u{…}`.
- [x] ✅ Lệnh trông như chứa khoá/mật khẩu không hiện ở dòng các bước.
- [x] ✅ Chỉ cửa sổ notch gọi được các lệnh về yêu cầu; chỉ cửa sổ Cài đặt gọi được lệnh ghi `settings.json`.
- [x] ✅ Một lượt rà soát bảo mật độc lập đã đọc toàn bộ module; các lỗi tìm ra đã sửa hoặc ghi lại ở spec §10.
- [ ] 👤 Sau một buổi dùng: tìm trong log dev và thư mục `%APPDATA%\winbar` xem có câu lệnh nào bạn đã duyệt không.
      Không được có.
