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
- [x] Orca: `winbar · firefish`; `makara` và `fangtooth` **cùng** hiện `acme-theme-v3`; `brain` không có tiền tố.
- [x] Phiên idle 368/417/1420 phút bị đánh dấu `stale` và xuống dưới các phiên sống.
- [x] Test Rust 24 test mới; tổng 180 pass, clippy sạch.
- [ ] 👤 Mở một phiên Claude mới ở cửa sổ khác rồi xem card đổi trong **3–4 giây** (nhịp quét 3 giây từ 21/09; kiểm ở Task 3, khi đã có giao diện).

**Lỗi tự bắt được khi đang viết:**
1. Bản đầu theo dõi bằng `mtime` của **thư mục** — nhưng sửa nội dung file không làm đổi mtime thư mục, nên đổi
   trạng thái phiên sẽ bị bỏ sót hoàn toàn. Đổi sang vân tay (tên + cỡ + mtime) của từng file.
2. Vân tay lấy mtime theo **giây**: hai lần ghi trong cùng một giây với cùng độ dài sẽ trùng nhau — mà đổi phase
   đúng là kiểu ghi đó. Đổi sang mili-giây. Có test khẳng định cả hai điều này.

**Phụ thuộc:** không
**Quy mô:** M

### Task 2: Rust — hạn mức qua WinHTTP, parser, cache ✅

**Mô tả:**
- **`http.rs`:** một hàm `get(url, headers) -> Result<Vec<u8>, HttpError>` bằng WinHTTP; handle đóng bằng `Drop`;
  timeout 10 giây; phân biệt lỗi HTTP 401/403 với lỗi mạng.
- **`usage.rs`:** đọc token từ `.credentials.json` (không log, không lưu); chọn cửa sổ hạn mức theo §3.3;
  cache `%APPDATA%\winbar\claude-usage.json` TTL 120 giây; lỗi thì trả cache kèm mã lỗi.
- **Lệnh:** `claude_usage(force)`.

**Tiêu chí chấp nhận:**
- [x] Gọi thật qua WinHTTP trên app đang chạy: **5h 25%** (reset 22:00), **7d 27%**, **Fable 10%** — 776 ms.
- [x] Gọi lần hai: lấy cache, **20 ms**, không ra mạng.
- [x] Không có credentials: trả `no-login`, không chạm mạng (test Rust).
- [x] Host không tồn tại: trả `network` và **không treo** (test Rust gọi WinHTTP thật).
- [x] Token không lọt: quét 25 file (log dev + mọi file winbar ghi) — không thấy. Cache trên đĩa chỉ có % và giờ reset.
- [x] Test Rust: 3 dạng payload, thiếu trường, giá trị ngoài khoảng, per-model trùng, cache hỏng. Tổng 193 pass.

**Ghi chú:** hook `block_secrets.py` của bạn chặn đúng lệnh kiểm token đầu tiên tôi viết (vì tôi đưa token vào biến
shell). Đã viết lại để token không rời khỏi tiến trình Python. Lớp bảo vệ đó chạy đúng.

**Phụ thuộc:** không
**Quy mô:** M

### Task 3: Card "Phiên Claude" + ảnh trạng thái luân phiên ✅

**Mô tả:** card theo mockup; `icons.rs` gom bộ ảnh kèm app + `%APPDATA%\winbar\claude-icons\<trạng thái>\`
(≤ 12 file, ≤ 2 MB, đuôi hợp lệ) thành data URL; component luân phiên ảnh mỗi 6 giây, chỉ khi thấy được.

**Tiêu chí chấp nhận:**
- [x] Trên app thật: `winbar · firefish` (Cooking · Bash, ảnh động), `brain`, `acme-theme-v3 · fangtooth`,
      rồi mục "Đã lâu không hoạt động" và "Phiên Desktop gần đây" — đúng 8 dòng.
- [x] Panel cao 442 px, card 430 px: **nằm trọn trong cửa sổ**, danh sách cuộn bên trong (chặn ~6 dòng).
- [x] Bấm một dòng mở đúng thư mục (test component).
- [x] Ảnh luân phiên 6 giây khi phase có > 1 ảnh; thêm ảnh vào thư mục người dùng thì `idle` cũng luân phiên.
- [x] **Không timer nào chạy** khi phase chỉ có 1 ảnh, khi tắt luân phiên, hay sau khi rời card (test dùng fake timer).
- [x] Test: 21 test mới (10 thuần + 11 component); tổng TS 415, Rust 200, lint sạch.

**Ảnh thứ ba:** `working.gif` lấy từ yasb — theo `NOTICE.md` của yasb đó là ảnh bạn tự đưa vào, nên dùng lại được.
Đã ghi xuất xứ ở `src/assets/claude/NOTICE.md`. `spark_*.png` (MIT, của m1ckc3s) **không** sao chép vào.

**Phụ thuộc:** Task 1
**Quy mô:** M

### Task 4: Card "Hạn mức" + nội dung pill + tự ẩn ✅

**Tiêu chí chấp nhận:**
- [x] Trên app thật: **5 giờ 6%** (Reset sau 4h 40m) · **7 ngày 30%** (Reset sau 8h 40m) · **Fable 10%**.
- [x] Pill khi thu gọn: **"Cooking · Bash · winbar · 5h 6%"** kèm ảnh động; `permission` ra màu `--warn`.
- [x] Màu đổi theo ngưỡng 75% / 90% (test component đọc `data-level`).
- [x] Lỗi mạng giữ số cũ và ghi "số từ 8 phút trước"; `no-login` và `auth` hiện đúng câu, không bịa số.
- [x] Không có phiên sống nào: `ClaudeBackground` gọi `setHidden(true)`; có phiên thì gọi lại `false`.
- [x] Test: 21 test mới; tổng TS 436, Rust 200, lint sạch.

**Một việc sửa ngoài kế hoạch:** `SettingsApp.test.tsx` hết giờ ở 15 s (chạy mất 20,5 s) nên nâng `testTimeout`
lên 30 s. Trong lúc đó phát hiện suite thỉnh thoảng **rớt một file test** — hóa ra là `spawn EPERM` của vitest khi
máy tải nặng, và vitest **có** báo (`Errors 1 error`, exit code 1); chỉ là dòng "Tests N passed" vẫn xanh nên dễ
nhầm. Đã ghi chú trong `vite.config.ts`: xem exit code, đừng chỉ nhìn dòng đó.

**Phụ thuộc:** Task 2 (và Task 1 cho pill)
**Quy mô:** M

## Checkpoint: bạn dùng thử

- [ ] Bạn kiểm: trạng thái có khớp thực tế không, số hạn mức có đúng không, notch có bị dài ra không

### Task 5: Provider command bar + mục Cài đặt ✅

**Tiêu chí chấp nhận:**
- [x] Cài đặt trên app thật: mục "Claude" đủ 4 dòng, có trong thanh bên.
- [x] Provider: `cl` ra phiên + dòng hạn mức; tìm theo project (`winbar`, `acme`), theo worktree (`firefish`),
      và theo tool (`bash`); dòng lịch sử Desktop **không** vào; mọi dòng `remember: false` — 8 test.
- [x] Tắt layout thì Rust không đọc gì: `claude_sessions` trả rỗng, `claude_usage` không mở credentials, luồng
      theo dõi bỏ qua cả việc liệt kê thư mục.
- [x] Cảnh báo hạn mức: đẩy pill alert một lần cho mỗi chu kỳ reset, tắt được bằng ngưỡng 0.
- [ ] 👤 **Cần bạn thử tay:** bấm Ctrl+Space rồi gõ `cl`. Tôi không kiểm được trên máy — xem ghi chú dưới.

**Vì sao không tự kiểm được command bar:** cửa sổ command bar khi đang ẩn bị WebView2 bóp cổ, một lệnh IPC mất
**3–7,7 giây** (từ cửa sổ notch chỉ ~20 ms), nên **mọi** provider timeout ở mốc 1,5 giây — kể cả `files` và
`clipboard` vốn đã chạy tốt. Không phải lỗi code. Hiện cửa sổ lên thì cần thêm quyền `window:allow-show`, mà thêm
quyền chỉ để test thì không đáng.

**Phụ thuộc:** Checkpoint
**Quy mô:** M

### Task 6: Đo hiệu năng, checklist thủ công

**Tiêu chí chấp nhận:**
- [x] ✅ Bản release: RAM tăng **~0 MB**; CPU **+0,010** trung bình (ba lần: −0,018 / +0,031 / +0,017) — đạt
      ngưỡng +0,02, và đã nhỏ hơn nhiễu của phép đo. Mất **năm vòng** mới tìm ra thủ phạm thật là cú quét 157
      file lịch sử Desktop trong luồng nền; xem `tests/manual-claude.md` §7.
- [x] ✅ `tests/manual-claude.md` viết đủ theo 12 tiêu chí của spec §11, gồm mục kiểm token không lọt ra log
      (`python token-leak-check.py`, quét 26 file, sạch).

**Phụ thuộc:** Task 5
**Quy mô:** S
