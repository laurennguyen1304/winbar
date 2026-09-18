# Tasks: notch trên nhiều màn hình (notch-shell v3)

> Plan: `tasks/plan.md` · Spec: `SPEC-notch-shell.md` §16
> Lệnh chung: `npm test` · `cargo test --manifest-path src-tauri/Cargo.toml` · `npm run lint` · `npm run tauri dev`

### Task 1: Cài đặt `pill.monitor` + notch theo con trỏ

**Mô tả:**
- **Cài đặt:** `pill.monitor` = `primary` | `mouse`, mặc định `primary` (Rust validate + kiểu TS + mục chọn "Màn hình" trong Cài đặt).
- **Chọn màn hình:** `window::target_geometry()` — `mouse` thì lấy màn chứa con trỏ (`GetCursorPos` + `monitor_from_point`), lỗi thì về màn chính. `apply` và `sticky` dùng chung.
- **Theo dõi:** luồng có sẵn (`watch_displays`) xem con trỏ 300ms/lần khi cài đặt là `mouse`; chỉ đặt lại vị trí khi **đổi màn** và khi panel **không** mở rộng.
- **Kẹp `offsetX`** theo bề rộng màn hình mới.

**Tiêu chí chấp nhận:**
- [x] Đặt `mouse`: đưa chuột sang màn 2 thì notch sang màn 2 trong ~0.5 giây; về màn 1 thì quay lại.
- [ ] Đặt `primary`: notch luôn ở màn chính dù chuột ở đâu.
- [x] Kéo lệch ở màn rộng rồi sang màn hẹp: notch vẫn nằm trong màn, không lòi ra ngoài.
- [ ] Panel đang mở: không đổi màn giữa chừng; thu gọn xong mới đổi.
- [x] Test Rust: chọn màn theo điểm; kẹp offset ở màn có gốc âm/dương.

**Kiểm tra:** `cargo test`, clippy, `npm test`, `npm run lint`; thủ công trên hai màn hình.
- 2026-09-18: bạn tự rê chuột, mình ghi vị trí: chuột sang màn 2 (x=2182) → notch nhảy sang x=2727 trong vòng một nhịp 400ms; về màn 1 → notch về x=769. Kẹp offset ở màn hẹp: test Rust `keeps_a_dragged_notch_inside_a_narrower_second_screen`.

**Phụ thuộc:** không
**File dự kiến:** `src-tauri/src/window.rs`, `src-tauri/src/sticky.rs`, `src-tauri/src/settings.rs`, `src/shell/settings.ts`, `src/settings/SettingsApp.tsx`, test
**Quy mô:** M

### Task 2: Kiểm hai màn hình thật, sticky theo màn, checklist

**Tiêu chí chấp nhận:**
- [ ] Sticky bật, đổi màn: dải giữ chỗ chuyển sang màn mới, màn cũ được trả lại.
- [ ] Rút màn 2 khi notch đang ở đó: notch về màn chính trong ~2 giây.
- [ ] CPU khi bật `mouse` không tăng quá 0.1 điểm so với `primary` (đo bản release).
- [ ] `tests/manual-shell.md` thêm phần v3.

**Phụ thuộc:** Task 1
**Quy mô:** S
