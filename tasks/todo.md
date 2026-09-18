# Tasks: claude-sessions + claude-usage

> Plan: `tasks/plan.md` · Spec: `SPEC-claude.md`
> Lệnh chung: `npm test` · `cargo test --manifest-path src-tauri/Cargo.toml` · `npm run lint` · `npm run tauri dev`

### Task 1: Rust — phiên đang sống, lịch sử Desktop, tên project theo Orca ✅

**Mô tả:**
- **`sessions.rs`:** đọc `~/.claude/statusbar/state.d/*.json`; bỏ file hỏng, file quá 24 giờ; đọc lịch sử Desktop
  từ `%APPDATA%\Claude\{claude-code-sessions,local-agent-mode-sessions}\**\local_*.json` (tối đa 3, bỏ archive).
- **Phần thuần (có test):** tách `<gốc>/workspaces/<project>/<worktree>` của Orca (§3.4); sắp thứ tự
  `permission → tool → thinking → idle`, cùng bậc thì `ts` mới hơn trước; gom trùng `cwd` theo quy tắc bóng ma (§5.2).
- **Theo dõi:** luồng riêng xem `mtime` của `state.d` mỗi 1 giây, phát `claude-sessions-changed` khi đổi.
- **Lệnh:** `claude_sessions()`.

**Tiêu chí chấp nhận:**
- [x] `claude_sessions` trả đúng 9 dòng thật trên máy: 6 phiên sống + 3 dòng lịch sử Desktop, đúng badge.
- [x] Orca: `winbar · firefish`; `makara` và `fangtooth` **cùng** hiện `qikify-theme-v3`; `brain` không có tiền tố.
- [x] Phiên idle 368/417/1420 phút bị đánh dấu `stale` và xuống dưới các phiên sống.
- [x] Test Rust 24 test mới; tổng 180 pass, clippy sạch.
- [ ] 👤 Mở một phiên Claude mới ở cửa sổ khác rồi xem card đổi trong 1 giây (kiểm ở Task 3, khi đã có giao diện).

**Lỗi tự bắt được khi đang viết:**
1. Bản đầu theo dõi bằng `mtime` của **thư mục** — nhưng sửa nội dung file không làm đổi mtime thư mục, nên đổi
   trạng thái phiên sẽ bị bỏ sót hoàn toàn. Đổi sang vân tay (tên + cỡ + mtime) của từng file.
2. Vân tay lấy mtime theo **giây**: hai lần ghi trong cùng một giây với cùng độ dài sẽ trùng nhau — mà đổi phase
   đúng là kiểu ghi đó. Đổi sang mili-giây. Có test khẳng định cả hai điều này.

**Phụ thuộc:** không
**Quy mô:** M

### Task 2: Rust — hạn mức qua WinHTTP, parser, cache

**Mô tả:**
- **`http.rs`:** một hàm `get(url, headers) -> Result<Vec<u8>, HttpError>` bằng WinHTTP; handle đóng bằng `Drop`;
  timeout 10 giây; phân biệt lỗi HTTP 401/403 với lỗi mạng.
- **`usage.rs`:** đọc token từ `.credentials.json` (không log, không lưu); chọn cửa sổ hạn mức theo §3.3;
  cache `%APPDATA%\winbar\claude-usage.json` TTL 120 giây; lỗi thì trả cache kèm mã lỗi.
- **Lệnh:** `claude_usage(force)`.

**Tiêu chí chấp nhận:**
- [ ] Gọi thật trên máy: trả đúng số của tài khoản (so với `/usage` trong Claude Code).
- [ ] Gọi lần hai trong 120 giây: không ra mạng (cache), `force = true` thì có.
- [ ] Đổi tên `.credentials.json`: trả `error = "no-login"`, **không** gọi mạng, không crash.
- [ ] Ngắt mạng: giữ số cache, `error = "network"`.
- [ ] Không có chuỗi token nào trong log hay trong struct trả về frontend.
- [ ] Test Rust: parser với 3 dạng payload (chỉ `five_hour`/`seven_day`, chỉ `limits`, cả hai), thiếu trường, cache hết hạn.

**Phụ thuộc:** không
**Quy mô:** M

### Task 3: Card "Phiên Claude" + ảnh trạng thái luân phiên

**Mô tả:** card theo mockup; `icons.rs` gom bộ ảnh kèm app + `%APPDATA%\winbar\claude-icons\<trạng thái>\`
(≤ 12 file, ≤ 2 MB, đuôi hợp lệ) thành data URL; component luân phiên ảnh mỗi 6 giây, chỉ khi thấy được.

**Tiêu chí chấp nhận:**
- [ ] Card hiện đúng danh sách, `winbar · firefish`, mục "đã lâu không hoạt động" ở cuối.
- [ ] Bấm một dòng mở đúng thư mục.
- [ ] Ảnh luân phiên khi có > 1 ảnh; thả thêm ảnh vào thư mục người dùng thì lần mở panel sau đã thấy.
- [ ] Rời card thì không còn timer nào chạy (test component).
- [ ] Test: chữ/màu theo trạng thái, luân phiên, card rỗng.

**Phụ thuộc:** Task 1
**Quy mô:** M

### Task 4: Card "Hạn mức" + nội dung pill + tự ẩn

**Tiêu chí chấp nhận:**
- [ ] Card hiện 5 giờ / 7 ngày, giờ reset đếm ngược, dòng theo model khi có.
- [ ] Màu đổi theo ngưỡng 75% / 90%; lỗi auth và lỗi mạng hiện đúng câu, số cũ ghi rõ là cũ.
- [ ] Pill hiện trạng thái phiên sôi động nhất + `5h <pct>%`; `permission` ra màu vàng.
- [ ] Không có phiên nào: widget tự ẩn khỏi pill.
- [ ] Test component cho cả 4 trạng thái lỗi.

**Phụ thuộc:** Task 2 (và Task 1 cho pill)
**Quy mô:** M

## Checkpoint: bạn dùng thử

- [ ] Bạn kiểm: trạng thái có khớp thực tế không, số hạn mức có đúng không, notch có bị dài ra không

### Task 5: Provider command bar + mục Cài đặt

**Tiêu chí chấp nhận:**
- [ ] `cl` ra danh sách phiên + một dòng hạn mức; tìm được theo cả tên project lẫn worktree.
- [ ] Cài đặt: bật/tắt layout Claude, thời gian luân phiên ảnh, ngưỡng cảnh báo, hiện lịch sử Desktop.

**Phụ thuộc:** Checkpoint
**Quy mô:** M

### Task 6: Đo hiệu năng, checklist thủ công

**Tiêu chí chấp nhận:**
- [ ] Bản release: RAM tăng ≤ 12 MB; CPU khi panel đóng ≤ trước module + 0,02%.
- [ ] `tests/manual-claude.md` theo 12 tiêu chí của spec §11, gồm mục kiểm token không lọt ra log.

**Phụ thuộc:** Task 5
**Quy mô:** S
