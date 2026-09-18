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

### 3.1 Phiên CLI — `~/.claude/statusbar/state.d/*.json`

Hook `claude-status-bar/hooks/lifecycle.js` **đã chạy sẵn** trên máy (khai báo trong `~/.claude/settings.json`),
ghi một file cho mỗi phiên còn sống, xóa khi `SessionEnd`. Máy đang có 6 file. Định dạng thật:

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

### 3.2 Phiên app Desktop — `%APPDATA%\Claude\`

`claude-code-sessions\**\local_*.json` (114 file) và `local-agent-mode-sessions\**\local_*.json` (42 file).
Chỉ đọc phần metadata, **không bao giờ đọc nội dung hội thoại**: `sessionId`, `title`, `lastActivityAt` (ms),
`completedTurns`, `cwd`, `isArchived`. Phiên đã archive thì bỏ.

Các phiên này **không có trạng thái live** — chỉ biết lần hoạt động cuối. Card phải nói rõ điều đó.

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

## 4. Quyết định kỹ thuật

| Việc | Cách làm | Vì sao |
|---|---|---|
| Theo dõi phiên CLI | Xem `mtime` của thư mục `state.d` mỗi **1 giây**; chỉ đọc lại file khi nó đổi | Một lần `stat` rẻ hơn hẳn đọc 6 file; pill cần cập nhật gần như tức thì |
| Gọi HTTPS | **WinHTTP** qua crate `windows` (feature `Win32_Networking_WinHttp`) | `reqwest` đã có trong cây phụ thuộc nhưng **không có TLS backend**; bật `rustls-tls` sẽ kéo thêm cả rustls + ring và làm build lâu hơn nhiều. App vốn đã chỉ chạy Windows và đã dùng nhiều Win32 |
| Cache hạn mức | `%APPDATA%\winbar\claude-usage.json`, TTL **120 giây**, làm mới mỗi 5 phút khi panel mở | Endpoint không công khai, phải tôn trọng rate limit (capability map) |
| Token | Đọc lại từ `.credentials.json` mỗi lần gọi, giữ trong bộ nhớ đúng lúc gọi | Không sao chép token sang chỗ khác, không ghi ra đĩa, **không bao giờ ghi log** |
| Phiên Desktop | Quét khi panel mở và mỗi 60 giây, không quét khi panel đóng | 156 file; không đáng quét liên tục |
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

Dòng phụ: `<project> · <thời gian trôi>` và `5h <pct>%` khi đã có số hạn mức (như mockup).
Không có phiên nào: widget tự ẩn khỏi pill (`shell.setHidden`), giống media khi không phát gì.

### 5.2 Card "Phiên Claude"

Theo mockup: mỗi dòng có ảnh trạng thái (26px), tên project + badge `cli`/`desktop`, dòng trạng thái, thời gian
bên phải. Nhãn card ghi số phiên đang mở.

- **Phiên CLI** (§3.1) lên trước, sắp theo §5.3.
- **Phiên Desktop** (§3.2) xuống dưới, tối đa 3 dòng, badge `desktop`, dòng trạng thái ghi `<n> lượt · <thời gian>`;
  **không** giả vờ có trạng thái live.
- Bấm một dòng: mở thư mục project (`cwd`) bằng lệnh `open_path` sẵn có.
- Không có phiên nào: "Không có phiên Claude nào đang mở".

### 5.3 Phiên nào là "sôi động nhất"

Sắp theo thứ tự: `permission` → `tool` → `thinking` → `idle`; cùng trạng thái thì `ts` mới hơn lên trước.
Phiên đang chờ bạn duyệt luôn nổi lên đầu — đó là thứ duy nhất cần bạn làm gì.

### 5.4 Ảnh trạng thái (bạn chốt 2026-09-18)

Mỗi trạng thái có **một danh sách ảnh**; nếu danh sách có nhiều hơn một thì ảnh **luân phiên**, mờ chồng
(`opacity`) mỗi **6 giây**.

Bộ kèm app (3 ảnh, giữ nguyên 2 ảnh đang dùng + 1 ảnh cũ của yasb):

| Trạng thái | Ảnh |
|---|---|
| `idle` | `claude_headstone.png` |
| `thinking`, `tool` | `claude-fu-transparent.gif` ↔ `working.gif` |
| `permission` | `claude-fu-transparent.gif` (viền màu `--warn`) |

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
- Mỗi phiên CLI một dòng: Enter mở thư mục project.
- Một dòng "Hạn mức Claude · 5h 52% · 7d 24%": Enter mở notch tab Claude.
- `remember: false` cho dòng phiên (phiên là thứ thoáng qua, nhớ lại sẽ trỏ vào phiên đã chết).

## 6. Hợp đồng

```ts
// src/widgets/claude/native.ts
export type ClaudePhase = "idle" | "thinking" | "tool" | "permission";

export interface ClaudeSession {
  id: string;
  /** "cli" đọc từ statusbar hook; "desktop" đọc từ app Claude Desktop. */
  source: "cli" | "desktop";
  /** Tên project (CLI) hoặc tiêu đề phiên (Desktop). */
  title: string;
  /** Desktop không có trạng thái live: luôn là "idle". */
  phase: ClaudePhase;
  /** Tên tool khi phase = "tool". */
  tool?: string;
  cwd?: string;
  /** Epoch ms. */
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
src/assets/claude/  claude_headstone.png · claude-fu-transparent.gif · working.gif
```

## 9. Phong cách

Như các module trước. **Không bao giờ ghi token, `cwd` đầy đủ, hay tiêu đề phiên ra log.** Log chỉ có số phiên,
trạng thái, và mã lỗi.

## 10. Kiểm thử

| Mức | Nội dung |
|---|---|
| Rust | đọc `state.d` (file hỏng, file cũ 24h, thiếu trường); sắp thứ tự phiên; chọn cửa sổ hạn mức từ 3 dạng payload thật; cache hết hạn; quét thư mục ảnh (file quá lớn, đuôi lạ) |
| TS thuần | chữ/màu theo trạng thái; "Reset sau 2h 14m"; luân phiên ảnh |
| Component | card phiên (rỗng, chỉ CLI, CLI + Desktop), card hạn mức (bình thường, lỗi auth, lỗi mạng, chưa đăng nhập) |
| Command bar | provider trả đúng dòng |
| Thủ công | `tests/manual-claude.md`: chạy Claude thật ở phiên khác, xem pill đổi trạng thái trong 1 giây |

## 11. Tiêu chí hoàn thành

1. Mở một phiên Claude ở cửa sổ khác: trong 1 giây pill đổi sang `Thinking`/`Cooking · <tool>`.
2. Phiên chờ duyệt quyền: pill chuyển `wait for you` màu vàng và nổi lên đầu danh sách.
3. Card phiên hiện đúng các phiên CLI đang sống + tối đa 3 phiên Desktop, bấm vào mở đúng thư mục.
4. Card hạn mức khớp với số thật của tài khoản (so với `/usage` trong Claude Code).
5. Rút mạng: card giữ số cũ và nói rõ là số cũ; cắm lại thì tự cập nhật.
6. Đổi tên/xóa `.credentials.json`: card báo "Chưa đăng nhập", **không** gọi mạng, không crash.
7. Ảnh luân phiên khi có nhiều ảnh; thả thêm ảnh tĩnh vào `claude-icons\thinking\` thì lần mở panel sau đã thấy.
8. Panel đóng và pill không hiện Claude: **không có timer nào chạy**, CPU về như trước module.
9. Không có phiên nào: widget tự ẩn khỏi pill.
10. Riêng tư: log không có token, không có đường dẫn đầy đủ, không có tiêu đề phiên.
11. Hiệu năng (bản release): RAM tăng ≤ 12 MB; CPU khi panel đóng ≤ mức trước module + 0,02%.
12. `npm test`, `cargo test`, clippy, `npm run lint` qua; checklist thủ công chạy xong.

## 12. Rủi ro

| Rủi ro | Mức | Cách xử lý |
|---|---|---|
| Endpoint usage không công khai, có thể đổi hoặc bị chặn | **Cao** | Parser chịu được thiếu trường; lỗi thì giữ cache và nói rõ; không bao giờ làm app treo |
| Định dạng `state.d` là của hook yasb, đổi hook là hỏng parser | Trung bình | Bỏ qua file không parse được thay vì hỏng cả danh sách; test với file thiếu trường |
| Token lộ ra log hoặc ảnh chụp màn hình | **Cao** | Không log; không đưa token vào bất kỳ struct nào phát ra frontend; checklist có mục kiểm |
| WinHTTP viết tay sai, rò handle | Trung bình | Một hàm GET duy nhất, đóng handle bằng `Drop`; test với URL sai và không có mạng |
| Poll 1 giây làm tốn CPU | Trung bình | Chỉ `stat` một thư mục; đo ở task cuối như các module trước |
| Ảnh động làm tốn CPU | Trung bình | Bài học media: chỉ chạy khi thấy được; đo CPU khi panel đóng |

## 13. Giới hạn khi làm

- **Luôn:** chỉ đọc `~/.claude`; test trước khi commit; mỗi task một commit; kiểm trên app thật.
- **Hỏi trước:** thêm crate; thêm feature `windows` ngoài `Win32_Networking_WinHttp`; bất cứ thứ gì ghi vào `~/.claude`.
- **Không bao giờ:** ghi token ra đĩa hay log; đọc nội dung hội thoại; cài hook.

## 14. Câu hỏi mở

- Ảnh tĩnh bạn thêm: cần crop/bo tròn tự động hay dùng nguyên?
- Cảnh báo 90% nên đẩy pill alert hay chỉ đổi màu thanh trong card?
