# Spec: notch-shell

> Module id: `notch-shell` (xem `CAPABILITY-MAP.md`). Trạng thái: **ĐÃ DUYỆT (2026-09-16)**.
> Nguồn UI đã duyệt: `design/winbar-mockup.html` (mockup là chuẩn về hình ảnh, kích thước, chuyển động).

## 1. Mục tiêu

Dựng "vỏ" của app winbar: cửa sổ notch nổi ở giữa mép trên màn hình Windows 11, co giãn giữa các trạng thái pill
và panel, và **khung để các widget cắm vào**. Shell không chứa tính năng nghiệp vụ nào (media, clipboard, Claude…);
các module sau chỉ cần viết widget theo hợp đồng ở mục 6 là hiện lên notch.

Người dùng: một người (bạn), dùng hằng ngày trên máy cá nhân Windows 11.

### User stories

- Tôi thấy một pill kính mờ nhỏ cách mép trên 8px; nó không che thao tác của tôi ở phần còn lại của màn hình.
- Tôi rê chuột (hoặc bấm, tùy cài đặt) để pill mở thành panel có tab **Core** và **Claude**.
- Tôi chọn widget nào hiện trên pill thu gọn; khi có việc cần tôi duyệt, pill tạm hiện việc đó và cho duyệt ngay.
- Tôi chỉnh kích thước pill, độ rộng panel, khoảng cách mép trên, cỡ chữ, bật/tắt và sắp xếp widget; cài đặt được nhớ.
- App tự chạy khi mở máy và không làm máy chậm.

## 2. Phạm vi

**Trong phạm vi**

| Hạng mục | Ghi chú |
|---|---|
| Cửa sổ notch | Trong suốt, không viền, luôn nằm trên, không hiện trên taskbar, không lấy focus khi chỉ hover |
| 4 trạng thái hiển thị | `pill`, `alert`, `always`, `expanded` (mục 5) |
| 3 cách mở | `hover` (chờ 250ms), `click`, `always` |
| Tab Core / Claude | Tab Claude có biểu tượng Claude của layout Claude; ẩn tab nếu tắt toàn bộ widget Claude |
| Hợp đồng widget | Card, nội dung pill, nội dung pill always, alert, search provider (mục 6) |
| Hàng đợi alert | Alert chiếm pill theo độ ưu tiên; widget đăng ký, shell hiển thị |
| Cài đặt | Màn riêng giống mockup: Pill, Widget, Cỡ chữ; lưu ra file; áp dụng ngay |
| Phím tắt toàn cục | Cơ chế đăng ký; `Ctrl+Space` dành cho `command-bar` (shell chỉ giữ chỗ, báo lỗi nếu bị trùng) |
| Icon khay hệ thống | Menu: Mở notch · Command bar (Ctrl+Space) · Ẩn notch tạm thời · Cài đặt… · Khởi động cùng Windows ✓ · Thoát winbar. Icon lấy từ bộ icon bạn cung cấp (mục 14) |
| Khởi động cùng Windows | Bật/tắt trong Cài đặt và menu khay |
| Chạy một bản duy nhất | Mở app lần 2 thì đưa bản đang chạy lên, không tạo bản mới |
| Design tokens | Màu, font, bán kính, thời gian chuyển động lấy từ mockup |
| Widget mẫu `demo` | Chỉ bật ở chế độ dev, dùng để kiểm thử hợp đồng widget và alert |

**Ngoài phạm vi** (module khác làm): nội dung media, clipboard, hệ thống, Claude sessions/usage/approvals,
giao diện command bar, tìm file/app. Nhiều màn hình mức nâng cao (xem mục 11).

## 3. Tech stack

| Phần | Lựa chọn |
|---|---|
| Khung app | Tauri 2.x (bản stable mới nhất lúc scaffold, ghim version trong `Cargo.lock` / `package-lock.json`) |
| Native | Rust stable; crate `window-vibrancy` (hiệu ứng acrylic/mica), `windows` (Win32 khi cần) |
| Plugin Tauri | `global-shortcut`, `autostart`, `store` (lưu cài đặt), `single-instance` |
| Giao diện | React + TypeScript (strict) + Vite |
| State UI | React state + một store nhỏ (Zustand) cho cài đặt và alert |
| Test | Vitest + Testing Library (UI/logic), `cargo test` (Rust), checklist thủ công cho hành vi cửa sổ |
| Font | Onest + JetBrains Mono, **đóng gói kèm app** (không tải từ Google Fonts lúc chạy) |

## 4. Lệnh

```
Cài lần đầu:   npm install
Dev:           npm run tauri dev
Build:         npm run tauri build
Test UI:       npm test            (vitest run)
Test Rust:     cargo test --manifest-path src-tauri/Cargo.toml
Lint:          npm run lint        (eslint + tsc --noEmit)
Format:        npm run format      (prettier) ; cargo fmt --manifest-path src-tauri/Cargo.toml
```

## 5. Hành vi notch

### 5.1 Trạng thái

| Trạng thái | Khi nào | Kích thước mặc định | Nội dung |
|---|---|---|---|
| `pill` | Mode `hover`/`click`, đang thu gọn, không có alert | 340×40 | `Pill` của widget ưu tiên |
| `alert` | Mode `hover`/`click`, đang thu gọn, có alert | rộng pill + 150, cao pill + 4 | Alert đầu hàng đợi, kèm nút hành động |
| `always` | Mode `always`, đang thu gọn | 620×64 | `MidPill` của 2 widget: ưu tiên trước, rồi widget kế tiếp; nếu có alert thì hiện alert |
| `expanded` | Người dùng mở | rộng 780, cao theo nội dung (tối đa 80% chiều cao màn hình, phần dư cuộn) | Thanh tab + card của các widget đang bật |

### 5.2 Chuyển trạng thái

```
pill/alert/always ──(hover 250ms | click)──▶ expanded
expanded ──(chuột rời notch, mode hover)──▶ về trạng thái thu gọn tương ứng
expanded ──(bấm ⌃ | Esc | click ra ngoài, mode click/always)──▶ thu gọn
alert: hover KHÔNG tự mở (để bấm được nút trên pill); bấm vào vùng chữ của pill thì mở và chuyển sang tab của widget phát alert
```

### 5.3 Chuyển động (lấy từ mockup)

| Việc | Giá trị |
|---|---|
| Đổi kích thước | 420ms, `cubic-bezier(.32,1.25,.5,1)` |
| Nội dung panel hiện ra | fade + trượt 6px, 300ms, trễ 100ms |
| Đổi tab | fade + trượt ngang 6px, 240ms |
| Hover delay | 250ms mở; rời chuột là đóng ngay |

### 5.4 Cửa sổ và chuột

- Cửa sổ native **luôn khớp đúng kích thước khối notch** (không dùng một cửa sổ trong suốt to che màn hình),
  nên vùng ngoài notch không bao giờ chặn chuột.
- Vị trí: giữa cạnh trên của màn hình chính, cách mép `topGap` px; tính theo DPI của màn hình đó.
- Hiệu ứng kính mờ: acrylic của Windows áp lên cửa sổ, bo góc theo trạng thái. Nếu không làm được bo góc lớn với acrylic
  (xem Rủi ro R1) thì dùng nền mờ đặc `rgba(20,24,32,0.92)` làm phương án dự phòng.
- Không lấy focus khi hover; chỉ lấy focus khi người dùng bấm vào ô nhập trong panel.

## 6. Hợp đồng widget

```ts
// src/shell/widget-contract.ts
export type WidgetId = string;           // kebab-case, trùng module id: "media", "claude-sessions"…
export type TabId = 'core' | 'claude';

export interface WidgetDefinition {
  id: WidgetId;
  tab: TabId;
  title: string;                          // hiện trong Cài đặt › Widget
  description: string;
  Card: React.ComponentType;              // nội dung trong panel mở rộng
  Pill?: React.ComponentType;             // nội dung pill 340×40 khi là widget ưu tiên
  MidPill?: React.ComponentType;          // nửa pill always 620×64
  layout?: { tall?: boolean };            // tall: chiếm riêng một cột (vd. clipboard)
  searchProvider?: SearchProvider;        // command-bar dùng; shell chỉ thu thập
}

export interface PillAlert {
  id: string;                             // duy nhất; đăng ký lại cùng id thì thay thế
  source: WidgetId;
  priority: number;                       // cao hơn hiện trước; bằng nhau thì cái đến trước
  Content: React.ComponentType;           // tự vẽ nút hành động
}

export interface ShellApi {
  alerts: { push(alert: PillAlert): void; dismiss(id: string): void };
  openPanel(tab?: TabId): void;
  collapse(): void;
}

export interface SearchProvider {
  id: string;
  prefix?: string;                        // vd. "cb"
  search(query: string, signal: AbortSignal): Promise<SearchResult[]>;
}
export interface SearchResult { id: string; title: string; subtitle?: string; icon?: string; run(): void | Promise<void>; }
```

Quy tắc:
- Widget đăng ký qua `registerWidget(def)` trong `src/widgets/index.ts`; shell không import widget cụ thể nào khác.
- Widget bị tắt trong Cài đặt: không render, không nhận `ShellApi`, alert của nó bị gỡ, provider bị bỏ khỏi danh sách.
- Widget lỗi khi render: shell bắt lỗi (error boundary), hiện card "Widget lỗi" và vẫn chạy các widget khác.
- Bố cục tab: widget `tall` chiếm một cột; các widget còn lại xếp chồng ở cột kia theo thứ tự trong Cài đặt;
  không có widget `tall` thì lưới 2 cột theo thứ tự.

## 7. Cài đặt

Lưu ở `%APPDATA%\winbar\settings.json` qua plugin `store`. Áp dụng ngay, không cần khởi động lại.

```json
{
  "version": 1,
  "pill":  { "size": "m", "alwaysSize": "m", "panelWidth": "m", "topGap": 8, "openMode": "hover", "priorityWidget": "claude-sessions" },
  "fontScale": 100,
  "widgets": [ { "id": "media", "enabled": true }, { "id": "system", "enabled": true }, { "id": "clipboard", "enabled": true },
               { "id": "claude-sessions", "enabled": true }, { "id": "claude-usage", "enabled": true } ],
  "hotkeys": { "commandBar": "Ctrl+Space" },
  "launchAtStartup": true
}
```

| Trường | Giá trị hợp lệ |
|---|---|
| `pill.size` | `s` 300×36 · `m` 340×40 · `l` 400×46 |
| `pill.alwaysSize` | `m` 620×64 · `l` 700×76 |
| `pill.panelWidth` | `s` 720 · `m` 780 · `l` 860 |
| `pill.topGap` | 0–24 (px) |
| `pill.openMode` | `hover` · `click` · `always` |
| `fontScale` | 85–130, bước 5 (%), áp dụng cho chữ và biểu tượng trong notch |

- File hỏng hoặc giá trị ngoài khoảng: dùng mặc định cho trường đó, ghi log cảnh báo, không crash.
- Widget có trong file nhưng không còn tồn tại: bỏ qua. Widget mới chưa có trong file: thêm vào cuối, bật.
- Màn Cài đặt là **cửa sổ riêng** (không nằm trong notch), mở từ nút ⚙ trong panel hoặc menu khay. Có nút **Thoát winbar**.
- **Ẩn notch tạm thời** (menu khay): ẩn cho tới khi bấm lại hoặc khởi động lại app; alert vẫn được xếp hàng và hiện khi notch hiện lại.

## 8. Cấu trúc thư mục

```
winbar/
  src-tauri/
    src/main.rs              → khởi tạo app, plugin, single-instance
    src/window.rs            → tạo/định vị/đổi kích thước cửa sổ notch, acrylic, DPI
    src/settings.rs          → đọc/ghi/validate settings.json
    src/hotkeys.rs           → đăng ký phím tắt toàn cục
    src/tray.rs              → icon khay và menu
    tauri.conf.json
  src/
    shell/                   → Notch, Pill, Panel, Tabs, alert queue, widget registry, widget-contract.ts
    settings/                → màn Cài đặt
    widgets/index.ts         → registerWidget(...) cho từng widget
    widgets/demo/            → widget mẫu (chỉ dev)
    design/tokens.css        → màu, font, bán kính, chuyển động
    assets/claude/           → claude-fu-transparent.gif, claude_headstone.png
  tests/                     → test Vitest ngoài từng thư mục (nếu cần)
  design/                    → mockup đã duyệt (không build vào app)
```

## 9. Phong cách code

```ts
// Một component: props rõ ràng, không logic nghiệp vụ trong shell, style lấy từ token.
export function Pill({ state, children }: { state: NotchState; children: React.ReactNode }) {
  return (
    <div className={styles.pill} data-state={state}>
      {children}
    </div>
  );
}
```

- TypeScript `strict`, không `any`. Tên file kebab-case; component PascalCase; hook `useXxx`.
- Kích thước và thời gian chuyển động chỉ khai báo một chỗ (`tokens.css` + `notch-sizes.ts`), không rải số cứng.
- Rust: `cargo fmt` + `clippy` sạch; lệnh Tauri trả `Result<_, String>` với thông báo rõ.
- Chuỗi hiển thị tiếng Việt, giữ nguyên các chữ trạng thái Claude đã chốt (`idle`, `Thinking`, `Cooking`, `wait for you`).

## 10. Kiểm thử

| Mức | Công cụ | Nội dung |
|---|---|---|
| Unit | Vitest | Máy trạng thái notch (mọi chuyển trạng thái ở 5.2); hàng đợi alert (ưu tiên, thay thế, gỡ khi tắt widget); validate cài đặt; thuật toán xếp bố cục widget |
| Component | Vitest + Testing Library | Pill hiện đúng widget ưu tiên; alert có nút bấm được và không mở panel khi hover; tắt widget thì card biến mất; error boundary |
| Rust | `cargo test` | Đọc/ghi/validate settings; tính vị trí cửa sổ theo DPI (100/125/150%) |
| Thủ công | Checklist trong `tests/manual-shell.md` | Click xuyên ngoài notch; không lấy focus khi hover; phím tắt; autostart; single-instance; đổi DPI/màn hình chính |

Viết test trước cho máy trạng thái, alert queue và validate cài đặt. Không xóa test đang fail khi chưa hỏi.

## 11. Tiêu chí hoàn thành

1. `npm run tauri dev` mở pill giữa mép trên màn hình chính, cách 8px, đúng 340×40 ở DPI 100%, 125%, 150%.
2. Chuột ở ngoài khối notch click được vào app bên dưới ở mọi trạng thái.
3. Mode `hover`: mở sau 250ms, đóng khi rời chuột. Mode `click`: bấm mở, Esc/⌃/click ra ngoài đóng. Mode `always`: pill 620×64, bấm mở.
4. Widget `demo` đẩy alert: pill chuyển `alert`, hover không mở, bấm nút gọi đúng callback, alert gỡ thì pill trở lại.
5. Đổi mọi mục trong Cài đặt thì notch đổi ngay; tắt/mở app vẫn giữ nguyên; file cài đặt hỏng không làm app crash.
6. Bật/tắt và đổi thứ tự widget trong Cài đặt thì panel đổi theo đúng quy tắc bố cục ở mục 6.
7. Mở app lần 2 không tạo bản thứ hai. Bật "khởi động cùng Windows" thì đăng nhập lại app tự chạy.
   Menu khay có đủ các mục ở mục 2 và từng mục chạy đúng; "Thoát winbar" gỡ phím tắt và đóng hẳn app.
8. `Ctrl+Space` được đăng ký; nếu bị app khác giữ thì Cài đặt báo "phím tắt đang bị dùng" thay vì im lặng.
9. Khi thu gọn và không có hoạt động: CPU trung bình < 1%, RAM (app + WebView2) < 150 MB, đo bằng Task Manager trong 1 phút.
10. Chuyển động khớp mục 5.3; so trực quan với mockup không lệch rõ về kích thước, màu, bo góc.
11. `npm test`, `cargo test`, `npm run lint` đều qua.

## 12. Rủi ro

| # | Rủi ro | Cách xử lý |
|---|---|---|
| R1 | Acrylic của Windows áp cho cả khung cửa sổ; bo góc lớn (20–32px) có thể bị viền vuông hoặc răng cưa | **Làm spike đầu tiên** (≤ 1 buổi): thử `window-vibrancy` + bo góc bằng region/DWM. Không đạt thì dùng nền mờ đặc dự phòng và báo lại để bạn chọn |
| R2 | Đổi kích thước cửa sổ native theo animation 420ms có thể giật | Đặt cửa sổ ở kích thước đích ngay khi bắt đầu mở (lớn hơn), animate khối bên trong bằng CSS; thu gọn thì đợi animation xong mới thu cửa sổ |
| R3 | `Ctrl+Space` trùng yasb Quick Launch và bộ gõ tiếng Việt/IME | Báo trùng rõ ràng (tiêu chí 8); bạn tắt phím tắt bên yasb khi dùng song song |
| R4 | WebView2 tốn RAM hơn mục tiêu | Đo sớm sau spike; nếu vượt thì báo lại trước khi làm tiếp |
| R5 | Nhiều màn hình, đổi màn hình chính khi đang chạy | v1: chỉ màn hình chính, tự định vị lại khi cấu hình màn hình đổi |

## 13. Giới hạn khi làm

- **Luôn:** chạy `npm test`, `cargo test`, `npm run lint` trước khi commit; theo đúng mockup; ghi rõ khi lệch mockup và lý do.
- **Hỏi trước:** cài Rust toolchain (`rustup`); thêm dependency ngoài danh sách ở mục 3; đổi hợp đồng widget sau khi đã duyệt;
  đổi kích thước, chuyển động hoặc chữ đã chốt; bất cứ thao tác nào với `~/.claude` (không thuộc module này).
- **Không bao giờ:** ghi vào `~/.claude`; commit bí mật/token; xóa hoặc bỏ qua test đang fail; tải font/asset từ mạng lúc chạy.

## 14. Quyết định đã chốt và câu hỏi còn mở

Đã chốt: cài Rust (stable, MSVC) và VS Build Tools; **có** icon khay; Cài đặt là cửa sổ riêng; code đặt ở gốc worktree `firefish` (nhánh `firefish`).

Còn mở (không chặn việc bắt đầu):
1. **Bộ icon:** bạn sẽ đưa thư viện icon. Cần biết định dạng (SVG rời, icon font, hay gói npm như Lucide/Tabler/Phosphor) và giấy phép.
   Khi có, dùng cho cả icon khay (.ico nhiều kích thước 16–256) lẫn icon trong UI (thay các icon vẽ tay trong mockup). Trước đó dùng icon tạm.
