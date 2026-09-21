# Checklist thủ công: claude-sessions + claude-usage

> Spec: `SPEC-claude.md` §11 · Chạy lần đầu: 2026-09-18 (Task 1–6)
> Máy: Windows 11, màn 1920×1200 ở 125%, WebView2 153
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
| `acme-theme-v3 · fangtooth` | cli | idle |
| `Agent-Reach`, `acme-marketing-skills` | desktop | idle, **stale** (368/417 phút) |
| 3 dòng lịch sử Desktop | history | kèm số lượt |

- [x] ✅ `makara` và `fangtooth` cùng hiện `acme-theme-v3` — thấy được là cùng một project.
- [x] ✅ Phiên idle quá 2 giờ xuống mục "Đã lâu không hoạt động", chữ mờ.
- [x] ✅ Bấm một dòng mở đúng thư mục (test component).
- [ ] 👤 Mở một phiên Claude mới ở cửa sổ khác: card đổi trong **2–3 giây** (nhịp quét 2 giây, xem tiêu chí 1).
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
- [x] ✅ **chủ dự án thử tay 20/09:** Ctrl+Space, gõ `cl`, chọn một dòng → mở đúng thư mục của phiên. `cl` là
      **tiền tố** của provider nên gõ một mình nó liệt kê mọi phiên đang sống, không cần gõ thêm.
- [x] ✅ **Đổi sang terminal (20/09):** chủ dự án muốn terminal thay vì Explorer. `open_terminal` gọi thật trên app
      đang chạy: thư mục worktree → mở Windows Terminal đúng chỗ (tiêu đề `pwsh @ firefish`), còn một **file**,
      đường dẫn **tương đối** và đường dẫn **không tồn tại** đều bị từ chối. Cửa sổ test đã đóng lại.
- [ ] 👤 Bấm một dòng trong card notch cũng phải ra terminal y như vậy.
- [x] ✅ **Rà lại bảo mật 20/09 (chủ dự án yêu cầu soi lần hai)** — tìm ra **hai lỗ trong code tôi vừa viết**:
      - Chặn đường dẫn mạng bằng chuỗi `\\` **bị lách** bằng gạch chéo xuôi. Chạy thử với `std::path`:
        `//server/share`, `/\server\share`, `\/server/share` đều là UNC thật mà cách kiểm cũ cho qua hết.
        Giờ kiểm bằng prefix của đường dẫn đã parse.
      - **`wt.exe` tự tách lại dòng lệnh theo `;`.** Thư mục `probe;zzznotacommand` → wt mở cửa sổ tiêu đề
        `zzznotacommand`, tức nó đã **chạy** nửa sau. Thư mục tên `x;calc.exe` là chạy được chương trình.
        Thư mục có `;` giờ đi sang PowerShell; đã xác nhận qua app: không có tiến trình WindowsTerminal nào,
        PowerShell được mở, và `current_dir` đặt đúng thư mục `probe;zzznotacommand`.
- [x] ✅ **Lần ba — thử phá cách sửa của chính mình:** hai giả thuyết "sửa gọn hơn" đều **sai**, đo được:
      - *Bọc nháy kép cho `-d`* — wt **vẫn tách theo `;` bên trong nháy**, tiêu đề vẫn ra `zzznotacommand`.
      - *Bỏ `-d`, đưa thư mục qua `current_dir` của tiến trình* — wt **không thừa kế**, tab về thẳng home
        (`pwsh @ <tên người dùng>`).
      Kết luận: không có cách an toàn nào đưa đường dẫn tuỳ ý lên dòng lệnh của wt, nên đổi từ chặn **một ký tự**
      sang **allowlist**. Kiểm lại qua app: worktree bình thường → `pwsh @ firefish` (vẫn dùng wt); thư mục có
      `;` → không có tiến trình WindowsTerminal nào, rơi về PowerShell.

> ⚠️ **Không tự kiểm được:** cửa sổ command bar khi ẩn bị WebView2 bóp cổ, một lệnh IPC mất 3–7,7 giây (từ notch
> chỉ ~20 ms), nên **mọi** provider timeout ở mốc 1,5 giây — kể cả `files` và `clipboard` vốn chạy tốt. Muốn hiện
> cửa sổ lên phải thêm quyền `window:allow-show`, thêm quyền chỉ để test thì không đáng.

## 5b. Icon trạng thái "chờ duyệt" có khung màu (chủ dự án báo 20/09)

**Không phải lỗi ảnh gốc.** Giải mã kênh alpha của cả 4 ảnh clawd: `clawd-thinking` trong suốt **54%**, các ảnh
kia 50–56%, bốn góc alpha = 0. Ảnh trong suốt thật.

**Lỗi ở CSS tôi viết.** `.iconWaiting` dùng `box-shadow: 0 0 0 2px var(--warn)`, mà bóng của box vẽ quanh **phần
tử**, không quanh hình. Ảnh trong suốt một nửa nên cái vòng đó trông như một tấm nền màu nằm sau con vật.

- [x] ✅ Chụp được lỗi bằng cách tiêm CSS vào app đang chạy: khung bo góc màu cam ôm cả vùng trong suốt
      (`icon-waiting-before.png`).
- [x] ✅ Sửa thành `drop-shadow`, thứ đi theo **đường viền của chính bức ảnh**. Chụp so sánh: dòng 1 có quầng
      vàng ôm đúng hình con vật, dòng 2 bình thường (`icon-waiting-compare.png`).
- [x] ✅ Kiểm lại stylesheet trong app: rule còn `drop-shadow`, `box-shadow` rỗng, icon thường `filter: none`.

## 6a. Dòng mở đúng nơi phiên đang sống (chủ dự án hỏi 20/09)

- [x] ✅ Claude Desktop là app **đóng gói MSIX** (`Claude_pzs8sxrjxfjjc!Claude`) và có đăng ký protocol
      `claude`. Gọi `claude://` khi app đang chạy: **22 tiến trình trước, 22 sau, vẫn một cửa sổ** — nó focus
      cửa sổ sẵn có chứ không mở thêm.
- [x] ✅ Gọi `claude_open_desktop` qua app đang chạy: `ok`, không sinh tiến trình mới.
- [x] ✅ Phiên CLI vẫn ra terminal; phiên Desktop và lịch sử Desktop ra app — có test cho cả card lẫn dòng `cl`.
- [x] ✅ Dòng Desktop **không cần `cwd`** vẫn bấm được (trước đây bị khoá vì không có thư mục).
- [ ] 👤 **Cần bạn thử tay:** bấm dòng `Personal Claude` trong card → Claude Desktop nhảy ra trước.

**Chưa làm được:** nhảy tới **đúng phiên** trong Desktop. File phiên có `sessionId`, nhưng dạng deep link của
`claude://` không có tài liệu, và tôi không đi dò bừa scheme của app khác. Hiện chỉ mở app.

## 6b. Notch mang cả Claude lẫn nhạc (chủ dự án yêu cầu 20/09)

Khi **hai** widget cùng có gì để nói thì pill nới rộng ra chứ không giấu bớt một cái: `duoSize` = rộng pill
+ 240, cao giữ nguyên. Widget không có gì để nói đã tự rút khỏi pill từ trước (`setHidden`), nên hai cái cùng
hiện đúng là hai việc đang chạy thật.

- [x] ✅ Đo trên app đang chạy, bật thêm một widget thứ hai rồi tắt đi (không đụng vào nhạc của bạn):
      `300px` một widget → `540px` hai widget, có vạch ngăn → `300px` khi widget kia biến mất.
      Cài đặt đã khôi phục y nguyên (so khớp từng trường với bản sao lưu).
- [x] ✅ Ảnh chụp `pill-duo.png`: nửa trái Claude (icon, `Cooking · Bash`, `winbar`, `5h 6%`), vạch ngăn, nửa phải
      widget thứ hai. Hai nửa chia đều.
- [ ] 👤 **Cần bạn thử tay:** vừa chạy Claude vừa bật nhạc thật → pill phải nới ra và hiện cả hai. Tôi không tự
      bật nhạc trên máy bạn vì sẽ chen vào thứ bạn đang nghe.

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

### Lần 4 — tìm đúng chỗ tốn CPU (20/09)

Chủ dự án bảo sửa. Tôi đoán sai **hai lần nữa** trước khi chịu đo:

1. *"Phát sự kiện quá nhiều vì so cả `lastActiveAt`"* — sửa thành so **thứ nhìn thấy được** (phase, tool, tên,
   thứ tự, và **mức làm tròn của chuỗi thời gian** mà trang sẽ hiển thị). Kết quả: **+0,082**, y nguyên.
   Rig của tôi đổi phase mỗi 500 ms nên mọi lần ghi đều là thay đổi thật — rig sai, không phải app.
2. Sửa rig để ghi file mà **không** đổi phase: **+0,089**. Vẫn không giảm. Vậy chi phí không nằm ở sự kiện.

**Thôi đoán, đo từng giai đoạn** bằng một biến môi trường tạm cho watcher dừng sớm (ON trừ OFF):

| Dừng sau | Chênh |
|---|---|
| Vòng lặp + đọc settings | +0,014 |
| + fingerprint thư mục | +0,020 |
| **toàn bộ** (thêm `state.read`) | **+0,088** |
| toàn bộ nhưng **tắt lịch sử Desktop** | **+0,012** |

**Thủ phạm: quét lại 157 file lịch sử Desktop mỗi 60 giây, ngay trong luồng nền.** Chiếm **~86%** toàn bộ chi
phí của module. Cache 60 giây (sửa ở lần 2) chỉ giảm tần suất chứ không bỏ được nó khỏi đường chạy nền.

**Sửa:** lịch sử **ra khỏi hẳn đường của pill**. `claude_sessions` giờ chỉ trả phiên đang sống; lịch sử có lệnh
riêng `claude_history` mà **chỉ card gọi, một lần khi panel mở**. Pill có thể cập nhật bao nhiêu lần cũng không
kéo theo 157 file nào.

| | Chênh CPU |
|---|---|
| Lần 1 (chưa cache lịch sử) | +1,66 |
| Lần 2 (cache 60 giây) | +0,183 |
| Lần 3 (watcher 2 giây) | +0,081 |
| **Lần 4 (lịch sử ra khỏi luồng nền)** | **+0,021** |

- [x] ✅ Bốn lần chạy, tải nặng nhất (đổi phase 2 lần/giây, lịch sử **bật** như bình thường):
      **+0,017 · +0,030 · +0,015 · +0,023**. RAM 117,0–120,2 MB bật so với 117,0–117,3 MB tắt — tăng ~0 MB.
- [ ] ⚠️ **Tiêu chí 11 (+0,02) giờ nằm trong tầm, nhưng chưa phải lần nào cũng đạt.** Trung bình +0,021, hai
      trong bốn lần vượt nhẹ. Tôi **không** tuyên bố là đạt. Từ vượt 4 lần xuống dao động quanh ngưỡng.

**Một lỗi tôi gây ra khi đo:** script đo phục hồi settings từ một file sao lưu **cố định**, chụp từ nhiều ngày
trước. Mấy lần chạy đầu đã **ghi đè lựa chọn của chủ dự án** (`dense` 65%) về `liquid`. Đã trả lại, và sửa cả hai
script đo để **chụp settings sống ngay trước mỗi lần chạy** thay vì dùng file cũ.

### Lần 5 — giãn nhịp quét lên 3 giây (21/09)

Chủ dự án bảo giãn nhịp. Lần này giãn **mới thật sự ăn**: ở lần 3 việc đổi 1 → 2 giây gần như không đổi gì, vì chi
phí lúc đó là cú quét 157 file lịch sử chạy theo đồng hồ riêng. Lịch sử ra khỏi luồng nền rồi thì mỗi vòng chỉ
còn một lần liệt kê thư mục và một lần đọc vài file nhỏ — tức chi phí tỉ lệ thẳng với nhịp quét.

Ba lần chạy sạch (không build hay việc nặng nào chạy song song):

| Lần | Bật | Tắt | Chênh |
|---|---|---|---|
| 1 | 0,027% | 0,045% | **−0,018** |
| 2 | 0,031% | 0,000% | **+0,031** |
| 3 | 0,017% | 0,000% | **+0,017** |

- [x] ✅ Trung bình **+0,010**, dưới tiêu chí +0,02.
- [x] ✅ Một lần ra **âm** — tức **tín hiệu đã nhỏ hơn nhiễu** của chính phép đo. Không thể đo chính xác hơn bằng
      rig này nữa; muốn chắc hơn phải đo dài hàng giờ.

Cả chặng: **+1,66 → +0,183 → +0,081 → +0,021 → +0,010 (trong nhiễu)**.

**Một lần đo phải bỏ:** lần đầu tôi chạy đo trong lúc vẫn build và vẽ icon trên cùng máy — ra **0,552%**, vô
nghĩa. Số chỉ dùng được khi máy yên.

### Sự cố 21/09: đo xong, widget Claude biến mất

Chủ dự án báo: vừa bật nhạc vừa chạy Claude mà **không thấy widget Claude**. Không phải lỗi bố cục — là **lỗi tôi**.

Script đo tắt layout Claude ở nửa sau mỗi lần chạy rồi bật lại trong `finally`. Giữa chừng tôi **force-kill**
winbar (để dọn một tiến trình còn sót), nên `finally` **không bao giờ chạy** và `settings.json` nằm lại ở trạng
thái `claude.enabled = false`. App mở lên vẫn đúng — chỉ là layout Claude đã bị tắt trong cài đặt.

- [x] ✅ Sửa: dừng app (không ghi đè settings dưới chân app đang chạy — lỗi 18/09), đặt lại `enabled = true`,
      mở lại. Pill hiện đủ cả hai: `Cooking · Bash · winbar · 5h 5%` | ảnh bìa + một bài đang phát + nút.
- [x] ✅ Sửa gốc: cả hai script đo giờ ghi một **file mốc** trỏ vào bản sao lưu ngay khi bắt đầu, và xoá nó khi
      kết thúc sạch. Lần chạy sau thấy file mốc còn sót thì **tự khôi phục** settings của lần bị ngắt trước khi
      làm gì tiếp. Đã kiểm cả hai script còn parse sạch.

**Bài học:** đừng force-kill app khi một script đang giữ trạng thái của nó. Và cái gì script sửa được thì script
phải tự sửa lại được, kể cả khi nó bị giết.

**Điểm đáng bàn cho sản phẩm:** layout Claude bị tắt thì widget **lặng lẽ biến mất**, không có dấu hiệu gì để
người dùng lần ra. Giống hệt lúc media tự ẩn vì không có nhạc. Chưa sửa — cần chủ dự án quyết có nên báo gì không.

## 8. Chưa làm / giới hạn đã biết

- **Duyệt quyền ngay trên notch** không nằm trong bản này (`claude-approvals`, phải duyệt riêng vì nó ghi hook).
  Đã khảo sát: khả thi qua hook `PermissionRequest`, xem trao đổi ngày 18/09.
- `startedAt` bằng 0 ở hầu hết phiên nên cột thời gian thường là "hoạt động lần cuối", không phải "đã chạy bao lâu".
- Không biết được phiên nào đã chết thật: hook chỉ xóa file khi `SessionEnd` chạy, mà đóng terminal thì nó không chạy.
- **Không nhảy tới đúng tab Orca của phiên** — đã tra kỹ ngày 20/09, không phải chưa thử:
  - Orca **không đăng ký URI scheme** nào (quét toàn bộ protocol đã đăng ký của máy; Claude Desktop thì có).
  - Cửa sổ Orca chỉ có tiêu đề `"Orca"`, không mang tên worktree, nên không nhận ra tab qua tiêu đề.
  - File trạng thái không có PID, handle hay pane key; tab là thứ nội bộ của Orca, không phải cửa sổ của hệ điều hành.

  **Đưa cửa sổ Orca ra trước** thì làm được, và **`claude --resume <id>`** cũng làm được (`sessionId` trong file
  trạng thái đúng là id của transcript). Chủ dự án cân nhắc rồi **chọn giữ nguyên terminal trống** (20/09): mở lại
  hội thoại của một phiên **đang chạy** sẽ sinh ra đúng cái cảnh hai phiên trên cùng một worktree mà chủ dự án
  tránh, còn focus Orca thì vẫn phải tự tìm tab. Giữ nguyên cũng là phương án ít bề mặt tấn công nhất:
  `sessionId` không bao giờ đi vào dòng lệnh. Muốn mở lại hội thoại thì gõ `claude -r` trong terminal vừa mở.
- Endpoint hạn mức không công khai, có thể đổi hoặc bị chặn bất cứ lúc nào.
