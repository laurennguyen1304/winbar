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
