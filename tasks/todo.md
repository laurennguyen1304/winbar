# Tasks: system

> Plan: `tasks/plan.md` · Spec: `SPEC-system.md`
> Lệnh chung: `npm test` · `cargo test --manifest-path src-tauri/Cargo.toml` · `npm run lint` · `npm run tauri dev`

### Task 1: Rust đọc CPU/RAM + mở Task Manager

**Mô tả:**
- **Feature:** bật `Win32_System_SystemInformation`, `Win32_System_Threading` cho crate `windows`.
- **`system/model.rs` (thuần):** `cpu_percent` từ hai mốc (xử lý mốc lùi, chia 0), định dạng GB.
- **`system/stats.rs`:** đọc `GlobalMemoryStatusEx`, `GetSystemTimes`.
- **`system/mod.rs`:** lệnh `system_stats` (giữ mốc trước; mốc cũ hơn 10 giây thì tự đo nhanh 150ms), lệnh `open_task_manager`.

**Tiêu chí chấp nhận:**
- [ ] `system_stats` trả số hợp lý: CPU 0–100, RAM đã dùng < tổng.
- [ ] Gọi hai lần cách 2 giây: CPU khớp mức tải thật (so với Task Manager, lệch ≤ 5 điểm).
- [ ] `open_task_manager` mở đúng; gọi lần hai không mở thêm cửa sổ.
- [ ] Test Rust cho toàn bộ `model.rs`.

**Kiểm tra:** `cargo test`, clippy; thủ công qua CDP.

**Phụ thuộc:** không
**File dự kiến:** `src-tauri/Cargo.toml`, `src-tauri/src/system/{mod,model,stats}.rs`, `src-tauri/src/lib.rs`
**Quy mô:** S

### Task 2: Card "Hệ thống" + hook đo + search provider

**Mô tả:**
- **`use-stats.ts`:** đo ngay khi card hiện, rồi 2 giây/lần; dừng khi rời card; lỗi thì giữ số cũ và đánh dấu lỗi.
- **`SystemCard`:** CPU %, RAM `12.4 / 31.7 GB`, hai thanh mức (ngưỡng màu 75% và 90%), nút Task Manager, dòng báo 2 giây, dòng lỗi đỏ.
- **Search provider:** một dòng "Mở Task Manager", tìm không dấu.
- **Đăng ký** widget trong `src/widgets/index.ts`.

**Tiêu chí chấp nhận:**
- [ ] Card hiện số trong 1 giây, đổi sau mỗi 2 giây.
- [ ] Rời card (đóng panel, đổi tab): không còn lệnh đo nào.
- [ ] Lỗi đo: hiện "—", không vỡ bố cục.
- [ ] Nút mở Task Manager; command bar gõ "task" / "quan ly tac vu" ra đúng dòng.
- [ ] Test: hook, ngưỡng màu, định dạng, component, provider.

**Kiểm tra:** `npm test`, `npm run lint`; ảnh chụp card trên app thật.

**Phụ thuộc:** Task 1
**File dự kiến:** `src/widgets/system/*`, `src/widgets/index.ts`
**Quy mô:** M

### Task 3: Đo, checklist thủ công, so số

**Tiêu chí chấp nhận:**
- [ ] So số với Task Manager: CPU lệch ≤ 5 điểm, RAM lệch ≤ 0.3 GB.
- [ ] Bản release: panel đóng CPU như trước module; panel mở thêm ≤ 0.5%; RAM tăng ≤ 5 MB.
- [ ] `tests/manual-system.md` theo tiêu chí §11 của spec.

**Phụ thuộc:** Task 2
**Quy mô:** S
