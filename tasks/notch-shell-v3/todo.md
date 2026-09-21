# Tasks: notch trên nhiều màn hình (notch-shell v3)

> Plan: `tasks/plan.md` · Spec: `SPEC-notch-shell.md` §16
> Lệnh chung: `npm test` · `cargo test --manifest-path src-tauri/Cargo.toml` · `npm run lint` · `npm run tauri dev`

### Task 1: Cài đặt `pill.monitor` + một notch mỗi màn hình

**Mô tả:**
- **Cài đặt:** `pill.monitor` = `primary` | `all`, mặc định `primary`.
- **Cửa sổ:** `window::sync_windows` tạo/đóng cửa sổ notch cho khớp danh sách màn hình; mỗi cửa sổ nhớ màn của nó.
- **Sticky theo cửa sổ:** mỗi notch giữ chỗ trên màn của nó; đóng cửa sổ thì trả chỗ.
- **Theo dõi màn hình:** 2 giây/lần, cắm/rút màn thì thêm/bớt notch.

**Tiêu chí chấp nhận:**
- [x] Chọn `all`: mỗi màn một notch, đứng yên, cùng nội dung.
- [x] Chọn `primary`: chỉ còn notch ở màn chính, cửa sổ thừa đóng lại.
- [x] `offsetX` kẹp trong từng màn.
- [x] Test Rust: tên cửa sổ theo màn, thứ tự màn (màn chính trước), kẹp offset ở màn hẹp.

**Kiểm tra:** `cargo test`, clippy, `npm test`, `npm run lint`; thủ công trên hai màn hình.

**Phụ thuộc:** không
**Quy mô:** M

### Task 2: Kiểm hai màn hình thật, sticky theo màn, checklist

**Tiêu chí chấp nhận:**
- [x] Bật `all`: hai notch hiện cùng lúc, mỗi cái đúng kích thước theo DPI màn đó.
- [x] Sticky bật: mỗi màn có dải giữ chỗ riêng (40 và 32 px vật lý).
- [ ] Rút màn 2: notch của màn đó biến mất trong ~2 giây; cắm lại thì hiện lại.
- [x] RAM tăng thêm khi bật `all`: +~25 MB (122–126 → 146–149 MB), CPU không đổi.
- [x] `tests/manual-shell.md` thêm phần v3.

**Phụ thuộc:** Task 1
**Quy mô:** S
