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
- [x] ✅ **Lauren thử tay 20/09:** Ctrl+Space, gõ `cl`, chọn một dòng → mở đúng thư mục của phiên trong Explorer.
      Đúng như §5.7 ("Enter mở thư mục"). `cl` là **tiền tố** của provider nên gõ một mình nó liệt kê mọi phiên
      đang sống, không cần gõ thêm.

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

| | RAM (private WS) | CPU, panel đóng |
|---|---|---|
| Bật layout Claude | 136,8–141,6 MB | **0,625%** (96 s) |
| Tắt | 137,0–137,3 MB | 0,442% (102 s) |

- [x] ✅ RAM tăng **~0 MB** (yêu cầu ≤ 12 MB).
- [x] ✅ CPU: từ **+1,66** xuống **+0,183** điểm phần trăm — giảm **9 lần**.
- [ ] ⚠️ Vẫn **trên** mức tôi tự đặt là +0,02%. Xem phần dưới.

**+0,183 điểm phần trăm là gì:** khoảng **2% của một nhân**, và chỉ trong lúc một phiên Claude **đang chạy tool**
(lúc đó file trạng thái bị ghi lại một hai lần mỗi giây). Phiên nằm im thì gần như bằng 0.

**Hai tiêu chí của tôi mâu thuẫn nhau.** Tiêu chí 1 đòi pill đổi trạng thái **trong 1 giây**, nên phải xem thư mục
mỗi giây. Tiêu chí 11 đòi CPU tăng **≤ 0,02%**. Một vòng lặp 1 giây không thể rẻ đến thế — con số 0,02% tôi viết
lúc chưa đo là quá chặt. Đây là chỗ cần bạn quyết, không phải chỗ để tôi tự nới tiêu chí cho đạt.

Còn có thể giảm tiếp: hiện tại mỗi lần đổi, Rust đọc danh sách một lần rồi giao diện gọi `claude_sessions` đọc
**lần nữa**. Gửi kèm danh sách trong sự kiện sẽ bỏ được một nửa.

### Lần 3 — sau khi watcher chậm lại (2026-09-20)

Lần này đo **đúng lúc một phiên đang chạy tool**, bằng cách trỏ `CLAUDE_CONFIG_DIR` vào một thư mục nháp có 5 file
phiên, và một job ghi đè file của một phiên **2 lần/giây** — đúng cái mà phiên đang cook làm.
`~/.claude` thật **không bị ghi vào**. Script: `claude-perf-busy.ps1` (scratchpad).

| Cấu hình | CPU bật | CPU tắt | **Chênh** |
|---|---|---|---|
| Lần 2 (watcher 1 giây, đo trên `~/.claude` thật) | 0,625% | 0,442% | **+0,183** |
| Watcher 1 giây, đo lại trên thư mục nháp | 0,090% | 0,001% | **+0,089** |
| Gửi kèm danh sách trong sự kiện (thử) | 0,223% | 0,018% | **+0,205** ❌ |
| …chỉ gửi cho cửa sổ notch | 0,105% / 0,112% | 0,002% / 0,001% | **+0,103 / +0,111** ❌ |
| **Watcher 2 giây (đang dùng)** | **0,082%** | **0,001%** | **+0,081** ✅ |
| Thêm: bỏ 2 ảnh động khỏi vòng xoay (chỉ để đo) | 0,083% | 0,019% | +0,064 |

- [x] ✅ RAM: 119,8–125,5 MB bật, 119,8–120,1 MB tắt — tăng **~0 MB** (yêu cầu ≤ 12 MB).
- [x] ✅ CPU: từ **+0,183** (lần 2) xuống **+0,081** điểm phần trăm.
- [ ] ⚠️ Vẫn trên mức +0,02% tôi tự đặt. Xem bên dưới — con số đó không đạt được.

**Ba giả thuyết của tôi đều sai, và đó mới là kết quả đáng ghi:**

1. *"Đọc hai lần là nguyên nhân"* — Rust đọc danh sách, rồi giao diện gọi `claude_sessions` đọc **lần nữa**. Tôi
   gửi kèm danh sách vào sự kiện để bỏ lần đọc thứ hai. Kết quả **tệ hơn**: `emit` gửi payload cho **mọi** cửa sổ,
   nên command bar — vốn không nghe sự kiện này — phải parse danh sách mỗi lần đổi. Gửi riêng cho notch vẫn tệ hơn
   sự kiện rỗng (+0,10 so với +0,09, đo 2 lần). **Đã bỏ thay đổi này.**
2. *"Giãn nhịp quét sẽ giảm một nửa"* — từ 1 giây lên 2 giây chỉ đi từ +0,089 xuống +0,081. Chi phí **không** tỉ lệ
   với số lần quét.
3. *"Hai ảnh GIF động mới là thủ phạm"* — bỏ hẳn chúng chỉ tiết kiệm ~0,015 điểm.

**Vậy tiền đi đâu?** Khoảng **15 ms CPU cho mỗi lần pill đổi trạng thái**: một vòng IPC, một lần parse JSON, một
lần React vẽ lại pill. Đó là cái giá của việc pill **thật sự sống**. Muốn rẻ hơn nữa thì phải cập nhật thưa hơn
nữa, tức là pill chậm hơn — không phải chỗ tôi nên tự quyết.

**Tiêu chí +0,02% là tôi viết sai khi chưa đo.** Sàn thực tế của một pill sống là khoảng +0,06–0,08 điểm phần trăm
trong lúc có phiên đang chạy tool (≈0,8% của một nhân), và gần **0** khi mọi phiên nằm im — đo riêng trên
`~/.claude` thật: bật 0,278%, tắt 0,283%, tức **chênh bằng 0**. Bạn cần chọn: nới tiêu chí lên ~+0,1 điểm, hay
cho pill cập nhật thưa hơn nữa.

**Một lần đo hỏng, giữ lại để không lặp lại:** lần chạy đầu tôi build bằng `cargo build --release` rồi đo — sai.
Không có `tauri build` thì app vẫn trỏ về `http://localhost:1420`, mà dev server không chạy, nên tôi đã đo một app
**không có giao diện nào cả** (RAM 89 MB thay vì 135 MB, CPU gần 0 ở cả hai nửa). Phải dùng
`npm run tauri build -- --no-bundle`.

## 8. Chưa làm / giới hạn đã biết

- **Duyệt quyền ngay trên notch** không nằm trong bản này (`claude-approvals`, phải duyệt riêng vì nó ghi hook).
  Đã khảo sát: khả thi qua hook `PermissionRequest`, xem trao đổi ngày 18/09.
- `startedAt` bằng 0 ở hầu hết phiên nên cột thời gian thường là "hoạt động lần cuối", không phải "đã chạy bao lâu".
- Không biết được phiên nào đã chết thật: hook chỉ xóa file khi `SessionEnd` chạy, mà đóng terminal thì nó không chạy.
- Không nhảy tới đúng tab Orca của phiên: dữ liệu không có thông tin cửa sổ nào (không PID, không handle, không pane key).
- Endpoint hạn mức không công khai, có thể đổi hoặc bị chặn bất cứ lúc nào.
