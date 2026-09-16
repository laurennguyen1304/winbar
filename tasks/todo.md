# Tasks: notch-shell

> Plan: `tasks/plan.md` · Spec: `SPEC-notch-shell.md` · Mockup: `design/winbar-mockup.html`
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
- [ ] Thuật toán bố cục có test (có/không có `tall`, thứ tự, widget tắt)
- [ ] Widget lỗi hiện card "Widget lỗi", các widget khác vẫn chạy
- [ ] Panel mở ra hiện card demo đúng tab, đúng bố cục

**Kiểm tra:**
- [ ] `npm test` qua (bố cục + error boundary)
- [ ] Thủ công: mở panel, chuyển tab

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
- [ ] Test hàng đợi: ưu tiên, thay thế cùng id, gỡ, gỡ theo widget
- [ ] Hover lên pill alert không mở panel; bấm nút gọi đúng callback rồi pill trở lại
- [ ] Bấm vùng chữ mở panel ở đúng tab
- [ ] `flashPill` hiện nội dung tạm 1.2s rồi trở lại; alert đang hiện thì không bị flash đè

**Kiểm tra:**
- [ ] `npm test` qua
- [ ] Thủ công: đẩy 2 alert khác ưu tiên từ widget demo

**Phụ thuộc:** Task 5
**File dự kiến:** `src/shell/alert-queue.ts`, `src/shell/alert-queue.test.ts`, `src/shell/Pill.tsx`, `src/shell/notch-machine.ts`, `src/widgets/demo/*`
**Quy mô:** M

### Task 7: Mode always (pill lớn hai widget)

**Mô tả:** Mode `always`: pill 620×64 hiện `MidPill` của widget ưu tiên rồi widget kế tiếp có `MidPill`, ngăn bằng vạch dọc;
có alert thì hiện alert ở cỡ pill lớn. Bấm để mở panel, ⌃ để về pill lớn.

**Tiêu chí chấp nhận:**
- [ ] Máy trạng thái có test cho `always` ↔ `expanded` và `always` + alert
- [ ] Hiện đúng hai widget theo thứ tự ưu tiên; chỉ một widget có `MidPill` thì chiếm cả pill

**Kiểm tra:**
- [ ] `npm test` qua
- [ ] Thủ công: so với mockup `?mode=always` và `?mode=always&phase=permission`

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
- [ ] Test Rust: file thiếu, file hỏng, giá trị ngoài khoảng, widget thừa/thiếu
- [ ] Sửa `settings.json` bằng lệnh `update_settings` thì notch đổi ngay không cần khởi động lại
- [ ] Tắt app, mở lại vẫn giữ cài đặt

**Kiểm tra:**
- [ ] `cargo test` qua
- [ ] Thủ công: gọi `update_settings` từ devtools, xem notch đổi

**Phụ thuộc:** Checkpoint 2
**File dự kiến:** `src-tauri/src/settings.rs`, `src-tauri/src/main.rs`, `src/shell/settings-store.ts`, `src/shell/Notch.tsx`
**Quy mô:** M

### Task 9: Cửa sổ Cài đặt (Pill, Widget, Cỡ chữ)

**Mô tả:** Cửa sổ riêng giống màn "Cài đặt" trong mockup, dựng bằng shadcn/ui (Tailwind v4 + Radix; `ScrollArea`, `Switch`, `Slider`, `ToggleGroup`): xem trước pill thường + pill always; mục Pill (kích thước, pill always,
độ rộng panel, cách mép trên, cách mở, widget ưu tiên); Widget (bật/tắt, lên/xuống theo tab); Cỡ chữ (85–130%); nút "Thoát winbar".
Mở từ nút ⚙ trong panel; mở lần nữa thì đưa cửa sổ đang mở lên trước.

**Tiêu chí chấp nhận:**
- [ ] Mọi điều khiển ghi qua `update_settings`, notch đổi ngay
- [ ] Xem trước đổi theo khi kéo thanh cỡ chữ và cách mép
- [ ] Chỉ có một cửa sổ Cài đặt tại một thời điểm

**Kiểm tra:**
- [ ] `npm test` qua (component: bật/tắt, đổi thứ tự gửi đúng dữ liệu)
- [ ] Thủ công: so với mockup `?view=settings`

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
- [ ] Mỗi mục menu chạy đúng; dấu ✓ khớp trạng thái autostart
- [ ] Ẩn rồi hiện lại: alert đẩy trong lúc ẩn vẫn hiện
- [ ] Thoát không để lại tiến trình

**Kiểm tra:**
- [ ] Thủ công: bấm từng mục; kiểm tra Task Manager sau khi thoát

**Phụ thuộc:** Checkpoint 3
**File dự kiến:** `src-tauri/src/tray.rs`, `src-tauri/src/main.rs`, `src-tauri/icons/*`
**Quy mô:** S

### Task 11: Phím tắt toàn cục + phát hiện trùng

**Mô tả:** Cơ chế đăng ký phím tắt ở Rust; đăng ký `Ctrl+Space` giữ chỗ cho `command-bar` (phát sự kiện). Nếu đăng ký thất bại
vì app khác giữ: ghi trạng thái lỗi, Cài đặt hiện "phím tắt đang bị dùng" kèm gợi ý tắt bên yasb.

**Tiêu chí chấp nhận:**
- [ ] Nhấn `Ctrl+Space` phát sự kiện (ghi log trong dev)
- [ ] Khi phím bị giữ (thử bằng yasb đang chạy), Cài đặt báo rõ, app không crash
- [ ] Thoát app thì phím được trả lại

**Kiểm tra:**
- [ ] `cargo test` cho phần parse/validate phím tắt
- [ ] Thủ công: có và không có yasb chạy song song

**Phụ thuộc:** Task 10
**File dự kiến:** `src-tauri/src/hotkeys.rs`, `src-tauri/src/main.rs`, `src/settings/sections/Hotkeys.tsx`
**Quy mô:** S

### Task 12: Chạy một bản + khởi động cùng Windows

**Mô tả:** Plugin `single-instance`: mở app lần 2 thì bản đang chạy hiện notch (và mở Cài đặt nếu đang ẩn). Plugin `autostart`
nối với `launchAtStartup` trong cài đặt, menu khay và Cài đặt.

**Tiêu chí chấp nhận:**
- [ ] Chạy file exe hai lần chỉ còn một tiến trình
- [ ] Bật autostart, đăng xuất/đăng nhập lại thì app tự chạy; tắt thì không

**Kiểm tra:**
- [ ] Thủ công trên bản `npm run tauri build`

**Phụ thuộc:** Task 11
**File dự kiến:** `src-tauri/src/main.rs`, `src-tauri/Cargo.toml`, `src-tauri/src/settings.rs`
**Quy mô:** S

### Task 13: Đo hiệu năng, checklist thủ công, soát lại với mockup

**Mô tả:** Viết `tests/manual-shell.md` theo mục 10 của spec và chạy toàn bộ. Đo CPU/RAM khi thu gọn đứng yên 1 phút trên bản build.
Soát từng trạng thái với mockup, sửa chỗ lệch hoặc ghi lý do.

**Tiêu chí chấp nhận:**
- [ ] CPU trung bình < 1%, RAM < 150 MB (ghi số đo vào checklist)
- [ ] Mọi mục checklist thủ công qua hoặc có ghi chú
- [ ] Đạt đủ 11 tiêu chí ở mục 11 của spec

**Kiểm tra:**
- [ ] `npm test`, `cargo test`, `npm run lint`, `npm run tauri build` qua
- [ ] Checklist thủ công đã điền

**Phụ thuộc:** Task 12
**File dự kiến:** `tests/manual-shell.md`, các file sửa lỗi nhỏ
**Quy mô:** S–M

## Checkpoint cuối
- [ ] Đạt 11 tiêu chí của spec
- [ ] Test, lint, build qua
- [ ] Bạn duyệt để chuyển sang module `command-bar`
