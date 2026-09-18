# Checklist thủ công: claude-sessions + claude-usage

> Spec: `SPEC-claude.md` §11 · Chạy lần đầu: 2026-09-18 (Task 1–6)
> Máy: Windows 11 Pro ARM64, 12 nhân, RAM 31.6 GB, màn 1920×1200 ở 125%, WebView2 153
>
> Ký hiệu: ✅ qua · 👤 bạn cần tự kiểm · ⚠️ qua nhưng có ghi chú

## Cách chạy

| Việc | Lệnh |
|---|---|
| Tự động | `npm test` · `cargo test --manifest-path src-tauri/Cargo.toml` · `npm run lint` |
| Đọc phiên qua app đang chạy | `node claude-card.mjs` (scratchpad) |
| Kiểm token không rò | `python token-leak-check.py` (scratchpad) |

> ⚠️ **Đọc kết quả `npm test` cho đúng:** máy này thỉnh thoảng không spawn được worker (`spawn EPERM`) và một file
> test bị bỏ. Vitest báo `Errors 1 error` và **exit code 1**, nhưng dòng "Tests N passed" vẫn xanh. **Xem exit code.**

## 1. Phiên đang sống (tiêu chí 1, 2, 3)

Đọc `claude_sessions` trên máy thật, 9 dòng:

| Dòng | Nguồn | Trạng thái |
|---|---|---|
| `winbar · firefish` | cli | `Cooking · Bash` |
| `brain` | cli | idle — ngoài Orca nên không có tiền tố project |
| `qikify-theme-v3 · fangtooth` | cli | idle |
| `Agent-Reach`, `qikify-marketing-skills` | desktop | idle, **stale** (368/417 phút) |
| 3 dòng lịch sử Desktop | history | kèm số lượt |

- [x] ✅ `makara` và `fangtooth` cùng hiện `qikify-theme-v3` — thấy được là cùng một project.
- [x] ✅ Phiên idle quá 2 giờ xuống mục "Đã lâu không hoạt động", chữ mờ.
- [x] ✅ Bấm một dòng mở đúng thư mục (test component).
- [ ] 👤 Mở một phiên Claude mới ở cửa sổ khác: card đổi trong 1 giây.
- [ ] 👤 Một phiên **chờ duyệt quyền**: pill chuyển vàng "wait for you" và dòng đó nổi lên đầu.

## 2. Hạn mức (tiêu chí 4, 5, 6)

- [x] ✅ Gọi thật qua WinHTTP: 5 giờ **6%** (Reset sau 4h 40m), 7 ngày **30%**, Fable 10%.
- [x] ✅ Gọi lại trong 120 giây lấy cache (20 ms, không ra mạng); nút cập nhật ép gọi mới.
- [x] ✅ Không có credentials: trả `no-login`, **không** chạm mạng, card hiện `—` chứ không bịa số.
- [x] ✅ Host không tồn tại: trả lỗi mạng, không treo (test gọi WinHTTP thật).
- [ ] 👤 So số với `/usage` trong Claude Code.
- [ ] 👤 Rút mạng: card giữ số cũ và ghi rõ "số từ N phút trước"; cắm lại thì tự cập nhật.

## 3. Ảnh trạng thái (tiêu chí 7)

- [x] ✅ Ba ảnh kèm app; `thinking`/`tool` có hai ảnh nên luân phiên 6 giây.
- [x] ✅ **Không timer nào chạy** khi phase chỉ có một ảnh, khi tắt luân phiên, hay sau khi rời card.
- [x] ✅ Đọc thư mục người dùng: bỏ file quá 2 MB, file rỗng, đuôi lạ (`.exe`, `.txt`, `.svg`); chặn 12 file mỗi thư mục.
- [ ] 👤 Thả một ảnh tĩnh vào `%APPDATA%\winbar\claude-icons\idle\`, mở lại panel: ảnh vào vòng luân phiên.

## 4. Chỉ chạy khi cần (tiêu chí 8, 9)

- [x] ✅ Không có phiên sống: widget tự ẩn khỏi pill (`setHidden`); bóng ma phiên cũ **không** tính là sống.
- [x] ✅ Tắt layout trong Cài đặt: `claude_sessions` trả rỗng, `claude_usage` không mở credentials, luồng theo dõi
      bỏ qua cả việc liệt kê thư mục.
- [ ] 👤 Đóng hết phiên Claude: pill không còn phần Claude.

## 5. Riêng tư và bảo mật (tiêu chí 10)

Xem thêm `SPEC-claude.md` §13.1.

- [x] ✅ Quét 25 file (log dev + mọi file winbar ghi): **không có token**.
- [x] ✅ Cache trên đĩa chỉ chứa %, giờ reset và thời điểm đọc.
- [x] ✅ Test khẳng định JSON của `Usage` không chứa `token`/`Bearer`/`accessToken`.
- [x] ✅ Không đi theo redirect (tránh mang `Authorization` sang host khác).
- [x] ✅ Token có ký tự điều khiển bị coi như chưa đăng nhập, không gửi đi.
- [x] ✅ Ghi đè cả hai bản sao token trong bộ nhớ sau khi gửi.
- [x] ✅ Không đọc nội dung hội thoại; không ghi gì vào `~/.claude`.
- [ ] ⚠️ Token nằm **plaintext** trong `~/.claude/.credentials.json` — file của Claude Code, không phải của winbar.
- [ ] ⚠️ Ghi đè bộ nhớ chỉ che một phần: hệ điều hành có thể đã sao chép trang nhớ từ trước.

## 6. Command bar (tiêu chí 9 phần sau)

- [x] ✅ Provider: `cl` ra phiên + dòng hạn mức; tìm theo project, worktree, tool; `remember: false` — 8 test.
- [ ] 👤 **Cần bạn thử tay:** Ctrl+Space rồi gõ `cl`.

> ⚠️ **Không tự kiểm được:** cửa sổ command bar khi ẩn bị WebView2 bóp cổ, một lệnh IPC mất 3–7,7 giây (từ notch
> chỉ ~20 ms), nên **mọi** provider timeout ở mốc 1,5 giây — kể cả `files` và `clipboard` vốn chạy tốt. Muốn hiện
> cửa sổ lên phải thêm quyền `window:allow-show`, thêm quyền chỉ để test thì không đáng.

## 7. Hiệu năng (tiêu chí 11)

Đo trên bản release, cùng một lần chạy, bật rồi tắt layout — nên **chênh lệch** mới là cái giá của module; số tuyệt
đối không so được giữa các lần chạy (lần này có mở cổng debug và máy đang chạy phiên Claude thật).

### Lần 1 — commit `a6c4bb2`: **KHÔNG ĐẠT**

| | RAM (private WS) | CPU, panel đóng |
|---|---|---|
| Bật layout Claude | 138,1–148,4 MB | **2,180%** (102 s) |
| Tắt | 137,7–138,1 MB | 0,522% (93 s) |

- [x] RAM tăng ~0–3 MB — đạt (yêu cầu ≤ 12 MB).
- [ ] ❌ CPU tăng **+1,66 điểm phần trăm**, yêu cầu ≤ +0,02%. **Vượt 83 lần.**

**Nguyên nhân:** luồng theo dõi đọc lại **cả danh sách** mỗi lần có thay đổi, mà danh sách đó gồm việc parse **156
file** phiên của app Claude Desktop — vài lần mỗi giây trong lúc một phiên đang chạy tool. Chính spec §4 đã ghi
"quét mỗi 60 giây", tôi viết thiếu phần cache.

### Lần 2 — sau khi cache lịch sử Desktop (commit `f86ac2f`)

_(điền sau khi đo lại)_

## 8. Chưa làm / giới hạn đã biết

- **Duyệt quyền ngay trên notch** không nằm trong bản này (`claude-approvals`, phải duyệt riêng vì nó ghi hook).
  Đã khảo sát: khả thi qua hook `PermissionRequest`, xem trao đổi ngày 18/09.
- `startedAt` bằng 0 ở hầu hết phiên nên cột thời gian thường là "hoạt động lần cuối", không phải "đã chạy bao lâu".
- Không biết được phiên nào đã chết thật: hook chỉ xóa file khi `SessionEnd` chạy, mà đóng terminal thì nó không chạy.
- Không nhảy tới đúng tab Orca của phiên: dữ liệu không có thông tin cửa sổ nào (không PID, không handle, không pane key).
- Endpoint hạn mức không công khai, có thể đổi hoặc bị chặn bất cứ lúc nào.
