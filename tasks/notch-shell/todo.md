# Tasks: notch-shell

> Plan: `tasks/notch-shell/plan.md` · Spec: `SPEC-notch-shell.md` · Mockup: `design/winbar-mockup.html`
> Lệnh chung: `npm test` · `cargo test --manifest-path src-tauri/Cargo.toml` · `npm run lint` · `npm run tauri dev`

---

## Giai đoạn 0 — Nền móng và spike

### Task 1: Scaffold Tauri 2 + React/TS + công cụ test/lint

**Mô tả:** Tạo app Tauri 2 (React + TypeScript + Vite) ở gốc worktree, bật TypeScript strict, cài Vitest + Testing Library,
ESLint + Prettier, `cargo fmt`/`clippy`. Mở được một cửa sổ trống. Thêm `.gitignore` cho `node_modules`, `target`, `dist`.

**Tiêu chí chấp nhận:**
- [x] `npm run tauri dev` mở cửa sổ app không lỗi
- [x] `npm test` chạy được một test mẫu; `npm run lint` sạch
- [x] `cargo test` và `cargo clippy -- -D warnings` sạch

**Kiểm tra:** (2026-09-16, Windows 11 ARM64, rustc 1.98.1)
- [x] `npm test`: 1 passed · `npm run lint`: sạch · `cargo test`: ok · `cargo clippy -D warnings`: sạch · `cargo fmt --check`: sạch
- [x] Thủ công: `npm run tauri dev` mở cửa sổ "winbar" (winbar.exe ~31 MB). Build Rust lần đầu ~8 phút.

**Phụ thuộc:** Rust + VS Build Tools đã cài
**File dự kiến:** `package.json`, `vite.config.ts`, `tsconfig.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `.gitignore`, `eslint.config.js`
**Quy mô:** M

### Task 2: Spike kính mờ, bo góc và RAM

**Mô tả:** Thử cửa sổ không viền, trong suốt, luôn nằm trên, kích thước 340×40 rồi 780×486, áp acrylic bằng `window-vibrancy`
và bo góc 20px/28px (thử region/DWM). Chụp ảnh trên hình nền sáng và tối, đo RAM app + WebView2 khi đứng yên.
Ghi kết quả và đề xuất vào `docs/spikes/acrylic.md`. Code spike để trong `spikes/` hoặc xóa sau khi ghi kết quả.

**Tiêu chí chấp nhận:**
- [x] `docs/spikes/acrylic.md` có ảnh chụp, số RAM, và kết luận: acrylic bo góc **không đạt**
- [x] Nêu rõ cách vẽ nền đề xuất cho các task sau: nền CSS đặc (`css-dense`)

**Kiểm tra:**
- [x] Thủ công: ảnh chụp 6 cách × 2 kích thước trên desktop thật (không đổi hình nền của bạn); RAM release 135 MB, CPU 0.02% sau 60s

**Phụ thuộc:** Task 1
**File dự kiến:** `src-tauri/src/window.rs` (thử nghiệm), `docs/spikes/acrylic.md`
**Quy mô:** S

## Checkpoint 0
- [x] Bạn xem `docs/spikes/acrylic.md` và chọn cách vẽ nền → **css-dense** (2026-09-16)
- [x] RAM release 135 MB < 150 MB, không cần xử lý thêm

---

## Giai đoạn 1 — Notch lõi

### Task 3: Pill tĩnh đúng vị trí, kích thước, DPI

**Mô tả:** Cửa sổ notch thật: giữa cạnh trên màn hình chính, cách mép `topGap` (8px), pill 340×40 với nền theo Checkpoint 0.
Thêm design tokens (gồm token chuyển động v1) và font đóng gói kèm (Onest, JetBrains Mono).
Thêm `iconoir-react` và component `Icon` bọc duy nhất. Tính vị trí theo DPI; định vị lại khi đổi màn hình/DPI.
Không lấy focus, không hiện trên taskbar.

**Tiêu chí chấp nhận:**
- [x] Pill đúng 340×40 (px logic), cách mép 8px, căn giữa — đo thật ở 125% (425×50 vật lý tại x=747, y=10 trên màn 1920×1200); 100%/150% qua test Rust
- [x] Click ở ngoài pill đi xuyên xuống app bên dưới (cửa sổ native chỉ bằng khối pill)
- [x] Hàm tính vị trí có test Rust cho 3 mức DPI (+ màn hình có gốc âm)

**Kiểm tra:** (2026-09-16)
- [x] `cargo test` 4 passed · `cargo clippy -D warnings` sạch · `npm test` 6 passed · `npm run lint` sạch
- [x] Thủ công: `npm run tauri dev` — cửa sổ luôn nằm trên, không lấy focus, font Onest + icon Iconoir hiển thị đúng
- [ ] Thủ công (bạn): đổi Scale trong Windows Settings sang 100%/150%, pill tự định vị lại trong ~2 giây (mình không đổi cài đặt màn hình của bạn)

**Ghi chú:** 4 góc trong suốt ngoài phần bo tròn vẫn thuộc cửa sổ (vài px), click vào đó chưa xuyên xuống. Xử lý nếu thấy vướng.

**Phụ thuộc:** Checkpoint 0
**File dự kiến:** `src-tauri/src/window.rs`, `src/design/tokens.css`, `src/shell/notch-sizes.ts`, `src/shell/Notch.tsx`, `src/shell/Icon.tsx`
**Quy mô:** M

### Task 4: Máy trạng thái notch + mode hover/click + chuyển động mở/thu

**Mô tả:** Viết máy trạng thái thuần (TS) theo mục 5.2 của spec, test trước. Nối vào UI: mode `hover` (250ms), `click`
(bấm mở; Esc/⌃/click ra ngoài đóng). Chuyển động M1, M2, M4, M6 theo mục 5.3; cửa sổ native nhảy tới kích thước đích khi mở,
thu lại sau khi animate xong. Panel cao theo nội dung, tối đa 80% màn hình.

**Tiêu chí chấp nhận:**
- [x] Test phủ mọi chuyển trạng thái ở 5.2 (hover/click/always, đổi mode) — 13 test máy trạng thái + 7 test component
- [x] Hover 250ms mở, rời chuột đóng; click mode đóng bằng Esc, ⌃, click ra ngoài (mất focus)
- [~] Không thấy giật/nháy khi mở và thu — chụp giữa chuyển động không thấy nháy; chưa quay 60fps

**Kiểm tra:** (2026-09-16)
- [x] `npm test` 24 passed · `npm run lint` sạch
- [x] Thủ công (tự động di chuột, trả chuột về chỗ cũ): hover 120ms vẫn là pill; ~450ms đã mở 780×138 logic;
      rời chuột: cửa sổ native giữ lớn 150ms rồi thu về 340×40 sau khi chuyển động xong; hover không lấy focus
- [ ] Thủ công (bạn): mode click (bấm, Esc, click ra ngoài) — cần bấm chuột thật nên để bạn thử ở Checkpoint 1

**Phụ thuộc:** Task 3
**File dự kiến:** `src/shell/notch-machine.ts`, `src/shell/notch-machine.test.ts`, `src/shell/Notch.tsx`, `src-tauri/src/window.rs`
**Quy mô:** M

### Task 5: Hợp đồng widget, registry, tab Core/Claude, bố cục, widget demo

**Mô tả:** Thêm `widget-contract.ts` đúng mục 6 của spec, `registerWidget`, thanh tab Core/Claude (ẩn tab Claude khi
không có widget Claude bật), thuật toán bố cục (widget `tall` một cột, còn lại xếp chồng theo thứ tự), error boundary.
Widget `demo` (chỉ dev): một card thường, một card `tall`, một widget ở tab Claude, và một widget cố tình lỗi.

**Tiêu chí chấp nhận:**
- [x] Thuật toán bố cục có test (có/không có `tall`, thứ tự, nhiều `tall`, rỗng) — widget tắt được lọc trước khi vào bố cục (Task 8)
- [x] Widget lỗi hiện card "Widget lỗi", các widget khác vẫn chạy (kể cả widget có state)
- [x] Panel mở ra hiện card demo đúng tab, đúng bố cục

**Kiểm tra:** (2026-09-16)
- [x] `npm test` 40 passed (bố cục 6, registry 2, Panel 7, Notch 8, máy trạng thái 13, kích thước 4) · `npm run lint` sạch
- [x] Thủ công: pill hiện "Demo widget"; hover mở panel 780×324 logic với tab Core (card thường + card lỗi | card cao) và tab Claude có biểu tượng
- [ ] Thủ công (bạn): bấm chuyển tab Core/Claude ở Checkpoint 1

**Phụ thuộc:** Task 4
**File dự kiến:** `src/shell/widget-contract.ts`, `src/shell/registry.ts`, `src/shell/layout.ts`, `src/shell/Panel.tsx`, `src/widgets/demo/*`
**Quy mô:** M

## Checkpoint 1
- [ ] `npm test`, `cargo test`, `npm run lint` qua
- [ ] Mở/thu notch ở hover và click, card demo đúng bố cục
- [ ] Bạn xem thử trên máy trước khi làm tiếp

---

## Giai đoạn 2 — Alert và always

### Task 6: Hàng đợi alert + trạng thái alert trên pill

**Mô tả:** `ShellApi.alerts.push/dismiss` với hàng đợi theo `priority` (bằng nhau thì cái đến trước; cùng `id` thì thay thế).
Có alert: pill chuyển `alert` (rộng pill + 150, cao + 4), hover không tự mở, nút trong alert bấm được, bấm vùng chữ thì
mở panel ở tab của widget phát alert. Widget bị tắt thì alert của nó bị gỡ. Chuyển động chỉ dùng M1 (không nảy/rung ở v1).
Thêm `flashPill` cho pill tạm thời (M7). Widget demo có nút "đẩy alert" và "flash pill".

**Tiêu chí chấp nhận:**
- [x] Test hàng đợi: ưu tiên, thay thế cùng id (giữ chỗ), gỡ, gỡ theo widget
- [x] Hover lên pill alert không mở panel; bấm nút gọi đúng callback rồi pill trở lại
- [x] Bấm vùng chữ mở panel ở đúng tab
- [x] `flashPill` hiện nội dung tạm 1.2s rồi trở lại; alert đang hiện thì không bị flash đè

**Kiểm tra:** (2026-09-16)
- [x] `npm test` 65 passed (hàng đợi 7, shell 7, máy trạng thái 16, Notch 17, …) · `npm run lint` sạch
- [ ] Thủ công (bạn, Checkpoint 2): card "Demo cảnh báo" → đẩy 2 alert khác ưu tiên, trả lời trên pill, flash "Đã copy"

**Ghi chú:** thêm `Background` vào hợp đồng widget (đã ghi vào spec §6). Pill giờ là `div role="button"` để nội dung widget có nút riêng mà không lồng `<button>`.

**Phụ thuộc:** Task 5
**File dự kiến:** `src/shell/alert-queue.ts`, `src/shell/alert-queue.test.ts`, `src/shell/Pill.tsx`, `src/shell/notch-machine.ts`, `src/widgets/demo/*`
**Quy mô:** M

### Task 7: Mode always (pill lớn hai widget)

**Mô tả:** Mode `always`: pill 620×64 hiện `MidPill` của widget ưu tiên rồi widget kế tiếp có `MidPill`, ngăn bằng vạch dọc;
có alert thì hiện alert ở cỡ pill lớn. Bấm để mở panel, ⌃ để về pill lớn.

**Tiêu chí chấp nhận:**
- [x] Máy trạng thái có test cho `always` ↔ `expanded` và `always` + alert
- [x] Hiện đúng hai widget theo thứ tự ưu tiên; chỉ một widget có `MidPill` thì chiếm cả pill

**Kiểm tra:** (2026-09-16)
- [x] `npm test` 77 passed (chọn nội dung pill 7, always 4, …) · `npm run lint` sạch
- [x] Thủ công: `VITE_NOTCH_MODE=always` → cửa sổ 775×80 vật lý = 620×64 logic; "Demo widget" | "Cooking" (GIF) có vạch ngăn; không lấy focus
- [ ] Thủ công (bạn, Checkpoint 2): so với mockup `?mode=always&phase=permission` sau khi đẩy cảnh báo từ card demo

**Ghi chú:** chạy thử mode khác khi chưa có Cài đặt: PowerShell `$env:VITE_NOTCH_MODE='always'; npm run tauri dev` (hoặc `click`).

**Phụ thuộc:** Task 6
**File dự kiến:** `src/shell/notch-machine.ts`, `src/shell/MidPill.tsx`, `src/shell/notch-machine.test.ts`
**Quy mô:** S

## Checkpoint 2
- [ ] Đủ 4 trạng thái pill / alert / always / expanded
- [ ] So từng trạng thái với mockup; ghi lại chỗ lệch nếu có
- [ ] Test và lint qua

---

## Giai đoạn 3 — Cài đặt

### Task 8: Mô hình cài đặt (Rust) + áp dụng trực tiếp lên notch

**Mô tả:** `settings.rs`: đọc/ghi `%APPDATA%\winbar\settings.json` đúng schema mục 7 của spec, validate từng trường (ngoài khoảng →
mặc định + log), gộp danh sách widget (bỏ widget không còn, thêm widget mới ở cuối). Lệnh Tauri `get_settings`/`update_settings`,
phát sự kiện `settings-changed`. Notch nghe sự kiện và áp dụng ngay: kích thước, `topGap`, mode, widget ưu tiên, bật/tắt, thứ tự, cỡ chữ.
Đọc cài đặt "Animation effects" của Windows để bật/tắt chuyển động.

**Tiêu chí chấp nhận:**
- [x] Test Rust: file thiếu, file hỏng (+ sao lưu `.bak`), file có BOM, giá trị ngoài khoảng, biên khoảng, thiếu trường, widget trùng/sai id, ghi-đọc lại
- [~] Sửa `settings.json` bằng lệnh `update_settings` thì notch đổi ngay không cần khởi động lại — logic sự kiện có test (hook); chưa gọi lệnh thật trên app (sẽ thấy ở Task 9 khi có cửa sổ Cài đặt)
- [x] Tắt app, mở lại vẫn giữ cài đặt

**Kiểm tra:**
- [x] `cargo test` 13 passed · clippy `-D warnings` sạch · `npm test` 87 passed · `npm run lint` sạch
- [x] Thủ công (2026-09-16): không có file → pill mặc định + app ghi file kèm danh sách widget; sửa file (always, pill lớn, cách mép 24, cỡ chữ 120) → khởi động lại ra 700×76 logic, cách mép 24; file hỏng → mặc định, không crash, có `settings.json.bak`
- [ ] Thủ công (bạn, dev): mở devtools của notch, gọi `__winbar.update({...__winbar.settings, fontScale: 120})`

**Ghi chú / lệch spec:**
- Không dùng plugin `store`: Rust tự đọc/ghi JSON (ghi nguyên tử tmp + rename) để kiểm tra từng trường; ít phụ thuộc hơn.
- Gộp danh sách widget làm ở frontend (`mergeWidgets`), vì chỉ frontend biết widget nào đã đăng ký; kết quả được ghi lại qua `update_settings`.
- Lỗi tìm được khi chạy thật: file lưu bằng Notepad/PowerShell có BOM bị coi là hỏng → đã sửa; file hỏng từng bị ghi đè mất → giờ sao lưu `.bak` trước.

**Phụ thuộc:** Checkpoint 2
**File dự kiến:** `src-tauri/src/settings.rs`, `src-tauri/src/main.rs`, `src/shell/settings-store.ts`, `src/shell/Notch.tsx`
**Quy mô:** M

### Task 9: Cửa sổ Cài đặt (Pill, Widget, Cỡ chữ)

**Mô tả:** Cửa sổ riêng giống màn "Cài đặt" trong mockup, dựng bằng shadcn/ui (Tailwind v4 + Radix; `ScrollArea`, `Switch`, `Slider`, `ToggleGroup`): xem trước pill thường + pill always; mục Pill (kích thước, pill always,
độ rộng panel, cách mép trên, cách mở, widget ưu tiên); Widget (bật/tắt, lên/xuống theo tab); Cỡ chữ (85–130%); nút "Thoát winbar".
Mở từ nút ⚙ trong panel; mở lần nữa thì đưa cửa sổ đang mở lên trước.

**Tiêu chí chấp nhận:**
- [x] Mọi điều khiển ghi qua `update_settings`, notch đổi ngay
- [x] Xem trước đổi theo khi kéo thanh cỡ chữ và cách mép (bản nháp khi kéo, lưu khi thả)
- [x] Chỉ có một cửa sổ Cài đặt tại một thời điểm

**Kiểm tra:**
- [x] `npm test` 97 passed (SettingsApp 7, moveWidget 3, …) · `cargo test` 13 · clippy sạch · `npm run lint` sạch · `npm run build` ra `index.html` + `settings.html`
- [x] Thủ công (2026-09-17, điều khiển WebView2 qua cổng debug): gọi `open_settings` 2 lần → 1 cửa sổ; bấm "Lớn" trong Cài đặt → notch đổi ngay 400×46 logic không khởi động lại, về "Vừa" → 340×40; "Thoát winbar" → không còn tiến trình
- [x] So với mockup: bố cục, xem trước, các mục Pill/Widget/Cỡ chữ khớp (ảnh chụp trong phiên)

**Ghi chú:**
- shadcn/ui: không dùng `shadcn init` (preset kèm Geist/Lucide); tạo `components.json` tay, `shadcn add` scroll-area, switch, slider, toggle-group, button. `cn` là gói chính thức của shadcn. Tailwind chỉ nạp trong trang Cài đặt.
- Sửa component Slider để nhãn nằm trên núm kéo (role `slider`) — bản gốc để nhãn ở khung ngoài, trình đọc màn hình không đọc được.
- Mở rộng `topGap` từ 0–24 lên **0–48** (Rust, TS, spec) để đặt pill dưới thanh yasb như R6 đề xuất.
- Tăng `testTimeout` của Vitest lên 15s: test đầu tiên của file nạp Radix mất ~8s trên máy này.

**Phụ thuộc:** Task 8
**File dự kiến:** `src/settings/SettingsApp.tsx`, `src/settings/sections/*.tsx`, `src/settings/SettingsApp.test.tsx`, `src-tauri/tauri.conf.json`
**Quy mô:** M

## Checkpoint 3
- [ ] Đổi cài đặt là notch đổi; khởi động lại vẫn nhớ; file hỏng không crash
- [ ] Test và lint qua
- [ ] Bạn dùng thử Cài đặt

---

## Giai đoạn 4 — Tích hợp hệ thống

### Task 10: Icon khay và menu

**Mô tả:** Icon khay tạo từ SVG Iconoir (mặc định `sparks` tới khi bạn chọn) thành `.ico` 16–256px, với menu: Mở notch · Command bar (Ctrl+Space) · Ẩn notch tạm thời ·
Cài đặt… · Khởi động cùng Windows ✓ · Thoát winbar. "Command bar" phát sự kiện cho module `command-bar` sau này (hiện chưa có gì).
"Ẩn notch tạm thời" ẩn tới khi bấm lại; alert vẫn xếp hàng. "Thoát winbar" gỡ phím tắt và đóng hẳn app.

**Tiêu chí chấp nhận:**
- [x] Mỗi mục menu chạy đúng; dấu ✓ khớp trạng thái autostart
- [~] Ẩn rồi hiện lại: alert đẩy trong lúc ẩn vẫn hiện — cửa sổ chỉ bị ẩn, frontend và hàng đợi alert vẫn chạy; chưa đẩy alert thật trong lúc ẩn
- [x] Thoát không để lại tiến trình

**Kiểm tra:** (2026-09-17, bấm menu khay thật qua UI Automation + tọa độ, trả chuột về chỗ cũ)
- [x] `cargo test` 16 (tray 3) · clippy sạch · `npm test` 98 · lint sạch
- [x] Icon `sparks` (Iconoir) hiện trong khay; menu đủ 6 mục đúng thứ tự
- [x] Ẩn notch tạm thời → cửa sổ notch ẩn, nhãn có ✓ · Mở notch → hiện lại và mở panel · Cài đặt… → mở cửa sổ Cài đặt
- [x] Khởi động cùng Windows → `launchAtStartup` true→false→true trong file, nhãn đổi theo · Thoát winbar → 0 tiến trình

**Ghi chú:**
- Icon app/khay tạo bằng `tauri icon` từ `design/icons/app-icon.svg` (sparks trên nền kính tối); bỏ icon Android/iOS.
- Trạng thái bật/tắt hiện bằng "✓" ở cuối nhãn, không dùng check item của muda: check item tạo sẵn trạng thái bật không được vẽ trong popup khay (muda vẫn báo `is_checked = true`).
- Không gắn phím tắt vào mục menu (chuỗi phím người dùng sửa được, chuỗi sai sẽ làm tạo menu lỗi); hiện "(Ctrl+Space)" trong nhãn.
- Chuột trái vào icon khay = Mở notch; chuột phải = menu.
- Phím tắt chưa được gỡ khi Thoát vì chưa đăng ký (Task 11). Autostart thật (đăng ký với Windows) ở Task 12; hiện mới lưu cờ.

**Phụ thuộc:** Checkpoint 3
**File dự kiến:** `src-tauri/src/tray.rs`, `src-tauri/src/main.rs`, `src-tauri/icons/*`
**Quy mô:** S

### Task 11: Phím tắt toàn cục + phát hiện trùng

**Mô tả:** Cơ chế đăng ký phím tắt ở Rust; đăng ký `Ctrl+Space` giữ chỗ cho `command-bar` (phát sự kiện). Nếu đăng ký thất bại
vì app khác giữ: ghi trạng thái lỗi, Cài đặt hiện "phím tắt đang bị dùng" kèm gợi ý tắt bên yasb.

**Tiêu chí chấp nhận:**
- [x] Nhấn phím tắt phát sự kiện `command-bar-toggle` (log "winbar hotkey: command bar")
- [x] Khi phím bị giữ, Cài đặt báo rõ, app không crash
- [x] Thoát app thì phím được trả lại

**Kiểm tra:** (2026-09-17)
- [x] `cargo test` 20 (hotkeys 4: parse hợp lệ/không hợp lệ, phân loại lỗi, JSON trạng thái) · clippy sạch · `npm test` 101 (HotkeySection 3) · lint sạch
- [x] Thủ công — xung đột thật: trên máy này **Ctrl+Space đã bị một app khác giữ** (Windows lỗi 1409, kể cả khi winbar tắt; yasb không chạy; nghi UniKey/Orca/Claude). winbar báo `in-use`, không crash
- [x] Thủ công — đăng ký thành công (dùng phím trống Ctrl+Alt+F9 qua `update_settings`): trạng thái `registered`, nhấn phím → log sự kiện, Cài đặt hiện "Đang hoạt động"; `quit_app` → 0 tiến trình, phím trống lại
- [x] Đổi phím trong cài đặt → gỡ phím cũ, đăng ký phím mới ngay

**Ghi chú:**
- App giữ Ctrl+Space trên máy là **YASB** (bạn xác nhận); giữ Ctrl+Space làm mặc định vì winbar sẽ thay YASB.
- *(Bổ sung theo yêu cầu, 2026-09-17)* Cài đặt › Phím tắt có **Đổi phím** (ghi tổ hợp tiếp theo, Esc hủy, cần ít nhất một phím bổ trợ trừ F1–F24) và **Mặc định**. Thử thật: đổi sang Alt+Space → lưu + "Đang hoạt động"; Mặc định → Ctrl+Space + báo đang bị dùng. Test: bộ ghi phím 4, HotkeySection 6; Rust parse được mọi dạng bộ ghi tạo ra.
- Giới hạn: khi đang ghi, tổ hợp mà app khác (hoặc chính winbar) đã đăng ký toàn cục sẽ bị Windows chặn trước nên không ghi được.

**Phụ thuộc:** Task 10
**File dự kiến:** `src-tauri/src/hotkeys.rs`, `src-tauri/src/main.rs`, `src/settings/sections/Hotkeys.tsx`
**Quy mô:** S

### Task 12: Chạy một bản + khởi động cùng Windows

**Mô tả:** Plugin `single-instance`: mở app lần 2 thì bản đang chạy hiện notch (và mở Cài đặt nếu đang ẩn). Plugin `autostart`
nối với `launchAtStartup` trong cài đặt, menu khay và Cài đặt.

**Tiêu chí chấp nhận:**
- [x] Chạy file exe hai lần chỉ còn một tiến trình
- [~] Bật autostart, đăng xuất/đăng nhập lại thì app tự chạy; tắt thì không — đã kiểm tra mục registry `Run` được thêm/xóa đúng; chưa đăng xuất thật (sẽ đăng xuất phiên của bạn)

**Kiểm tra:** (2026-09-17, bản `tauri build --no-bundle`)
- [x] `cargo test` 22 (startup 2) · clippy sạch · `npm test` 109 · lint sạch
- [x] Lần mở đầu (cờ mặc định bật) → thêm `HKCU\...\Run\winbar` = `target\release\winbar.exe`
- [x] Lần mở thứ hai → thoát mã 0, vẫn 1 tiến trình, bản đang chạy mở cửa sổ Cài đặt (và hiện lại notch nếu đang ẩn)
- [x] `launchAtStartup` false → xóa mục `Run`; true → thêm lại; false → xóa · Thoát → 0 tiến trình
- [x] Sau kiểm tra: danh sách `Run` giống hệt lúc đầu, đã xóa file cài đặt thử

**Ghi chú:**
- Chỉ bản release đăng ký autostart; bản dev chỉ ghi log để `target\debug\winbar.exe` không bị thêm vào danh sách tự chạy.
- Cài đặt có thêm mục **Chung** › Khởi động cùng Windows (cùng cờ với menu khay).
- Mục `Run` trỏ vào đường dẫn exe đang chạy; khi đóng gói bản cài đặt thật (sau v1) mục này sẽ trỏ vào thư mục cài.

**Phụ thuộc:** Task 11
**File dự kiến:** `src-tauri/src/main.rs`, `src-tauri/Cargo.toml`, `src-tauri/src/settings.rs`
**Quy mô:** S

### Task 13: Đo hiệu năng, checklist thủ công, soát lại với mockup

**Mô tả:** Viết `tests/manual-shell.md` theo mục 10 của spec và chạy toàn bộ. Đo CPU/RAM khi thu gọn đứng yên 1 phút trên bản build.
Soát từng trạng thái với mockup, sửa chỗ lệch hoặc ghi lý do.

**Tiêu chí chấp nhận:**
- [x] CPU trung bình < 1%, RAM < 150 MB — release, 203s: CPU 0.007%, Task Manager 78 MB, private bytes 137 MB (ghi trong checklist)
- [x] Mọi mục checklist thủ công qua hoặc có ghi chú (6 mục ⚠️, 6 mục 👤 bạn tự kiểm)
- [x] Đạt 11 tiêu chí ở mục 11 của spec — trừ phần chỉ bạn làm được: DPI 100/150% thật, đăng nhập lại để thấy autostart, tắt Animation effects thật

**Kiểm tra:** (2026-09-17)
- [x] `npm test` 109 · `cargo test` 22 · clippy sạch · `npm run lint` sạch · `npm run tauri build -- --no-bundle` ra `winbar.exe`
- [x] Checklist thủ công đã điền: `tests/manual-shell.md`
- [x] Thủ công bằng chuột/phím thật: hover 150ms đóng / 500ms mở, không lấy focus; click mode mở, Esc đóng, click ra ngoài đóng;
  always 620×64, click mở 8/8; alert 490×44, hover không mở, bấm "Cho phép" thật → callback `allow`, pill trở lại;
  reduced-motion (giả lập) thu cửa sổ sau ~150ms thay vì ~600ms
- [x] So mockup: kích thước/bo góc/bố cục khớp; lệch có lý do: không blur (css-dense), nút alert demo chưa có kiểu (thuộc `claude-approvals`), đè thanh YASB (R6)

**Phụ thuộc:** Task 12
**File dự kiến:** `tests/manual-shell.md`, các file sửa lỗi nhỏ
**Quy mô:** S–M

## Checkpoint cuối
- [x] Đạt 11 tiêu chí của spec (còn 3 việc bạn tự kiểm, xem `tests/manual-shell.md` mục 👤)
- [x] Test, lint, build qua
- [x] Bạn duyệt để chuyển sang module `command-bar` (2026-09-17)
