# Checklist thủ công: notch-shell

> Spec: `SPEC-notch-shell.md` §10, §11 · Chạy lần đầu: 2026-09-17 (Task 13)
> Máy: Windows 11 Pro ARM64 (26200), 12 nhân, màn chính 1920×1200 ở 125%, WebView2 153
>
> Ký hiệu: ✅ qua · 👤 bạn cần tự kiểm · ⚠️ qua nhưng có ghi chú

## Cách chạy

| Việc | Lệnh |
|---|---|
| Tự động | `npm test` · `cargo test --manifest-path src-tauri/Cargo.toml` · `npm run lint` |
| Bản dev | `npm run tauri dev` |
| Bản release | `npm run tauri build -- --no-bundle` rồi chạy `src-tauri\target\release\winbar.exe` |
| Điều khiển WebView2 khi test | đặt `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9333` trước khi chạy |

Trước khi test: ghi lại `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` và `%APPDATA%\winbar\settings.json`.
Sau khi test: trả về như cũ. Bản release tự thêm mục `Run` khi `launchAtStartup` là `true`.

Kích thước dưới đây là px vật lý ở 125%. Chia 1.25 ra px logic.

## 1. Vị trí và kích thước (tiêu chí 1)

- [x] ✅ Pill ở giữa mép trên màn chính, cách 8px: cửa sổ 425×50 tại (747, 10), tức 340×40 logic.
- [x] ✅ Tính vị trí ở 100%, 125%, 150% và màn có gốc âm: 4 test Rust trong `window.rs`.
- [ ] 👤 Đổi Display › Scale sang 100%, rồi 150%. Pill phải vẫn là 340×40 logic và cách mép 8px.
  Mình không tự đổi cài đặt màn hình của bạn.
- [ ] 👤 Đổi màn hình chính hoặc cắm/rút màn phụ. Pill phải tự về màn chính trong khoảng 2 giây.

## 2. Click xuyên ngoài notch (tiêu chí 2)

Cửa sổ native chỉ to bằng khối notch, nên ngoài khối không có gì của winbar để chặn chuột.

- [x] ✅ Bản release, pill 425×50 tại (747, 10). Chủ cửa sổ dưới từng điểm:

  | Điểm | App |
  |---|---|
  | giữa notch | winbar |
  | cách mép trái 3px | app bên dưới (pythonw, thanh YASB) |
  | cách mép phải 3px | app bên dưới (pythonw) |
  | cách mép dưới 3px | app bên dưới (chrome) |

- [x] ⚠️ Góc bo vẫn là winbar, vì cửa sổ là hình chữ nhật.
  Vùng thừa ở góc chỉ vài px và trong suốt. Chấp nhận cho v1.
- [x] ✅ Panel mở 975×449 cũng chỉ phủ đúng khối panel. Thu gọn xong thì cửa sổ nhỏ lại.

## 3. Mở và đóng (tiêu chí 3)

Kiểm bằng chuột và phím thật trên bản dev. Script tự trả chuột về chỗ cũ.

| Mode | Thao tác | Kết quả |
|---|---|---|
| hover | di chuột vào, 150ms | ✅ vẫn là pill 425×50 |
| hover | di chuột vào, 500ms | ✅ đã mở 975×449 (780×359 logic) |
| hover | rời chuột, 100ms | ✅ cửa sổ vẫn lớn (đợi hiệu ứng thu gọn) |
| hover | rời chuột, 700ms | ✅ về 425×50 |
| hover | app đang active trước và sau khi hover | ✅ không đổi (Orca): hover **không lấy focus** |
| click | hover 700ms | ✅ không mở |
| click | bấm pill | ✅ mở |
| click | Esc | ✅ đóng |
| click | bấm pill, rồi bấm ra ngoài | ✅ mở, rồi đóng |
| always | ở trạng thái nghỉ | ✅ 775×80 = 620×64 logic |
| always | hover 700ms | ✅ không mở |
| always | bấm pill, rồi bấm vào cửa sổ khác | ✅ **8/8** lần mở rồi đóng |
| mọi mode | nút ⌃ trong panel | ✅ test component (`Notch.test.tsx`) |

- [x] ⚠️ Chạy lần đầu có **1 lần** bấm pill không mở, lúc đó bạn đang dùng Chrome.
  Chạy lại 8 lần liền, bấm ra một cửa sổ test riêng, thì cả 8 lần đều mở.
  Nếu bạn gặp lại, ghi lại app đang active lúc đó.

## 4. Alert trên pill (tiêu chí 4)

- [x] ✅ Nút "Đẩy cảnh báo Claude" trong card demo đẩy alert. Pill thành `alert`, cửa sổ 613×55 (490×44 logic = pill +150×+4).
- [x] ✅ Hover 800ms lên pill alert: không mở, vẫn 613×55.
- [x] ✅ Bấm chuột thật vào "Cho phép": callback nhận `demo-approval: allow`. Alert gỡ, pill về 425×50.
- [x] ✅ Ưu tiên và thay thế cùng id, alert khi widget bị tắt, flash không đè alert: đều có test (`alert-queue.test.ts`, `shell.test.ts`, `Notch.test.tsx`).
- [ ] 👤 Chưa kiểm: đẩy alert trong lúc notch đang ẩn từ khay.
  Hiện tại notch ẩn thì alert **không** tự hiện lại. Module `claude-approvals` cần quyết lại việc này.

## 5. Cài đặt (tiêu chí 5, 6)

Đã kiểm trực tiếp ở Task 8 và Task 9.

- [x] ✅ Đổi cỡ pill trong Cài đặt: notch đổi ngay (Lớn → 400×46 logic, Vừa → 340×40), không cần khởi động lại.
- [x] ✅ Tắt app rồi mở lại: vẫn giữ cài đặt (always, pill lớn, cách mép 24, cỡ chữ 120 → 700×76 logic, cách mép 24).
- [x] ✅ File hỏng: app dùng mặc định, không crash, và sao lưu file thành `settings.json.bak`. File có BOM (Notepad, PowerShell) vẫn đọc được.
- [x] ✅ Chỉ mở một cửa sổ Cài đặt tại một thời điểm.
- [x] ✅ Bật/tắt và đổi thứ tự widget: panel theo đúng quy tắc bố cục (test `layout`, `moveWidget`, `SettingsApp`).

## 6. Khay, single-instance, autostart (tiêu chí 7)

Đã kiểm trực tiếp ở Task 10 và Task 12.

- [x] ✅ Menu khay đủ 6 mục, đúng thứ tự. Từng mục chạy đúng.
  Dấu ✓ đi theo trạng thái ẩn notch và trạng thái autostart.
- [x] ✅ "Thoát winbar": không còn tiến trình nào, phím tắt được trả lại.
- [x] ✅ Chạy exe lần hai: tiến trình mới thoát với mã 0. Bản đang chạy mở Cài đặt, và hiện lại notch nếu đang ẩn.
- [x] ✅ `launchAtStartup` true/false thêm/xóa `HKCU\...\Run\winbar`. Chỉ bản release làm việc này.
- [ ] 👤 Bật "Khởi động cùng Windows" trên bản release, đăng xuất rồi đăng nhập lại. winbar phải tự chạy.
  Mục `Run` đang trỏ vào `src-tauri\target\release\winbar.exe` cho tới khi có bản cài đặt.

## 7. Phím tắt (tiêu chí 8)

- [x] ✅ Ctrl+Space đang bị app khác giữ (YASB). winbar báo `in-use`, và Cài đặt hiện "Phím tắt đang bị app khác dùng (ví dụ YASB Quick Launch)…".
- [x] ✅ Đổi sang phím trống (Ctrl+Alt+F9, Alt+Space): đăng ký được, nhấn phím thì phát sự kiện `command-bar-toggle`.
- [ ] 👤 Tắt YASB rồi bấm "Thử lại" trong Cài đặt. Ctrl+Space phải chuyển sang "Đang hoạt động".

## 8. Hiệu năng (tiêu chí 9)

Bản release, pill thu gọn, không động vào, 7 tiến trình (winbar + WebView2).

| Lần đo | Thời gian | CPU trung bình (12 nhân) | RAM "Memory" trong Task Manager (private working set) | Private bytes (commit) |
|---|---|---|---|---|
| 1 | 60s, từ giây 12 | 0.13% | — | 140 → 148 MB |
| 2 | 203s, từ giây 15 | **0.007%** | **82 → 78 MB** | 141 → 137 MB |

- [x] ✅ CPU < 1%. RAM theo Task Manager 78 MB < 150 MB.
- [x] ⚠️ Private bytes (commit) cũng dưới 150 MB, nhưng chỉ còn dư ~10 MB. Không tăng dần: lần 2 giảm nhẹ trong 3 phút.
  Các module có ảnh (media, clipboard) cần đo lại.
- Lần 1 có thêm việc dò click xuyên và chạy PowerShell, nên CPU cao hơn.

## 9. Chuyển động (tiêu chí 10)

- [x] ✅ Token khớp spec §5.3:
  - M1 resize: `420ms cubic-bezier(0.32, 1.25, 0.5, 1)`.
  - M2 panel fade: `200ms ease-out 100ms`.
  - M4 tab fade: `150ms`.
  - M6 hover: 250ms.
  - M7 flash: 1.2s.
- [x] ✅ Thu gọn bình thường: cửa sổ đợi hiệu ứng, nhỏ lại sau khoảng 600ms (420ms + IPC).
- [x] ✅ Giả lập `prefers-reduced-motion: reduce` qua DevTools:
  - `--motion-resize` thành `0ms`.
  - Cửa sổ nhỏ lại sau khoảng 150ms, không đợi 420ms.
- [ ] 👤 Tắt thật Settings › Accessibility › Visual effects › Animation effects, rồi hover mở/đóng.
  Notch phải đổi ngay, không có hiệu ứng co giãn.

## 10. So với mockup (tiêu chí 10)

So ảnh chụp thật (hover mở, always, alert) với `design/winbar-mockup.html`.

- [x] ✅ Kích thước khớp: pill 340×40, always 620×64, panel rộng 780, alert +150×+4.
  Bo góc, tab Core/Claude, card, nhãn card, nút cài đặt và nút ⌃ cũng khớp.
- [x] ✅ Always: hai khối widget có vạch ngăn, GIF Claude chạy.
- [x] ⚠️ Nền panel không có blur, khác mockup. Đây là quyết định `css-dense` ở spike Task 2: Windows không cho acrylic khi cửa sổ không focus.
  Nền đục 90%, nên trên nền rối vẫn thấy mờ mờ phía sau.
- [x] ⚠️ Nút "Từ chối / Cho phép" của alert demo đang là nút mặc định của trình duyệt. Mockup có nút pill tối/trắng và icon khiên.
  Đây là widget demo chỉ có ở bản dev. Kiểu nút thật sẽ làm trong `claude-approvals`.
- [x] ⚠️ Khi YASB đang chạy, pill cách mép 8px đè lên thanh YASB (R6). Tăng "Cách mép trên" lên ~40, hoặc tắt YASB.

## 11. Tự động (tiêu chí 11)

- [x] ✅ `npm test`: 14 file, 109 test qua.
- [x] ✅ `cargo test`: 22 test qua. `cargo clippy -- -D warnings`: sạch.
- [x] ✅ `npm run lint`: sạch.
- [x] ✅ `npm run tauri build -- --no-bundle`: build ra `target\release\winbar.exe` (4.4 MB).

## Dọn dẹp sau lần chạy 2026-09-17

- [x] Đã xóa `%APPDATA%\winbar\settings.json` dùng để test.
- [x] Không còn mục `Run\winbar`.
- [x] Không còn tiến trình winbar hay Vite.

---

# v2: giọt nước, liquid glass, kéo ngang, sticky

> Spec: `SPEC-notch-shell.md` §15 · Plan: `tasks/plan.md` · Chạy: 2026-09-17 (Task 4)
> Cùng máy như trên. YASB đang chạy và giữ 47px phía trên màn hình.

## V1. Dạng giọt nước (mặc định)

- [x] ✅ Cửa sổ dính mép trên, rộng thêm 2×14px cho phần loe: pill 460×50 tại y=0 (368×40 logic).
- [x] ✅ Viền là một nét liền. Phóng to ảnh chụp chỗ phần loe nối vào thân: không có vệt thẳng.
- [x] ✅ Đúng hình ở cả bốn trạng thái: pill, always, cảnh báo (490×44 + loe), panel mở rộng.
- [x] ✅ `float` + `dense`: cách mép 8px, bo tròn đều, nền đặc như v1.
- [x] ✅ Đổi Kiểu notch / Nền notch trong Cài đặt: notch đổi ngay.
- [x] ⚠️ Hai góc loe vẫn thuộc cửa sổ (hình chữ nhật), nên vài px trong suốt ở đó không click xuyên được. Đã ghi trong spec §15.

## V2. Nền liquid glass (mặc định)

- [x] ✅ Pill: thân trong (74–80%), vệt sáng phía trên, viền sáng hai đầu, mép trong mờ, giống mockup.
- [x] ⚠️ Panel mở dùng nền dày hơn mockup (88–90%). Ở độ trong của mockup, chữ của cửa sổ phía sau lộ ra, khó đọc.
- [ ] 👤 Chưa chụp trên nền sáng: dưới notch lúc test là YASB và terminal tối. Mở một trang trắng phóng to, xem pill và panel có dễ đọc không. Nếu khó đọc, chọn Nền notch › Đặc.

## V3. Kéo ngang

Kiểm trên app dev bằng sự kiện con trỏ giả lập trong webview (không dùng chuột thật).

- [x] ✅ Kéo sang trái 300px logic: cửa sổ dời từ x=730 sang x=355, tức 375px vật lý ở 125%. Lưu `pill.offsetX = −300`.
- [x] ✅ Kéo quá mép trái: dừng ở x=0, lưu −584.
- [x] ✅ Không hít vào giữa; cú bấm cuối lúc thả không mở panel.
- [x] ✅ Bấm (di < 6px) vẫn mở; nhấn giữ hủy hẹn giờ hover (test `Notch.test.tsx`, `notch-machine.test.ts`).
- [x] ✅ Tải lại notch khi đang lệch −300: cửa sổ hiện thẳng ở x=355, không nhảy từ giữa.
- [x] ✅ Nút "Về giữa" trong Cài đặt đưa về 0 (test `SettingsApp.test.tsx`, và trên app).
- [x] ✅ Kẹp mép màn hình ở 100/125/150% và màn có gốc âm: test Rust `window.rs`.
- [ ] 👤 Kéo bằng chuột thật xem có mượt không, nhất là kéo nhanh.

## V4. Sticky (mặc định tắt)

Đo mép trên vùng làm việc (`SPI_GETWORKAREA`, px vật lý). Trước khi bật: 47 (YASB).

| Bước | Mép trên | Kết quả |
|---|---|---|
| Bật, pill 40 logic | 97 | ✅ +50 = 40 × 1.25 |
| Chế độ always, 64 logic | 127 | ✅ +80 |
| Tắt | 47 | ✅ trả lại |
| Bản release, bật rồi "Thoát winbar" | 47 | ✅ trả lại ngay |
| Mở lại khi sticky đang lưu là bật | 97 | ✅ tự giữ chỗ lại |
| Tắt ngang tiến trình (`Stop-Process -Force`) | 47 | ✅ Windows tự gỡ ngay |

**Sửa sau phản hồi của bạn (2026-09-17):** lần đo trên chỉ xem vùng làm việc, bỏ sót vị trí notch. Bật sticky thì Windows dời cửa sổ notch xuống **dưới** dải giữ chỗ, sau ABM_SETPOS một lúc. Giờ notch được ghim bằng `WM_WINDOWPOSCHANGING` và nằm ở đỉnh dải.

Đo lại trên app dev (YASB không chạy, dải bắt đầu từ 0):

| Bước | Vùng làm việc | Notch |
|---|---|---|
| Bật, pill | mép trên 50 | ✅ y=0 suốt 3 giây (trước khi sửa: y=50) |
| Mở panel rồi thu gọn | 50 | ✅ y=0 |
| Chế độ always | 80 | ✅ y=0 (trước khi sửa: y=80) |
| Kéo +160 khi đang sticky, rồi tải lại | 50 | ✅ x dời 200px vật lý, y=0 |
| Tắt | 0 | ✅ y=0 |

- [x] ✅ Test Rust: chiều cao dải theo DPI và gốc màn hình (`sticky.rs`). Test TS: theo layout, always, khoảng cách mép (`notch-shape.test.ts`, `Notch.test.tsx`).
- [x] ⚠️ Có YASB: Windows xếp dải của winbar **dưới** YASB (47→97). Notch nằm trong dải đó, tức ngay dưới YASB (test Rust `sits_in_the_sticky_strip_when_one_is_reserved`). Chưa đo lại trên máy khi YASB chạy.
- [x] 👤 Bật Sticky, mở trình duyệt phóng to: trang bắt đầu dưới dải, notch nằm trong dải. Bạn xác nhận 2026-09-17 sau bản sửa.

## V5. Chiều cao pill

- [x] ✅ Bạn chốt Nhỏ 32 / Vừa 36 / Lớn 40 (rộng giữ nguyên). Trên máy: Nhỏ 410×40 vật lý = 328×32 logic (gồm loe), Lớn 535×50 = 428×40.

## Hiệu năng v2

Bản release, không bật cổng debug. Đo từ giây 60 sau khi mở, pill thu gọn, command bar đóng, 8 tiến trình.

| Thời điểm | Task Manager ("Memory") | Private bytes |
|---|---|---|
| +35s | 109.5 MB | 182.6 MB |
| +98s | 109.2 MB | 182.2 MB |
| +193s | 109.1 MB | 182.1 MB |

- [x] ✅ CPU trung bình **0.003%** trên 12 nhân trong 193s: nền liquid là CSS tĩnh, không tốn khi đứng yên.
- [x] ✅ RAM theo Task Manager **109 MB** < 150 MB, không tăng dần. Bằng lần đo sau command-bar (109–116 MB): v2 không làm tăng RAM.

## Tự động v2

- [x] ✅ `npm test`: 31 file, 307 test.
- [x] ✅ `cargo test`: 80 test. `cargo clippy -D warnings`: sạch.
- [x] ✅ `npm run lint`: sạch.
- [x] ✅ `npm run tauri build -- --no-bundle`: `winbar.exe` 4.5 MB.

## Dọn dẹp sau lần chạy v2

- [x] Trả `settings.json` từ bản sao lưu (bản release đã bỏ widget demo). Giữ `offsetX −233` bạn tự kéo.
- [x] Gỡ `Run\winbar` do bản release thêm vào.
- [x] Sticky tắt, vùng làm việc về 47.
- [x] Tắt bản release, mở lại app dev.

---

# v3: notch trên nhiều màn hình

> Spec: `SPEC-notch-shell.md` §16 · Chạy: 2026-09-18
> Máy lúc test: màn chính 1920×1200 ở 125%, màn 2 1920×1080 ở 100% (đặt bên phải).

## 1. Cài đặt `pill.monitor`

- [x] ✅ `primary`: một notch, ở màn chính (410×40 px vật lý tại 769,0).
- [x] ✅ `all`: hai notch cùng lúc — màn chính 410×40 tại 769,0, màn 2 **328×32** tại 2727,0 (màn 2 ở 100% nên số px vật lý nhỏ hơn, kích thước logic vẫn 328×32).
- [x] ✅ Đổi qua lại trong Cài đặt: cửa sổ được mở thêm / đóng bớt ngay, app vẫn phản hồi.
- [x] ✅ Hai trang notch chạy độc lập (`notch` và `notch-1`), cùng nội dung.

## 2. Sticky theo từng màn

- [x] ✅ Sticky bật, chế độ `all`: mép trên vùng làm việc màn chính = 40 (32 logic × 1.25), màn 2 = 32 (32 × 1.0).
- [ ] 👤 Tắt sticky khi đang ở `all`: cả hai màn trả lại chỗ.

## 3. Những lỗi đã gặp và cách sửa (ghi để khỏi lặp lại)

| Hiện tượng | Nguyên nhân | Cách sửa |
|---|---|---|
| Cửa sổ notch thứ hai không gọi được lệnh | `capabilities/default.json` chỉ cho phép ba tên cửa sổ cố định | Thêm `notch-*` vào danh sách |
| Notch màn 2 bị co còn 262×26 | Windows tự co cửa sổ khi nó sang màn có DPI khác | Đặt vị trí trước rồi đặt kích thước, và đặt lại khi có sự kiện đổi DPI |
| App treo khi bật/tắt "Cả 2 màn" | Mở/đóng cửa sổ chạy trên luồng chính, phải chờ chính vòng lặp sự kiện đang bận | Chuyển việc mở/đóng cửa sổ sang luồng nền (`spawn_blocking`, hoặc luồng theo dõi màn hình) |
| App treo khi đổi DPI | Gọi đặt lại kích thước ngay trong callback sự kiện của cửa sổ | Xếp hàng chạy sau qua `run_on_main_thread` |

## 4. Hiệu năng (bản release, 2026-09-18)

| Chế độ | CPU | RAM | Tiến trình |
|---|---|---|---|
| `primary` | 0.000–0.017% | 122–126 MB | 8 |
| `all` (2 màn) | 0.006–0.014% | 146–149 MB | 9 |

- [x] ✅ Thêm màn thứ hai tốn thêm **~25 MB** (một tiến trình WebView nữa); CPU gần như không đổi.
- [x] ⚠️ Ở `all`, RAM 146–149 MB sát ngưỡng 150 MB của spec. Trước khi làm thêm module nặng, nên đo lại ở chế độ này.

## 5. Chưa kiểm

- [ ] 👤 Rút màn 2 khi đang ở `all`: notch của màn đó biến mất trong ~2 giây; cắm lại thì hiện lại.
- [ ] 👤 Mở panel ở màn 2 trong lúc dùng thật, xem có vướng gì không.
