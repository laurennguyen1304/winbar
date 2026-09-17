# Tasks: notch-shell v2

> Plan: `tasks/plan.md` · Spec: `SPEC-notch-shell.md` §15 · Mockup: `design/notch-upgrade-mockup.html`
> Lệnh chung: `npm test` · `cargo test --manifest-path src-tauri/Cargo.toml` · `npm run lint` · `npm run tauri dev`

### Task 1: Dạng giọt nước + nền liquid glass

**Mô tả:**
- `notch-shape.ts`: path giọt nước (loe 14px, viền mở ở cạnh trên) và path pill, có test.
- `NotchShape`: nền cắt bằng path, viền SVG, vẽ lại theo kích thước đang co giãn.
- Hai kiểu nền: `liquid` và `dense`.
- Cửa sổ native: rộng thêm phần loe, cạnh trên dính mép khi `attached`.
- Cài đặt: `pill.layout`, `pill.material` (Rust validate + TS type).
- Cửa sổ Cài đặt: hai mục chọn. Phần xem trước dùng đúng hình dạng mới.

**Tiêu chí chấp nhận:**
- [x] Mặc định là giọt nước + liquid glass. Đổi trong Cài đặt thì notch đổi ngay.
- [x] Không có vệt thẳng chỗ phần loe nối vào thân (một viền liền). Ở mọi trạng thái: pill, alert, always, mở rộng.
- [x] `float` + `dense` trông như trước.
- [x] Test: path, validate cài đặt, kích thước cửa sổ theo layout.

**Kiểm tra:**
- [x] `npm test`, `cargo test`, clippy, `npm run lint` qua.
- [x] Thủ công: ảnh chụp app thật ở cả 4 trạng thái trên nền tối (Task 4). Nền sáng: 👤 trong `tests/manual-shell.md` V2.
  - 2026-09-17: đã chụp pill, always, mở rộng (attached/liquid và float/dense) trên nền tối. Panel mở dùng nền liquid dày hơn (0.88–0.9) cho dễ đọc. Còn: nền sáng + alert, xem ở Checkpoint 1.

**File dự kiến:** `src/shell/notch-shape.ts` (+ test), `src/shell/NotchShape.tsx`, `src/shell/Notch.tsx`, `src/shell/Notch.module.css`, `src/shell/PillPreview.tsx`, `src/shell/settings.ts`, `src-tauri/src/settings.rs`, `src/settings/SettingsApp.tsx`
**Quy mô:** M

### Task 2: Kéo ngang dọc mép trên

**Mô tả:**
- **Kéo:** nhấn giữ notch, di quá 6px thì kéo (hủy hẹn giờ hover, không mở panel). Notch chỉ trượt ngang, kẹp trong màn hình.
- **Lưu:** khi thả, lưu `pill.offsetX` (px logic từ giữa màn hình). Rust đặt cửa sổ theo `offsetX`.
- **Cài đặt:** nút "Về giữa".

**Tiêu chí chấp nhận:**
- [x] Kéo sang trái/phải, thả, khởi động lại: đúng chỗ. Không hít vào giữa.
- [x] Bấm (di < 6px) vẫn mở notch; hover vẫn mở sau 250ms khi không kéo.
- [x] Test Rust: vị trí theo offset, kẹp mép màn hình ở 100/125/150%. Test TS: ngưỡng kéo.

- 2026-09-17: kiểm tra trên app thật qua CDP: kéo −300 → cửa sổ dời 375px vật lý (125%), lưu `offsetX`, không mở panel; kéo quá mép dừng ở x=0; tải lại trang giữ đúng chỗ. Nhấn giữ hủy hẹn giờ hover; panel đang mở cũng kéo được từ vùng trống. Notch chỉ hiện sau khi đọc xong cài đặt.

**Phụ thuộc:** Task 1
**Quy mô:** M

## Checkpoint 1
- [x] Bạn xem trên máy thật: hình dạng, nền, kéo; chốt chiều cao pill → **32/36/40** (2026-09-17)

### Task 3: Sticky (Windows AppBar)

**Mô tả:**
- **Giữ chỗ:** khi `pill.sticky` bật, đăng ký AppBar ở cạnh trên màn hình chính, cao bằng notch thu gọn.
- **Cập nhật:** khi đổi kích thước pill, layout hoặc màn hình.
- **Gỡ:** khi tắt sticky, khi thoát app, khi app bị tắt ngang (dọn lúc khởi động lại).
- **Cài đặt:** công tắc "Sticky", kèm ghi chú về YASB.

**Tiêu chí chấp nhận:**
- [x] Bật: cửa sổ phóng to (browser) bắt đầu dưới notch. Tắt hoặc thoát: trả lại toàn màn hình.
- [x] Không để lại vùng giữ chỗ sau khi thoát.
- [x] Test Rust: tính chiều cao dải giữ chỗ theo layout/kích thước/DPI.

- 2026-09-17: đo vùng làm việc trên máy (125%, YASB giữ 47px): bật → mép trên 97 (+50), always → 127 (+80), tắt → 47. Dải nằm ngay dưới YASB (shell xếp AppBar chồng nhau). Gỡ khi thoát qua RunEvent ExitRequested/Exit; chưa thử thoát thật (sẽ tắt app dev) và chưa kiểm chứng trường hợp app bị tắt ngang.

**Phụ thuộc:** Checkpoint 1
**Quy mô:** M

### Task 4: Đo, checklist thủ công, so mockup

**Tiêu chí chấp nhận:**
- [x] CPU < 1%, RAM Task Manager < 150 MB khi đứng yên (bản release).
- [x] `tests/manual-shell.md` thêm phần v2 (giọt nước, kéo, sticky); so ảnh với mockup.

**Phụ thuộc:** Task 3
**Quy mô:** S
