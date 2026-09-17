# Tasks: command-bar

> Plan: `tasks/plan.md` · Spec: `SPEC-command-bar.md` · Mockup: phần Command bar trong `design/winbar-mockup.html`
> Lệnh chung: `npm test` · `cargo test --manifest-path src-tauri/Cargo.toml` · `npm run lint` · `npm run tauri dev`
> Máy này: YASB giữ `Ctrl+Space`, nên khi dev dùng phím khác (vd. `Alt+Space`).

---

## Giai đoạn 0 — Spike

### Task 1: Spike cửa sổ thứ hai: focus, thời gian mở, RAM, Everything ARM64, COM

**Mô tả:** Thử nhanh các giả định rủi ro trước khi làm thật. Code spike để trong nhánh/thư mục tạm, xóa sau khi ghi kết quả.
1. Tạo một cửa sổ thứ hai ẩn sẵn (trong suốt, không viền, luôn nằm trên, có ô nhập). Phím tắt gọi `show` + `set_focus`.
   Nhấn phím tắt khi đang ở Chrome, Windows Terminal, Explorer, và app chạy quyền admin. Ghi lại: gõ có vào ô nhập không, và thời gian từ lúc nhấn tới lúc hiện.
2. Đo RAM bản release: notch + cửa sổ thứ hai ẩn, đứng yên 1 phút (Task Manager + private bytes).
3. Everything SDK: kiểm tra giấy phép kèm DLL, có bản ARM64 không, gọi được từ Rust không. Máy chưa có Everything, nên **hỏi bạn trước khi cài** bản portable để thử.
4. Crate `windows` trên ARM64:
   - liệt kê `FOLDERID_AppsFolder` (số app, có tên và id),
   - lấy 1 icon ra PNG,
   - chạy 1 truy vấn Windows Search qua OLE DB, đo thời gian.

**Tiêu chí chấp nhận:**
- [x] `docs/spikes/command-bar.md` có:
  - bảng focus theo 4 app,
  - thời gian mở (28–62ms),
  - RAM trước/sau (+17 đến +22 MB, cả app 103–108 MB),
  - kết luận về Everything (MIT, có ARM64),
  - 3 phép thử COM.
- [x] Mỗi rủi ro R1–R4 có kết luận: cả 4 đều đạt, không cần đổi spec.

**Kiểm tra:** (2026-09-17)
- [x] Thủ công: số đo lấy trên bản release; không đổi cài đặt máy; đã xóa file cài đặt thử và log; Run key không có `winbar`; code spike đã gỡ.
- [ ] Chưa thử: app quyền admin ở trước (cần UAC) → checklist Task 13; truy vấn Everything thật (cần cài Everything) → Task 11.

**Phụ thuộc:** notch-shell xong
**File dự kiến:** `docs/spikes/command-bar.md`, code spike tạm trong `src-tauri/src/`
**Quy mô:** M

## Checkpoint 0
- [x] Bạn xem `docs/spikes/command-bar.md`, duyệt cách xử lý R1–R4 (và việc kèm Everything64.dll) — 2026-09-17

---

## Giai đoạn 1 — Khung command bar

### Task 2: Cửa sổ command bar + giao diện tĩnh + mở/Esc/không đóng khi mất focus

**Mô tả:**
- **Cửa sổ và entry:** thêm entry Vite `command-bar.html` + `src/command-bar/`. Rust tạo cửa sổ `command-bar` ẩn lúc khởi động.
- **Giao diện:** theo mockup: tay nắm ⠿, icon tìm kiếm, ô nhập, nút Xóa, vùng kết quả (tạm là trạng thái rỗng), hàng gợi ý phím.
- **Sự kiện mở:** phím tắt và menu khay đều phát `command-bar-toggle`.
  - Đang ẩn thì hiện + focus + bôi đen chữ.
  - Đang mở mà không có focus thì đưa lên trước + focus.
  - Đang mở và có focus thì không làm gì.
- **Đóng và mất focus:**
  - Esc: có chữ thì xóa, ô trống thì ẩn cửa sổ.
  - Mất focus thì không đóng, chỉ đổi sang kiểu "không focus" (viền nhạt).
- **Kích thước:** cửa sổ khớp chiều cao nội dung, giữ cạnh trên.
- **Chuyển động:** M11 fade 150ms, tôn trọng giảm chuyển động.

**Tiêu chí chấp nhận:**
- [x] Mở, đưa lên trước, và Esc 2 bước đúng như bảng 5.2 của spec. Click ra ngoài và chuyển app **không** đóng.
- [x] `isComposing`: Esc bị bỏ qua khi IME đang ghép chữ (Enter/↑↓ chưa có hành động, sẽ dùng cùng chỗ chặn ở Task 4).
- [x] Cửa sổ native bằng đúng khối command bar (825×129 vật lý = 660×103 logic; có chữ 825×198); ngoài khối click xuyên được.
- [x] Notch vẫn chạy như cũ. Quit tắt cả hai cửa sổ (cùng tiến trình).

**Kiểm tra:** (2026-09-17)
- [x] Test component 7: mở thì focus + bôi đen, Esc 2 bước + fade, `isComposing`/keyCode 229, mất focus không đóng + mờ viền, lấy lại focus thì con trỏ về ô nhập và Esc chạy từ bất kỳ đâu, mở lại lúc đang fade thì hủy ẩn, nút Xóa. Rust 2: hành động của phím tắt, chiều cao hợp lệ.
- [x] `npm test` 116 · `cargo test` 24 · clippy sạch · `npm run lint` sạch.
- [x] Thủ công (bản dev, phím thử `Ctrl+Alt+F9`):
  - phím tắt từ Notepad và từ cửa sổ test → hiện, có focus, gõ vào ô nhập;
  - nhấn lại khi đang focus → vẫn mở;
  - app khác lên trước → nhấn phím tắt → đưa lên trước;
  - click cửa sổ khác → không đóng, cửa sổ dưới mép bar nhận click;
  - click vào hàng dưới của bar → focus lại;
  - Esc 1 xóa chữ, Esc 2 ẩn.
- [x] Lỗi tìm thấy khi chạy thật và đã sửa: sau khi cửa sổ lấy lại focus, Esc không tới ô nhập → bắt phím ở cấp cửa sổ + đưa con trỏ về ô nhập. Sự kiện focus của Tauri không báo khi mở bằng phím tắt → dùng focus/blur của trang.
- [ ] Bạn kiểm ở Checkpoint 1: kiểu "mờ viền" khi mất focus (bản sửa cuối chưa chạy lại trực tiếp), gõ tiếng Việt bằng UniKey / bàn phím Telex của Windows.

**Phụ thuộc:** Checkpoint 0
**File dự kiến:** `command-bar.html`, `vite.config.ts`, `src/command-bar/{main.tsx,CommandBar.tsx,CommandBar.module.css}`, `src-tauri/src/command_bar/mod.rs`, `src-tauri/src/lib.rs`, `src-tauri/capabilities/default.json`
**Quy mô:** M

### Task 3: Vị trí mặc định, kéo ⠿, nhớ vị trí

**Mô tả:**
- **Hàm thuần `placement.rs`:** tính vị trí mặc định (màn hình có con trỏ, giữa ngang, cách đỉnh vùng làm việc 25%) và kiểm tra vị trí đã lưu.
- **Kéo:** ⠿ gọi kéo native.
- **Lưu:** khi thả, Rust lưu `commandBar.position` vào `settings.json`.
- **Validate:** thêm `commandBar` vào `settings.rs`, validate từng trường như các trường khác.
- **Tràn đáy:** nếu cửa sổ tràn đáy màn hình thì vùng kết quả thấp lại.

**Tiêu chí chấp nhận:**
- [x] Test Rust:
  - vị trí mặc định ở 100/125/150%,
  - màn hình có gốc âm,
  - vị trí đã lưu nằm ngoài mọi màn hình → mặc định, và không xóa vị trí đã lưu,
  - validate `commandBar` (thiếu, sai kiểu, ngoài khoảng).
- [x] Kéo, đóng, mở lại, khởi động lại app: đúng chỗ.

**Kiểm tra:** (2026-09-17)
- [x] `cargo test` 33 (placement 6, settings +2, lưu vị trí 1) · clippy sạch · `npm test` 119 (command bar +3: kéo rồi lưu khi dừng, bấm tay nắm không kéo / chuột phải không lưu, giới hạn chiều cao) · lint sạch.
- [x] Thủ công (bản dev, 1 màn hình 1920×1200 ở 125%, YASB chiếm 38px trên cùng):
  - chưa có vị trí → mở ở (547, 320), `maxHeight` 640;
  - kéo tay nắm (-300, +150) → (247, 470), file lưu `{x: 247, y: 470}`, `maxHeight` 520;
  - ẩn rồi mở → (247, 470);
  - đặt vị trí (-50000, -50000) → mở ở mặc định (547, 320), vị trí đã lưu vẫn giữ nguyên;
  - khởi động lại app → mở ở (247, 470).
- [ ] Bạn kiểm ở Checkpoint 1 nếu có màn phụ: rút màn phụ đang chứa command bar → mở ở màn có con trỏ.

**Ghi chú:** thêm luôn `commandBar.fileSearch` và `commandBar.webSearch` vào cài đặt (validate + mặc định) để Task 6/10–12 dùng; chưa có giao diện.

**Phụ thuộc:** Task 2
**File dự kiến:** `src-tauri/src/command_bar/placement.rs`, `src-tauri/src/command_bar/mod.rs`, `src-tauri/src/settings.rs`, `src/shell/settings.ts`, `src/command-bar/CommandBar.tsx`
**Quy mô:** M

### Task 4: Hợp đồng provider, bộ gộp kết quả, bàn phím, provider widget demo

**Mô tả:**
- **Hợp đồng:** mở rộng `SearchProvider`/`SearchResult` đúng mục 6 của spec.
- **`use-command-search.ts`:**
  - tách tiền tố (trùng tiền tố thì bỏ ở provider sau, có log),
  - gọi provider với `AbortSignal`, timeout 1.5s, provider lỗi thì bỏ nhóm,
  - gộp nhóm theo thứ tự và giới hạn số dòng ở 5.4.
- **Danh sách kết quả:**
  - tiêu đề nhóm, dòng chọn có động từ + ↵,
  - ↑↓ dừng ở biên, Enter/Ctrl+Enter/bấm/rê chuột,
  - trạng thái "không có kết quả".
- **Provider của widget:**
  - lấy từ registry, lọc theo `settings.widgets`, cập nhật khi `settings-changed`,
  - widget `demo` thêm provider tiền tố `demo`.
- **M12:** đổi nền dòng chọn ngay.

**Tiêu chí chấp nhận:**
- [x] Test thuần: tách tiền tố, trùng tiền tố, thứ tự nhóm, giới hạn dòng, timeout, provider lỗi, hủy lần tìm cũ.
- [x] Test component: ↑↓ biên, Enter chạy đúng dòng, Ctrl+Enter gọi `runAlt`, rê chuột đổi dòng chọn, không có kết quả.
- [x] Tắt widget demo trong Cài đặt thì nhóm `demo` biến mất ngay (tiêu chí 11).

**Kiểm tra:** (2026-09-17)
- [x] `npm test` 139:
  - `search` 12: tiền tố, trùng tiền tố, điểm, giới hạn, provider chỉ có tiền tố, fallback, timeout/lỗi, báo dần, hủy;
  - `sources` 2;
  - command bar +6: nhóm + dòng chọn + động từ, ↑↓ không vòng + Enter + bỏ qua khi IME ghép chữ, Ctrl+Enter, rê chuột/bấm, đổi chữ về dòng đầu, tiền tố + tắt widget.
- [x] `npm run lint` sạch. Rust không đổi.
- [x] Thủ công (bản dev; mở bằng phím tắt toàn cục, còn lại điều khiển qua trang, không gửi phím hệ thống):
  - `demo` → nhóm Demo 3 dòng, dòng đầu được chọn;
  - ↓×3 dừng ở dòng cuối;
  - Enter chạy "three", ↑ rồi Ctrl+Enter chạy "two (Ctrl)";
  - `hai` (không tiền tố) → 1 dòng;
  - `zzz` → "Không tìm thấy kết quả";
  - tắt `demo-card` trong cài đặt → nhóm biến mất, bật lại → quay lại;
  - chiều cao cửa sổ đổi theo (158 → 202 → 303 logic).

**Ghi chú:** Hợp đồng `SearchProvider`/`SearchResult` đã đổi đúng mục 6 của spec. Ô trống chưa hiện gì ("Gần đây" ở Task 9).

**Phụ thuộc:** Task 2
**File dự kiến:** `src/shell/widget-contract.ts`, `src/command-bar/use-command-search.ts` (+ test), `src/command-bar/ResultList.tsx`, `src/command-bar/CommandBar.tsx`, `src/widgets/demo/index.tsx`
**Quy mô:** M

## Checkpoint 1
- [ ] Test, lint, build qua
- [ ] Mở bằng phím tắt, gõ `demo`, chọn, chạy; kéo và nhớ vị trí
- [ ] Bạn thử và duyệt cảm giác mở/đóng trước khi thêm nguồn thật

---

## Giai đoạn 2 — Nguồn không cần native

### Task 5: Máy tính + đổi đơn vị + copy + toast

**Mô tả:**
- **`calculator.ts`:** tự viết bộ tách từ và parser, không `eval`.
  - Phép tính `+ - * / % ^`, ngoặc.
  - Hàm `sqrt sin cos tan log ln abs round`, hằng `pi e`.
  - Làm tròn 10 chữ số.
- **`units.ts`:** 7 nhóm đơn vị ở spec 5.4; từ nối `to|in|sang|->`.
- **Provider:** có tiền tố `=`, và tự nhận biểu thức khi không có tiền tố.
- **Khối kết quả lớn** theo mockup, được chọn sẵn.
- **Enter:** copy số (không có dấu phân cách) bằng `navigator.clipboard`, hiện toast "✓ Đã copy …", không đóng.

**Tiêu chí chấp nhận:**
- [x] Test: ưu tiên toán tử, ngoặc lồng, hàm, chia 0 (không hiện), "code" không phải biểu thức, mọi nhóm đơn vị, sai/khác nhóm đơn vị.
- [x] `12*7+3` → `= 87`, `2^10` → `= 1,024`, `sqrt(144)` → `= 12`, `5 km to mi` → `3.10686 mi`, `30 c to f` → `86 °F`.
- [x] Không có `eval`/`Function` trong code (test đọc mã nguồn `calculator.ts`).

**Kiểm tra:** (2026-09-17)
- [x] `npm test` 217 · lint sạch:
  - `calculator` 43: biểu thức, nhân ngầm `2pi`, -2^2, lỗi, `=`, định dạng, an toàn;
  - `units` 29;
  - `instant` 3;
  - command bar +3: khối chọn sẵn + Enter copy số trơn + toast; đổi đơn vị + nhóm khác bên dưới + ↑↓ + bấm copy; `=` không hỏi provider khác.
- [ ] Thủ công: bạn đang chạy bản dev nên thử trực tiếp (Enter rồi dán vào app khác).

**Ghi chú (lệch spec, lý do):**
- Tốc độ m/s gõ là `m/s` hoặc `mps`, vì `ms` là mili giây. Có thêm `km/h`, `kph`, `°c`, `°f`.
- Khối máy tính/đổi đơn vị không đi qua `SearchProvider`: nó là một khối riêng ở trên các nhóm. Tiền tố `=` được xử lý trực tiếp: không hỏi provider nào khác.
- Có nhân ngầm: `2pi`, `2(3+1)`.

**Phụ thuộc:** Task 4
**File dự kiến:** `src/command-bar/calculator.ts` (+ test), `src/command-bar/units.ts` (+ test), `src/command-bar/providers/{calculator,units}.ts`, `src/command-bar/ResultBlock.tsx`, `src/command-bar/Toast.tsx`
**Quy mô:** M

### Task 6: Tìm web + hành động winbar + lệnh `launch` an toàn

**Mô tả:**
- **`launch.rs`:** `ShellExecuteW` cho URL. Chỉ nhận `http`/`https`, từ chối mọi scheme khác.
- **Provider web:**
  - tiền tố `?`,
  - là dòng dự phòng khi không có kết quả,
  - công cụ tìm lấy từ `commandBar.webSearch` (tạm mặc định `google` cho tới Task 12).
- **Provider hành động winbar:**
  - Mở notch (tab Core / Claude) qua lệnh `open_notch(tab)`,
  - Cài đặt winbar,
  - Ẩn/Hiện notch (nhãn đổi theo trạng thái),
  - Thoát winbar.

**Tiêu chí chấp nhận:**
- [ ] Test Rust: `launch` từ chối `file:`, `javascript:`, `ms-settings:`; nhận `https://…`.
- [ ] Test TS: mã hóa URL cho cả 3 công cụ tìm.
- [ ] `? tauri` mở trình duyệt. "Mở notch · tab Claude" mở notch đúng tab. Ẩn/Hiện notch khớp với menu khay.

**Kiểm tra:**
- [ ] `cargo test`, clippy, `npm test`, lint qua.
- [ ] Thủ công: từng hành động, và từ chối URL lạ.

**Phụ thuộc:** Task 4
**File dự kiến:** `src-tauri/src/command_bar/launch.rs`, `src-tauri/src/window.rs` (lệnh `open_notch`), `src/command-bar/providers/{web,winbar-actions}.ts`
**Quy mô:** S

---

## Giai đoạn 3 — App và lịch sử

### Task 7: Liệt kê app (AppsFolder), chấm điểm tên, mở app

**Mô tả:**
- **`apps.rs`:**
  - liệt kê `FOLDERID_AppsFolder` trên luồng nền lúc khởi động: tên, id, là app Store hay desktop, đường dẫn đích nếu có,
  - liệt kê lại khi thư mục Start Menu đổi, hoặc khi mở mà lần trước đã quá 10 phút.
- **`launch`:** nhận id app, chỉ chấp nhận id có trong danh sách. Ctrl+Enter mở thư mục chứa exe nếu có.
- **`rank.ts`:** 6 bậc điểm, bỏ dấu tiếng Việt, cùng bậc thì tên ngắn hơn trước (điểm lịch sử thêm ở Task 9).
- **Dòng app:** tile chữ cái đầu (icon ở Task 8).

**Tiêu chí chấp nhận:**
- [ ] Test `rank.ts`: 6 bậc, "vsc" → Visual Studio Code, "cai dat" khớp "Cài đặt", không khớp → loại.
- [ ] Test Rust: `launch` từ chối id không có trong danh sách.
- [ ] Số app liệt kê ≈ `Get-StartApps` (196 trên máy này). "code", "term", "vsc", "sett" ra app đúng trong 3 dòng đầu.
- [ ] Mở được app desktop và app Store (Calculator, Settings).

**Kiểm tra:**
- [ ] `cargo test`, clippy, `npm test`, lint qua.
- [ ] Thủ công: mở 3 app desktop + 2 app Store; Ctrl+Enter trên VS Code mở thư mục cài.

**Phụ thuộc:** Checkpoint 1, Task 6 (`launch.rs`)
**File dự kiến:** `src-tauri/src/command_bar/apps.rs`, `src-tauri/src/command_bar/launch.rs`, `src-tauri/Cargo.toml` (crate `windows`), `src/command-bar/rank.ts` (+ test), `src/command-bar/providers/apps.ts`
**Quy mô:** M

### Task 8: Icon app (PNG cache, tải dần)

**Mô tả:**
- **`icons.rs`:** `IShellItemImageFactory` 32px × DPI → PNG bằng WIC → `%LOCALAPPDATA%\winbar\icons\<hash>.png`.
- **Trả về UI:** đường dẫn cache, dùng asset protocol của Tauri với phạm vi chỉ thư mục icons (hoặc data URL nếu asset protocol không hợp).
- **Tải dần:** icon tải sau danh sách; dòng hiện chữ cái đầu cho tới khi có icon.
- **Cache:** khóa theo id + thời gian sửa của file đích.

**Tiêu chí chấp nhận:**
- [ ] App desktop và app Store đều có icon thật, sắc nét ở 125%.
- [ ] Lần mở thứ hai đọc từ cache (không gọi COM lại). Xóa thư mục cache thì tự tạo lại.
- [ ] Asset protocol chỉ đọc được thư mục icons.

**Kiểm tra:**
- [ ] `cargo test` (tên file cache, phạm vi đường dẫn), clippy, `npm test`, lint qua.
- [ ] Thủ công: so icon với menu Start; đo thời gian tạo lần đầu cho toàn bộ app.

**Phụ thuộc:** Task 7
**File dự kiến:** `src-tauri/src/command_bar/icons.rs`, `src-tauri/tauri.conf.json` (asset scope), `src/command-bar/providers/apps.ts`, `src/command-bar/ResultList.tsx`
**Quy mô:** M

### Task 9: Lịch sử + nhóm "Gần đây"

**Mô tả:**
- **`history.rs`:** ghi mỗi lần chạy vào `%APPDATA%\winbar\command-history.json`.
  - Ghi nguyên tử, giữ tối đa 200 mục.
  - Không lưu chữ đã gõ. Bỏ qua kết quả có `remember: false`.
- **Điểm:** tần suất × độ mới, nửa đời 7 ngày. Dùng để xếp các kết quả cùng bậc ở `rank.ts`.
- **Ô trống:** hiện "Gần đây" tối đa 8 mục. App/file không còn tồn tại thì bỏ.

**Tiêu chí chấp nhận:**
- [ ] Test Rust: điểm (tần suất, độ mới), giới hạn 200, file hỏng → rỗng và sao lưu `.bak`, không lưu chữ gõ.
- [ ] Test TS: điểm lịch sử chỉ đổi thứ tự trong cùng bậc.
- [ ] Ô trống hiện đúng thứ tự dùng; khởi động lại vẫn còn (tiêu chí 8).

**Kiểm tra:**
- [ ] `cargo test`, clippy, `npm test`, lint qua.
- [ ] Thủ công: mở 3 app theo thứ tự khác nhau, mở lại command bar, xem "Gần đây"; gỡ một shortcut thử thì mục đó biến mất.

**Phụ thuộc:** Task 7
**File dự kiến:** `src-tauri/src/command_bar/history.rs`, `src/command-bar/rank.ts`, `src/command-bar/use-command-search.ts`, `src/command-bar/providers/recent.ts`
**Quy mô:** M

## Checkpoint 2
- [ ] Test, lint, build qua
- [ ] Bạn dùng thử thay Quick Launch của yasb cho app + máy tính một thời gian ngắn và góp ý

---

## Giai đoạn 4 — File và cài đặt

### Task 10: Tìm file bằng Windows Search + Ctrl+Enter mở thư mục chứa

**Mô tả:**
- **`files/windows_search.rs`:** OLE DB `Search.CollatorDSO` trên luồng nền có COM.
  - Tìm trong `%USERPROFILE%`, khớp theo tên file, sắp theo ngày sửa, tối đa 20.
  - Câu SQL dựng bằng hàm escape có test.
- **Hủy tìm cũ:** mỗi lần tìm có số thứ tự, kết quả của lần cũ bị bỏ.
- **Provider file:**
  - tiền tố `f` hiện 20 dòng; không có tiền tố thì hiện 4 dòng khi gõ ≥ 2 ký tự,
  - chờ 120ms sau lần gõ cuối,
  - icon theo loại file (dùng lại `icons.rs`), đường dẫn rút gọn.
- **Ctrl+Enter:** mở Explorer chọn sẵn file.
- **Lỗi:** WSearch tắt thì hiện dòng báo trong nhóm File.

**Tiêu chí chấp nhận:**
- [x] Test Rust: escape `'` `%` `_` `[`; chữ có dấu tiếng Việt; chuỗi rỗng; `launch` từ chối đường dẫn không tồn tại.
- [ ] "brief" ra file brief ≤ 300ms sau khi dừng gõ (đo trên release) → đo ở Task 13. Spike đo truy vấn 53–96ms, cộng 120ms chờ gõ.
- [ ] Ctrl+Enter mở Explorer chọn đúng file → bạn thử trên bản dev đang chạy.

**Kiểm tra:** (2026-09-17)
- [x] `cargo test` 44 (windows_search 5, files 4, launch 2) · clippy sạch.
- [x] `npm test` 223 (files provider 5: chờ gõ + map dòng + mở/hiện thư mục, < 2 ký tự, gõ tiếp thì không hỏi index, đánh số lần tìm, dòng báo lỗi; sources +1) · lint sạch.
- [x] Windows Search trả `System.ItemType = "Directory"` cho thư mục (kiểm bằng truy vấn thật).
- [x] Bản dev của bạn đã tự build lại với code này (winbar.exe 2:02 PM).

**Ghi chú:**
- Làm trước Task 6/7/8 theo thứ tự bạn chốt. `launch.rs` có `open_path` + `reveal_path`, kiểm tra đường dẫn tuyệt đối và đang tồn tại.
- Icon file tạm theo loại (file / thư mục); icon thật ở Task 8.
- Loại khỏi kết quả: `node_modules`, `target`, `.git`, `.cargo`, `.rustup`, `AppData`.
- Nhiều từ thì mọi từ phải có trong tên file.
- Thêm crate `windows` 0.61 (đã duyệt trong spec).

**Phụ thuộc:** Task 8
**File dự kiến:** `src-tauri/src/command_bar/files/{mod,windows_search}.rs`, `src-tauri/src/command_bar/launch.rs`, `src/command-bar/providers/files.ts`
**Quy mô:** M

### Task 11: Tìm file bằng Everything + tự chọn nguồn

**Mô tả:**
- **`files/everything.rs`:** theo cách đã duyệt ở Checkpoint 0 (DLL kèm app, hoặc IPC).
  - Tìm theo tên trên mọi ổ, sắp theo ngày sửa, tối đa 20.
- **Chọn nguồn khi mở command bar** (mặc định `auto`): Everything đang chạy → Everything; không thì Windows Search; không có cả hai thì hiện dòng báo.
- **Nhãn nguồn:** nhóm File ghi rõ nguồn đang dùng.

**Tiêu chí chấp nhận:**
- [ ] Test Rust: logic chọn nguồn (4 trường hợp: auto có/không Everything, ép `everything` khi không chạy, `off`).
- [ ] Có Everything: tìm được file ngoài `%USERPROFILE%`. Tắt Everything: tự về Windows Search.

**Kiểm tra:**
- [ ] `cargo test`, clippy, `npm test`, lint qua.
- [ ] Thủ công: cần Everything. **Hỏi bạn trước khi cài**, hoặc bạn tự cài rồi báo.

**Phụ thuộc:** Task 10, Checkpoint 0
**File dự kiến:** `src-tauri/src/command_bar/files/{mod,everything}.rs`, `src-tauri/resources/everything/` (nếu kèm DLL), `src-tauri/tauri.conf.json`
**Quy mô:** M

### Task 12: Mục Command bar trong Cài đặt

**Mô tả:** Cửa sổ Cài đặt thêm mục **Command bar**:
- **Tìm file:** ToggleGroup `auto/everything/windows/off` + dòng trạng thái nguồn đang dùng. Rust có lệnh `get_file_search_status`.
- **Tìm trên web bằng:** ToggleGroup.
- **Đặt lại vị trí:** nút đặt `position` về `null`.

Mọi thay đổi áp dụng ngay cho command bar đang mở.

**Tiêu chí chấp nhận:**
- [ ] Test component: đổi từng mục gọi `update_settings` đúng; dòng trạng thái theo lệnh Rust.
- [ ] Đổi nguồn file / công cụ tìm web khi command bar đang mở thì lần gõ kế tiếp dùng giá trị mới. "Đặt lại vị trí" hoạt động (tiêu chí 12).

**Kiểm tra:**
- [ ] `npm test`, `cargo test`, lint qua.
- [ ] Thủ công: so với phong cách các mục Cài đặt có sẵn.

**Phụ thuộc:** Task 11
**File dự kiến:** `src/settings/CommandBarSection.tsx` (+ test), `src/settings/SettingsApp.tsx`, `src-tauri/src/command_bar/files/mod.rs`
**Quy mô:** S

### Task 13: Đo hiệu năng, checklist thủ công, so mockup, 15 tiêu chí

**Mô tả:**
- Viết `tests/manual-command-bar.md` theo mục 10 của spec và chạy toàn bộ.
- Đo thời gian mở (release) và RAM/CPU khi đứng yên 1 phút.
- So từng trạng thái với mockup; sửa chỗ lệch, hoặc ghi lý do.

**Tiêu chí chấp nhận:**
- [ ] Mở ≤ 150ms. CPU < 1%. RAM Task Manager < 150 MB (ghi số đo).
- [ ] Mọi mục checklist qua hoặc có ghi chú.
- [ ] Đạt 15 tiêu chí ở mục 11 của spec.

**Kiểm tra:**
- [ ] `npm test`, `cargo test`, `npm run lint`, `npm run tauri build -- --no-bundle` qua.
- [ ] Checklist đã điền.

**Phụ thuộc:** Task 12
**File dự kiến:** `tests/manual-command-bar.md`, các file sửa lỗi nhỏ
**Quy mô:** S–M

## Checkpoint cuối
- [ ] Đạt 15 tiêu chí của spec
- [ ] Test, lint, build qua
- [ ] Bạn duyệt để chuyển sang module `media`
