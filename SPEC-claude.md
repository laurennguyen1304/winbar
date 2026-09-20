# Spec: Claude (claude-sessions + claude-usage)

> Capability map: `CAPABILITY-MAP.md` — layout **Claude**, module id `claude-sessions` và `claude-usage`.
> `claude-approvals` **không** nằm trong spec này (phải duyệt riêng vì nó ghi hook vào `~/.claude`).
> Nguồn UI: `design/winbar-mockup.html` (tab Claude: card "Phiên Claude", card "Hạn mức").
> Trạng thái: **chờ bạn duyệt**.

## 1. Mục tiêu

Liếc vào notch là biết Claude đang làm gì và còn bao nhiêu hạn mức, không phải mở terminal hay web.

- Tôi đang chạy 4 phiên Claude; tôi muốn biết phiên nào đang chờ tôi duyệt, phiên nào đang chạy tool.
- Tôi muốn biết còn bao nhiêu % hạn mức 5 giờ trước khi bắt đầu một việc dài.
- Pill thu gọn cho tôi trạng thái phiên đang sôi động nhất mà không cần mở panel.

**Không làm trong v1:** duyệt/từ chối quyền ngay trên notch (đó là `claude-approvals`), đọc nội dung hội thoại,
sửa bất cứ thứ gì trong `~/.claude`.

## 2. Nguyên tắc: chỉ đọc

Layout Claude **không ghi gì vào `~/.claude`**, không cài hook, không chặn Claude. Tắt layout Claude thì phần Core
chạy y nguyên. Mọi thứ dưới đây là đọc file có sẵn và gọi một endpoint chỉ-đọc.

## 3. Nguồn dữ liệu (đã kiểm trên máy 2026-09-18)

### 3.1 Phiên đang sống — `~/.claude/statusbar/state.d/*.json`

Hook `claude-status-bar/hooks/lifecycle.js` **đã chạy sẵn** trên máy (khai báo trong `~/.claude/settings.json`),
ghi một file cho mỗi phiên còn sống, xóa khi `SessionEnd`. Máy đang có 6 file. Định dạng thật:

> Thư mục `.claude` lấy từ biến `CLAUDE_CONFIG_DIR` nếu có, không thì mới là `~/.claude` — đúng quy tắc Claude Code
> dùng. Phần đọc hạn mức đã theo biến này từ đầu, phần đọc phiên thì chưa: máy nào đặt biến sẽ thấy danh sách rỗng
> mãi. Biến được đọc **một lần lúc khởi động**, không phải mỗi vòng quét.

```json
{ "sessionId": "2f7d71d9-…", "state": "tool", "label": "Bash",
  "cwd": "C:\\Users\\Lenovo\\orca\\workspaces\\winbar\\firefish", "project": "firefish",
  "entrypoint": "cli", "termProgram": "Orca", "startedAt": 1789725084, "ts": 1789725126 }
```

- `state` ∈ `idle` · `thinking` · `tool` · `permission`.
- `label` là tên tool khi `state = tool`.
- `startedAt`, `ts` là **giây** epoch. `ts` là lần cập nhật cuối.
- `state.json` ở thư mục cha là phiên vừa hoạt động gần nhất — chính là cái pill hiển thị.
- File cũ hơn 24 giờ là rác do crash (hook tự dọn khi có phiên mới, winbar cũng bỏ qua).

**Ba điều quan trọng, đã kiểm trên 6 phiên thật của máy:**

1. **Thư mục này chứa cả hai loại phiên.** `entrypoint` ∈ `cli` · `claude-desktop`; máy đang có 4 `cli` và
   2 `claude-desktop`. Badge trên card lấy từ đây, **không** phải từ việc file nằm ở thư mục nào.
2. **`termProgram` luôn là `Orca`** — kể cả hai phiên `claude-desktop`. Trường này vô dụng để phân biệt, **không dùng**.
3. **`startedAt` bằng `0` ở 5/6 phiên** (chỉ phiên vừa khởi động mới có số thật). Nên cột "thời gian" của mockup
   phải là **hoạt động lần cuối** (`ts`), chỉ hiện "đã chạy Xm" khi `startedAt > 0`.

### 3.2 Lịch sử phiên app Desktop — `%APPDATA%\Claude\`

`claude-code-sessions\**\local_*.json` (114 file) và `local-agent-mode-sessions\**\local_*.json` (42 file).
Chỉ đọc phần metadata, **không bao giờ đọc nội dung hội thoại**: `sessionId`, `title`, `lastActivityAt` (ms),
`completedTurns`, `cwd`, `isArchived`. Phiên đã archive thì bỏ.

Đây là **lịch sử**, không phải phiên đang sống: không có trạng thái, chỉ có tiêu đề và lần hoạt động cuối.
Phiên Desktop *đang sống* thì đã nằm ở §3.1 với `entrypoint = claude-desktop`. Card phải nói rõ sự khác nhau.

### 3.3 Hạn mức — `api.anthropic.com/api/oauth/usage`

Token OAuth nằm ở `~/.claude/.credentials.json` → `claudeAiOauth.accessToken` (tài khoản này là `max`).
Gọi `GET` với `Authorization: Bearer …` và `anthropic-beta: oauth-2025-04-20`. Payload thật gọn lại:

```json
{ "five_hour": { "utilization": 52.0, "resets_at": "2026-09-18T10:00:00Z" },
  "seven_day": { "utilization": 24.0, "resets_at": "2026-09-19T00:00:00Z" },
  "limits": [ { "kind": "session", "group": "session", "percent": 52, "resets_at": "…", "is_active": true },
              { "kind": "weekly_all", "group": "weekly", "percent": 24, "resets_at": "…" },
              { "kind": "weekly_scoped", "group": "weekly", "percent": 9, "resets_at": "…",
                "scope": { "model": { "display_name": "Fable" } } } ] }
```

Đọc như yasb làm: ưu tiên `five_hour` / `seven_day` khi có `utilization` **và** `resets_at`, nếu không thì lấy
mục có `percent` cao nhất trong `limits` theo nhóm (`session` cho 5 giờ, `weekly` cho 7 ngày). Các mục
`weekly_scoped` có `scope.model.display_name` thành dòng phụ "theo model".

### 3.4 Orca: `project` là tên **worktree**, không phải tên project

Bạn làm việc qua Orca, nên gần hết phiên nằm trong `~/orca/workspaces/<project>/<worktree>`. Hook chỉ lấy
`basename(cwd)` làm `project`, nên danh sách thật của máy lúc này ra:

| `project` hook ghi | `cwd` thật | Thực ra là |
|---|---|---|
| `firefish` | `~/orca/workspaces/winbar/firefish` | project **winbar** |
| `makara` | `~/orca/workspaces/qikify-theme-v3/makara` | project **qikify-theme-v3** |
| `fangtooth` | `~/orca/workspaces/qikify-theme-v3/fangtooth` | **cùng** project qikify-theme-v3 |
| `brain` | `~/brain` | project brain (không qua Orca) |

Nếu hiện nguyên `project`, card sẽ là ba tên cá và bạn không thể biết `firefish` là winbar, cũng không thấy
`makara` với `fangtooth` là hai worktree của **cùng một** project.

**Cách xử lý:** khi `cwd` khớp `<gốc Orca>/workspaces/<project>/<worktree>`, hiện **`winbar · firefish`** —
project đậm, worktree mờ. Ngoài Orca thì giữ nguyên tên thư mục. Gốc Orca đọc từ biến môi trường `ORCA_HOME`
nếu có, mặc định `~/orca`; không khớp thì không đoán gì thêm. Phần tách chuỗi này là hàm thuần, có test.

## 4. Quyết định kỹ thuật

| Việc | Cách làm | Vì sao |
|---|---|---|
| Theo dõi phiên đang sống | Xem tên + kích thước + `mtime` của từng file trong `state.d`, mỗi **2 giây** khi có hoạt động và **5 giây** khi mọi phiên nằm im; chỉ đọc lại khi có đổi | `mtime` của **thư mục** không đổi khi một file bị ghi đè tại chỗ — mà đó chính là lúc phiên đổi trạng thái. 2 giây là Lauren chọn (20/09): "có độ trễ cũng được" |
| Gọi HTTPS | **WinHTTP** qua crate `windows` (feature `Win32_Networking_WinHttp`) | `reqwest` đã có trong cây phụ thuộc nhưng **không có TLS backend**; bật `rustls-tls` sẽ kéo thêm cả rustls + ring và làm build lâu hơn nhiều. App vốn đã chỉ chạy Windows và đã dùng nhiều Win32 |
| Cache hạn mức | `%APPDATA%\winbar\claude-usage.json`, TTL **120 giây**, làm mới mỗi 5 phút khi panel mở | Endpoint không công khai, phải tôn trọng rate limit (capability map) |
| Token | Đọc lại từ `.credentials.json` mỗi lần gọi, giữ trong bộ nhớ đúng lúc gọi | Không sao chép token sang chỗ khác, không ghi ra đĩa, **không bao giờ ghi log** |
| Không đi theo redirect | `WINHTTP_OPTION_REDIRECT_POLICY_NEVER` | WinHTTP mặc định **có** đi theo; một redirect đổi host sẽ mang header `Authorization` tới đó |
| Từ chối header dị dạng | Kiểm ASCII, không ký tự điều khiển, trước khi gửi | Ký tự CR/LF trong token sẽ chèn thêm header |
| Xóa token khỏi bộ nhớ | Ghi đè cả chuỗi token lẫn dòng header sau khi gửi | Che một phần thôi — nói rõ ở §13 |
| Lịch sử Desktop | Quét khi panel mở và mỗi 60 giây, không quét khi panel đóng | 156 file; không đáng quét liên tục |
| Tên project qua Orca | Tách `cwd` theo `<gốc>/workspaces/<project>/<worktree>` (§3.4) | Không có nó thì card chỉ toàn tên cá |
| Ảnh trạng thái | Bộ ảnh kèm app + thư mục người dùng, xem §5.4 | Bạn muốn tự thêm ảnh mà không phải build lại |

## 5. Hành vi

### 5.1 Pill thu gọn (`claude-sessions` là widget ưu tiên)

Ảnh trạng thái + chữ, lấy từ phiên sôi động nhất (xem §5.3 thứ tự ưu tiên):

| `state` | Chữ | Màu |
|---|---|---|
| `idle` | `idle` | `--text-faint` |
| `thinking` | `Thinking` | `--claude` |
| `tool` | `Cooking · <tool>` | `--claude` |
| `permission` | `wait for you` | `--warn` |

Dòng phụ: `<project> · <worktree>` (§3.4) và `5h <pct>%` khi đã có số hạn mức (như mockup). Pill hẹp nên khi
thiếu chỗ thì bỏ worktree trước, giữ tên project.
Không có phiên nào: widget tự ẩn khỏi pill (`shell.setHidden`), giống media khi không phát gì.

### 5.2 Card "Phiên Claude"

Theo mockup: mỗi dòng có ảnh trạng thái (26px), tên + badge `cli`/`desktop`, dòng trạng thái, thời gian
bên phải. Nhãn card ghi số phiên đang mở.

- **Phiên đang sống** (§3.1) lên trước, sắp theo §5.3; badge lấy từ `entrypoint`: `cli` hoặc `desktop`.
- Tên dòng: `<project> · <worktree>` theo §3.4 khi ở trong Orca, còn lại là tên thư mục.
- Cột phải: "hoạt động 2 phút trước"; chỉ khi `startedAt > 0` mới ghi "đã chạy 12m".
- Phiên `idle` quá **2 giờ** xuống mục "đã lâu không hoạt động" ở cuối, chữ mờ — vẫn còn file nhưng gần như
  chắc chắn bạn đã quên nó (máy đang có một phiên idle 22 giờ).

#### Hai dòng cùng một worktree: gần như luôn là phiên cũ chưa được dọn

Bạn nói bạn hay **tắt phiên rồi mở phiên mới** trên cùng worktree. Vấn đề là hook chỉ xóa file khi `SessionEnd`
chạy, mà đóng cửa sổ terminal hay Ctrl+C thì nó **không** chạy. Bằng chứng trên máy lúc này: `sessions.d` có
**94 file** từ đầu tháng 8, trong khi chỉ **6** phiên còn trong `state.d`. Tức `SessionEnd` hiếm khi chạy; file
cũ nằm lại tới khi hook tự quét dọn sau **24 giờ**.

Nên khi hai dòng trùng `cwd`, mặc định đó là **phiên thật + bóng ma của phiên bạn vừa tắt**, chứ không phải hai
phiên song song. Quy tắc:

1. Gom theo `cwd`. Dòng có `ts` mới nhất là phiên chính.
2. Dòng cũ hơn mà vẫn hoạt động trong **5 phút** gần đây thì hiện như một phiên thật thứ hai — đúng trường hợp
   bạn chạy một task phụ ngắn song song.
3. Cũ hơn 5 phút thì gộp xuống mục "đã lâu không hoạt động", không chiếm chỗ ở trên.

Card **không** nói phiên nào "đã chết" — winbar không biết chắc điều đó, chỉ biết lần cuối nó báo về.
- **Lịch sử Desktop** (§3.2) là một mục riêng ở dưới, tối đa 3 dòng, ghi `<n> lượt · <thời gian>`;
  **không** giả vờ có trạng thái live.
- Bấm một dòng: **mở terminal đứng sẵn trong `cwd`** bằng lệnh `open_terminal` (Lauren chọn 20/09 — máy này làm
  việc ở dấu nhắc lệnh, Explorer không giúp được gì). Windows Terminal nếu có, không thì PowerShell trong một cửa
  sổ console mới. Giống hệt việc dòng `cl` trong command bar làm, để một dòng chỉ có một nghĩa.
- Không có phiên nào: "Không có phiên Claude nào đang mở".

### 5.3 Phiên nào là "sôi động nhất"

Sắp theo thứ tự: `permission` → `tool` → `thinking` → `idle`; cùng trạng thái thì `ts` mới hơn lên trước.
Phiên đang chờ bạn duyệt luôn nổi lên đầu — đó là thứ duy nhất cần bạn làm gì.

### 5.4 Ảnh trạng thái (bạn chốt 2026-09-18)

Mỗi trạng thái có **một danh sách ảnh**; nếu danh sách có nhiều hơn một thì ảnh **luân phiên**, mờ chồng
(`opacity`) mỗi **6 giây**.

Bộ kèm app (Lauren chốt 19/09, sửa 20/09/2026 — bộ "clawd" pixel art 48px + 2 ảnh động cũ):

| Trạng thái | Ảnh trong vòng xoay |
|---|---|
| `idle` | `clawd-sleeping.png` ↔ `clawd-angry.png` |
| `thinking`, `tool` | `clawd-sparkles.png` ↔ `claude-fu-transparent.gif` ↔ `working.gif` |
| `permission` | `clawd-thinking.png` ↔ `claude-fu-transparent.gif` (viền màu `--warn`) |

`claude_headstone.png` đã bị bỏ: ảnh minh họa 256px đứng cạnh pixel art 48px trong cùng ô 24px trông như của app
khác. Icon tab "Claude" trong panel cũng đổi sang `clawd-sleeping.png`. File vẫn nằm trong repo.

`working.gif` lấy từ `yasb-py312/…/resources/claude_code/` — theo `NOTICE.md` đó là ảnh **bạn tự đưa vào** yasb,
nên dùng lại được. (`spark_*.png` và `logo.png` là của m1ckc3s/claude-status-bar, giấy phép MIT — chưa dùng.)

**Bạn thêm ảnh tĩnh sau:** thả file vào `%APPDATA%\winbar\claude-icons\<trạng thái>\` (`idle`, `thinking`, `tool`,
`permission`). Nhận `.png` `.jpg` `.webp` `.gif` `.apng`, mỗi file ≤ 2 MB, mỗi thư mục ≤ 12 file. Ảnh trong thư mục
đó **nối vào** danh sách kèm app. Không cần build lại, không cần khởi động lại — quét lại khi mở panel.

Chỉ luân phiên khi ảnh đang hiện trên màn (pill mở hoặc panel mở). Panel đóng và pill không hiện Claude thì không
có timer nào chạy — bài học từ audio visualizer của media.

### 5.5 Card "Hạn mức"

Hai thanh lớn theo mockup: **5 giờ** và **7 ngày**, mỗi thanh có số % to, thanh tiến độ, và dòng "Reset sau 2h 14m".
Dưới đó, khi payload có `weekly_scoped`, thêm dòng nhỏ mỗi model: `Fable 9%`.

- Nhãn card: "cập nhật <n> phút trước"; nút làm mới ngay.
- Màu thanh: < 75% `--claude`, 75–89% `--warn`, ≥ 90% `--danger`.
- Lỗi `auth` (401/403): "Cần đăng nhập lại Claude Code" — số cũ vẫn hiện, ghi rõ là số cũ.
- Lỗi mạng: giữ số cache, ghi "không cập nhật được, số từ <n> phút trước".
- Chưa có `.credentials.json`: "Chưa đăng nhập Claude Code", không gọi mạng.

### 5.6 Cảnh báo ngưỡng

Khi 5 giờ vượt **90%**, đẩy một pill alert (ưu tiên 3): "Hạn mức 5 giờ còn 10%". Chỉ một lần cho mỗi chu kỳ reset.
Tắt được trong Cài đặt.

### 5.7 Trong command bar

Provider `claude`, nhóm "Claude", tiền tố `cl`:
- Mỗi phiên đang sống một dòng: Enter **mở terminal trong `cwd`** (động từ trên dòng: "Terminal"). Tìm được theo
  **cả** tên project lẫn tên worktree, nên gõ "winbar" hay "firefish" đều ra. Gõ mỗi `cl` là ra hết phiên đang
  sống, vì `cl` là tiền tố của provider.
- Một dòng "Hạn mức Claude · 5h 52% · 7d 24%": Enter mở notch tab Claude.
- `remember: false` cho dòng phiên (phiên là thứ thoáng qua, nhớ lại sẽ trỏ vào phiên đã chết).

## 6. Hợp đồng

```ts
// src/widgets/claude/native.ts
export type ClaudePhase = "idle" | "thinking" | "tool" | "permission";

export interface ClaudeSession {
  id: string;
  /** Từ `entrypoint` của hook. "history" là phiên cũ của app Desktop (§3.2), không còn sống. */
  source: "cli" | "desktop" | "history";
  /** Tên hiện trên dòng: worktree trong Orca, hoặc tên thư mục, hoặc tiêu đề phiên Desktop. */
  title: string;
  /** Project chứa worktree, khi cwd nằm trong Orca (§3.4). */
  project?: string;
  /** Desktop không có trạng thái live: luôn là "idle". */
  phase: ClaudePhase;
  /** Tên tool khi phase = "tool". */
  tool?: string;
  cwd?: string;
  /** Epoch ms; thiếu ở hầu hết phiên vì hook ghi 0 (§3.1). */
  startedAt?: number;
  lastActiveAt: number;
  /** Desktop: số lượt đã xong. */
  turns?: number;
}

export interface ClaudeWindow {
  /** 0–100, làm tròn. */
  percent: number;
  /** ISO 8601. */
  resetsAt: string | null;
}

export interface ClaudeUsage {
  fiveHour: ClaudeWindow | null;
  sevenDay: ClaudeWindow | null;
  /** weekly_scoped: [{ label: "Fable", percent: 9 }]. */
  perModel: Array<{ label: string; percent: number }>;
  /** Epoch ms của lần gọi thành công gần nhất. */
  fetchedAt: number;
  error: "auth" | "network" | "no-login" | null;
}
```

| Lệnh / sự kiện | Việc |
|---|---|
| `claude_sessions()` → `ClaudeSession[]` | Phiên CLI + Desktop, đã sắp thứ tự |
| sự kiện `claude-sessions-changed` | `state.d` vừa đổi (đẩy từ Rust, không phải poll ở TS) |
| `claude_usage(force?)` → `ClaudeUsage` | Hạn mức; dùng cache khi còn hạn |
| `claude_icons()` → `Record<ClaudePhase, string[]>` | Danh sách ảnh mỗi trạng thái (data URL), gồm cả ảnh bạn thêm |

## 7. Cài đặt

| Trường | Giá trị | Mặc định |
|---|---|---|
| `claude.enabled` | bật/tắt cả layout Claude | `true` |
| `claude.iconRotateSeconds` | 0 (không luân phiên) · 4 · 6 · 10 | `6` |
| `claude.usageWarnPercent` | 0 (tắt) · 80 · 90 | `90` |
| `claude.showDesktopSessions` | bool | `true` |

## 8. Cấu trúc thư mục

```
src-tauri/src/claude/
  mod.rs        lệnh Tauri, state, phát sự kiện
  sessions.rs   đọc state.d + app Desktop, sắp thứ tự (phần thuần có test)
  usage.rs      đọc payload, chọn cửa sổ hạn mức, cache (phần thuần có test)
  http.rs       một lệnh GET qua WinHTTP (cfg(windows))
  icons.rs      bộ ảnh kèm app + thư mục người dùng
src/widgets/claude/
  index.tsx · native.ts · store.ts
  SessionsCard.tsx · UsageCard.tsx · ClaudeIcon.tsx · ClaudePill.tsx · Claude.module.css
  phase.ts      chữ/màu theo trạng thái, thứ tự sắp xếp, thời gian (thuần, có test)
src/assets/claude/  clawd-{sleeping,angry,sparkles,thinking}.png · claude-fu-transparent.gif · working.gif
```

## 9. Phong cách

Như các module trước. **Không bao giờ ghi token, `cwd` đầy đủ, hay tiêu đề phiên ra log.** Log chỉ có số phiên,
trạng thái, và mã lỗi.

## 10. Kiểm thử

| Mức | Nội dung |
|---|---|
| Rust | đọc `state.d` (file hỏng, file cũ 24h, thiếu trường, `startedAt = 0`); gom trùng `cwd` (bóng ma cũ, task phụ song song); tách tên project/worktree của Orca (trong Orca, ngoài Orca, `ORCA_HOME` khác, đường dẫn kỳ quặc); sắp thứ tự phiên; chọn cửa sổ hạn mức từ 3 dạng payload thật; cache hết hạn; quét thư mục ảnh (file quá lớn, đuôi lạ) |
| TS thuần | chữ/màu theo trạng thái; "Reset sau 2h 14m"; luân phiên ảnh |
| Component | card phiên (rỗng, chỉ CLI, CLI + Desktop), card hạn mức (bình thường, lỗi auth, lỗi mạng, chưa đăng nhập) |
| Command bar | provider trả đúng dòng |
| Thủ công | `tests/manual-claude.md`: chạy Claude thật ở phiên khác, xem pill đổi trạng thái trong vài giây |

## 11. Tiêu chí hoàn thành

1. Mở một phiên Claude ở cửa sổ khác: trong **2–3 giây** pill đổi sang `Thinking`/`Cooking · <tool>`. (Ban đầu
   viết "1 giây"; Lauren đổi ngày 20/09 để đánh đổi lấy CPU — xem tiêu chí 11.)
2. Phiên chờ duyệt quyền: pill chuyển `wait for you` màu vàng và nổi lên đầu danh sách.
3. Card phiên hiện đúng các phiên đang sống (cả `cli` lẫn `claude-desktop`) + tối đa 3 dòng lịch sử Desktop,
   bấm vào mở đúng thư mục.
3b. Phiên trong Orca hiện `winbar · firefish`, và hai worktree của cùng project nhìn ra được là cùng project.
3c. Tắt một phiên bằng cách đóng cửa sổ terminal rồi mở phiên mới trên cùng worktree: card chỉ có **một** dòng ở
   trên, bóng ma của phiên cũ nằm dưới mục "đã lâu không hoạt động".
4. Card hạn mức khớp với số thật của tài khoản (so với `/usage` trong Claude Code).
5. Rút mạng: card giữ số cũ và nói rõ là số cũ; cắm lại thì tự cập nhật.
6. Đổi tên/xóa `.credentials.json`: card báo "Chưa đăng nhập", **không** gọi mạng, không crash.
7. Ảnh luân phiên khi có nhiều ảnh; thả thêm ảnh tĩnh vào `claude-icons\thinking\` thì lần mở panel sau đã thấy.
8. Panel đóng và pill không hiện Claude: **không có timer nào chạy**, CPU về như trước module.
9. Không có phiên nào: widget tự ẩn khỏi pill.
10. Riêng tư: log không có token, không có đường dẫn đầy đủ, không có tiêu đề phiên.
11. Hiệu năng (bản release): RAM tăng ≤ 12 MB; CPU khi panel đóng ≤ mức trước module + 0,02%.
    **Đã đo và KHÔNG đạt phần CPU.** Thực tế: **+0,00** điểm phần trăm khi mọi phiên nằm im, **+0,081** khi có
    một phiên đang chạy tool. Con số 0,02% là tôi viết khi chưa đo; ~15 ms CPU mỗi lần pill đổi trạng thái (một
    vòng IPC + một lần React vẽ lại) là sàn của một pill sống. Chi tiết và ba giả thuyết sai:
    `tests/manual-claude.md` §7. **Cần bạn quyết** nới tiêu chí hay cho pill cập nhật thưa hơn.
12. `npm test`, `cargo test`, clippy, `npm run lint` qua; checklist thủ công chạy xong.

## 12. Rủi ro

| Rủi ro | Mức | Cách xử lý |
|---|---|---|
| Endpoint usage không công khai, có thể đổi hoặc bị chặn | **Cao** | Parser chịu được thiếu trường; lỗi thì giữ cache và nói rõ; không bao giờ làm app treo |
| `SessionEnd` không chạy nên file phiên cũ nằm lại tới 24 giờ | **Cao** (đã xảy ra: 94 file trong `sessions.d`) | Gom theo `cwd` và dùng `ts` để tách phiên thật khỏi bóng ma (§5.2); không bao giờ khẳng định một phiên "đã chết" |
| Định dạng `state.d` là của hook yasb, đổi hook là hỏng parser | Trung bình | Bỏ qua file không parse được thay vì hỏng cả danh sách; test với file thiếu trường |
| Orca đổi cách xếp thư mục worktree | Thấp | Không khớp thì hiện tên thư mục như cũ, không đoán; hàm tách chuỗi có test |
| Token lộ ra log hoặc ảnh chụp màn hình | **Cao** | Không log; không đưa token vào bất kỳ struct nào phát ra frontend; checklist có mục kiểm |
| WinHTTP viết tay sai, rò handle | Trung bình | Một hàm GET duy nhất, đóng handle bằng `Drop`; test với URL sai và không có mạng |
| Poll làm tốn CPU | ~~Trung bình~~ **Đã xảy ra** | Đo ở Task 6: +1,66 điểm lúc đầu (quét lại 156 file lịch sử mỗi lần đổi), còn +0,081 sau khi cache lịch sử và giãn nhịp quét. Vẫn trên tiêu chí 11 |
| Ảnh động làm tốn CPU | Trung bình | Bài học media: chỉ chạy khi thấy được; đo CPU khi panel đóng |

## 13. Giới hạn khi làm

- **Luôn:** chỉ đọc `~/.claude`; test trước khi commit; mỗi task một commit; kiểm trên app thật.
- **Hỏi trước:** thêm crate; thêm feature `windows` ngoài `Win32_Networking_WinHttp`; bất cứ thứ gì ghi vào `~/.claude`.
- **Không bao giờ:** ghi token ra đĩa hay log; đọc nội dung hội thoại; cài hook.

### 13.1 Bảo mật: đã chặn gì, chưa chặn được gì

| Đã chặn | Cách |
|---|---|
| Token vào log hoặc file của winbar | Không có `eprintln!` nào chạm token; cache chỉ chứa % và giờ reset. Đã quét 25 file trên máy để xác nhận |
| Token ra giao diện | `Usage` không có trường nào chứa token; có test khẳng định JSON không chứa `token`/`Bearer`/`accessToken` |
| Redirect mang token sang host khác | Tắt hẳn redirect ở tầng WinHTTP |
| Chèn header qua token dị dạng | Từ chối chuỗi có ký tự điều khiển; token hỏng bị coi như chưa đăng nhập |
| Nhận chứng chỉ giả | Không đụng tới `WINHTTP_OPTION_SECURITY_FLAGS`, nên giữ nguyên kiểm tra chứng chỉ mặc định của Windows |
| Rò handle khi lỗi | Mọi handle thuộc `Handle` tự đóng; có test gọi host không tồn tại |
| Bấm một dòng chạy nhầm chương trình | `cwd` đến từ file do hook **bên thứ ba** ghi, và bấm dòng sẽ đưa nó cho `ShellExecute`. Chỉ nhận **thư mục có thật**; file, chương trình, hay đường dẫn đã mất thì dòng vẫn hiện nhưng không bấm được |

| **Chưa chặn được** | Vì sao |
|---|---|
| Token nằm **plaintext** trong `~/.claude/.credentials.json` | Đó là file của Claude Code, không phải của winbar. Ai đọc được máy bạn thì đọc được token, bất kể winbar làm gì |
| Ghi đè bộ nhớ chỉ che một phần | Hệ điều hành có thể đã sao chép trang nhớ (pagefile, crash dump) trước đó. Việc ghi đè chỉ rút ngắn khoảng thời gian, không xóa được dấu vết đã có |
| Proxy hệ thống | Dùng đúng proxy Windows đang cấu hình, giống Claude Code. Nếu máy bị cài proxy MITM thì đó là vấn đề ở tầng máy |

## 14. Câu hỏi mở

- Ảnh tĩnh bạn thêm: cần crop/bo tròn tự động hay dùng nguyên?
- Cảnh báo 90% nên đẩy pill alert hay chỉ đổi màu thanh trong card?
