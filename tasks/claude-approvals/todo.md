# Tasks: claude-approvals

> Plan: `plan.md` cùng thư mục · Spec: `SPEC-claude-approvals.md`
> Lệnh chung: `npm test` · `cargo test --manifest-path src-tauri/Cargo.toml` · `npm run lint` · `npm run tauri dev`

### Task 1: Rust — giao thức và hàng đợi (thuần) ✅

- `protocol.rs`: chọn trường từ JSON của hook, cắt chuỗi, làm sạch ký tự, dòng tóm tắt, nội dung thẻ, nhãn bước,
  JSON trả lời. `pending.rs`: hàng yêu cầu đang treo, các bước theo phiên.
- **Chấp nhận:** prompt và kết quả tool không bao giờ nằm trong dòng gửi qua pipe; ký tự đổi chiều chữ hiện thành
  `\u{…}`; JSON trả lời đúng từng byte; câu trả lời chỉ tới đúng yêu cầu của nó.
- **Kiểm tra:** `cargo test claude::approvals::protocol` · `cargo test claude::approvals::pending`
- **File:** `claude/approvals/{protocol,pending}.rs` · **Quy mô:** M

### Task 2: Rust — named pipe, relay, server ✅

- `pipe.rs`: server có DACL một SID, client kiểm tra SID của server, đọc có hạn giờ. `relay.rs`: nhánh
  `--winbar-claude-hook`. `mod.rs`: `serve()`, cổng vào, lệnh Tauri.
- **Chấp nhận:** allow / deny / nhả / hết giờ / trang không xác nhận / client bỏ đi đều đúng **qua pipe thật**;
  winbar tắt thì relay thoát ngay; chỉ cửa sổ notch gọi được lệnh trả lời.
- **Kiểm tra:** `cargo test claude::approvals` (83 test) · chạy exe debug **và** release với pipe server giả.
- **File:** `claude/approvals/{pipe,relay,mod}.rs`, `lib.rs`, `main.rs`, `Cargo.toml` · **Quy mô:** L

### Task 3: Rust — cài và gỡ hook ✅

- `install.rs`: đọc, ghép, diff, vân tay, sao lưu, ghi nguyên tử; trạng thái `absent` / `installed` / `stale`.
- **Chấp nhận:** hook của công cụ khác giữ nguyên vị trí; gỡ xong file trở lại đúng từng byte; file hỏng, file đã
  đổi, mục `hooks` dạng lạ đều bị từ chối trước khi ghi bất cứ gì.
- **Kiểm tra:** `cargo test claude::approvals::install` (có test đi hết một vòng trên đĩa).
- **File:** `claude/approvals/install.rs` · **Quy mô:** M

### Task 4: Shell — thẻ riêng của alert, ghim, chuyển động ✅

- `PillAlert.Detail`; `NotchState.detail`, sự kiện `detailGone`; rộng 560; M1 mới (lò xo mở, 340 ms đóng).
- **Chấp nhận:** bấm chữ của alert có `Detail` mở thẻ chứ không mở panel; chuột rời không đóng; alert bị gỡ thì thẻ
  tự thu và **không** nháy panel; khay hệ thống vẫn mở panel; alert không có `Detail` giữ hành vi cũ.
- **Kiểm tra:** `npx vitest run src/shell`
- **File:** `shell/{widget-contract,notch-machine,notch-sizes,Notch}.ts(x)`, `Notch.module.css`, `tokens.css` · **Quy mô:** M

### Task 5: Pill, thẻ duyệt quyền, dòng các bước ✅

- `approvals.ts` (store), `ApprovalAlert.tsx` (pill + thẻ + đồng bộ alert), các bước trong `SessionsCard`.
- **Chấp nhận:** pill báo cho Rust là đã hiện; nút khoá 0,5 giây đầu; *Cho phép* chỉ có khi pill hiện đủ, còn lại
  là *Xem…*; thẻ phải cuộn hết, nội dung bị cắt thì không có *Cho phép*; bấm hai lần chỉ gửi một câu trả lời; nhiều
  yêu cầu xếp hàng; yêu cầu bị gỡ ở Rust thì pill tự về; lệnh có thẻ HTML hiện thành chữ.
- **Kiểm tra:** `npx vitest run src/widgets/claude`
- **File:** `widgets/claude/{approvals.ts,ApprovalAlert.tsx,SessionsCard.tsx,ClaudePill.tsx,Claude.module.css}` · **Quy mô:** M

### Task 6: Cài đặt › Claude › Duyệt quyền trên notch ✅

- `ClaudeHookRow.tsx`: trạng thái, xem trước, ghi, báo lỗi.
- **Chấp nhận:** không có đường nào ghi mà chưa xem trước; ghi thất bại vì file đã đổi thì hiện lý do và bản xem
  trước mới.
- **Kiểm tra:** `npx vitest run src/settings/ClaudeHookRow.test.tsx`
- **File:** `settings/{ClaudeHookRow.tsx,claude-hook.ts,ClaudeSection.tsx}` · **Quy mô:** S

### Task 7: Rà bảo mật, kiểm trên exe thật, tài liệu ✅

- Đọc lại code tìm lỗ hổng, rồi một lượt rà soát độc lập (kết quả và những gì đã sửa: spec §10); chạy relay thật
  qua Git Bash từ thư mục có dấu cách, `$`, backtick và nháy đơn; dựng component thật trong Edge chạy ẩn với dữ
  liệu giả và bấm thật vào nút qua DevTools.
- **Chấp nhận:** `npm test`, `cargo test`, clippy, `npm run lint`, `npm run build` qua.

**Lỗi tự bắt được, và lỗi người khác bắt hộ:**
1. `serde_json` mặc định sắp khoá theo ABC: ghi lại `settings.json` sẽ đảo hết thứ tự khoá của bạn. Bật `preserve_order`.
2. Một client ghi xong rồi thoát trước khi server kịp `ConnectNamedPipe` làm hàm đó báo `ERROR_NO_DATA`; bản đầu coi
   là lỗi và bỏ mất sự kiện. Có test.
3. React strict mode gỡ rồi gắn lại component: bản đầu giữ danh sách "đã đẩy lên pill" qua lần gắn lại nên alert
   biến mất. Có test.
4. *(rà soát)* *Cho phép* luôn có trên pill dù pill chỉ hiện ~30 ký tự; `description` do model viết được hiện như nội
   dung yêu cầu; tool không có trường "đích" thì pill không hiện tham số nào mà vẫn duyệt được.
5. *(rà soát)* Relay tin server theo PID. PID là của tiến trình tạo pipe, có thể đã chết và được cấp lại.
6. *(rà soát)* Gỡ hook theo nhóm: hook của bạn nằm chung nhóm với hook của winbar sẽ bị xoá theo.
7. *(rà soát)* Id yêu cầu đếm từ 1; cú bấm trùng lúc hết hạn bị mất; `FlushFileBuffers` chờ client vô hạn.
8. Ảnh chụp bằng đồng hồ giả của trình duyệt chạy ẩn cho thấy pill sai (lệnh ngắn mà hiện *Xem…*). Đo lại theo thời
   gian thật thì đúng: `ResizeObserver` không được gọi đủ dưới đồng hồ giả. Không phải lỗi của app, nhưng mất một
   vòng mới biết.

### Checkpoint: bạn dùng thử 👤

Những việc cần Claude Code thật và notch thật trên màn hình, tôi không tự làm được khi bạn đang dùng máy:
`tests/manual-claude-approvals.md`, các mục đánh dấu 👤.
