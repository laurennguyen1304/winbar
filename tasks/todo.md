# Tasks: update

> Plan: `tasks/plan.md` · Spec: `SPEC-update.md`
> Lệnh chung: `npm test` · `cargo test --manifest-path src-tauri/Cargo.toml` · `npm run lint` · `npm run tauri dev`

### Task 1: Rust — `http.rs` ra chỗ dùng chung ✅

- Chuyển `src-tauri/src/claude/http.rs` → `src-tauri/src/http.rs`; `claude/usage.rs` gọi qua đường mới.
- **Chấp nhận:** không đổi hành vi; toàn bộ test Rust qua; clippy sạch.
- **Kiểm tra:** `cargo test`; mở panel thấy hạn mức Claude vẫn có số.
- **File:** `http.rs`, `claude/mod.rs`, `claude/usage.rs`, `lib.rs` · **Quy mô:** S

### Task 2: Rust — `update/model.rs` thuần ✅

- `parse_version`, so phiên bản, `is_due`, đọc `version` từ body `tauri.conf.json`, quyết định có báo không (so với
  bản đang chạy và `dismissedVersion`).
- **Chấp nhận:** mọi trường hợp ở spec §11 dòng Rust đầu có test.
- **Kiểm tra:** `cargo test update`
- **File:** `update/model.rs`, `update/mod.rs` (khai báo) · **Quy mô:** S

### Task 3: Rust — lệnh, `update.json`, luồng nền, công tắc ✅

- Lệnh `update_status`, `update_check`, `update_open_changelog`, `update_dismiss`; sự kiện `update-available`.
- `update.json` đọc/ghi nguyên tử; thiếu hay hỏng thì coi như chưa hỏi.
- Luồng nền: chờ 1 phút, rồi mỗi giờ so mốc; tới hạn và `update.check` bật mới gọi mạng. Lỗi mạng không đổi mốc.
- `settings.rs`: thêm `update: { check: true }`, file cũ không có mục này vẫn đọc được.
- **Chấp nhận:** tắt công tắc thì luồng nền không gọi `http::get`; khởi động lại trong tuần không gọi lại.
- **Kiểm tra:** `cargo test`; devtools gọi `update_check` với `version` hạ tạm xuống `0.0.1`.
- **File:** `update/mod.rs`, `settings.rs`, `lib.rs`, `src/shell/settings.ts` · **Quy mô:** M

### Task 4: TS — alert trên pill ✅

- `src/update/native.ts`, `UpdateAlert.tsx`. `App.tsx` nghe `update-available` và, lúc mở, hỏi `update_status` để
  báo lại bản đã biết mà chưa bỏ qua.
- **Chấp nhận:** Xem gọi `update_open_changelog` rồi `update_dismiss`; Để sau gọi `update_dismiss`; alert đóng.
- **Kiểm tra:** `npm test`; chạy dev với bản hạ số thấy alert.
- **File:** `src/update/*`, `src/App.tsx` · **Quy mô:** S

### Task 5: TS — mục Cập nhật trong Cài đặt ✅

- Dòng phiên bản, công tắc **Tự kiểm tra bản mới**, nút **Kiểm tra ngay** với ba kết quả.
- **Chấp nhận:** đúng spec §5.3; công tắc tắt thì nút vẫn chạy.
- **Kiểm tra:** `npm test`; mở Cài đặt xem thật.
- **File:** `src/settings/UpdateSection.tsx`, `SettingsApp.tsx`, test · **Quy mô:** S

### Task 6: Phiên bản 0.2.0 và tài liệu ✅

- Đổi `0.1.0` → `0.2.0` ở `package.json`, `tauri.conf.json`, `Cargo.toml`; test Rust so ba số.
- README: dòng ở phần Bảo mật (hỏi GitHub mỗi tuần, lộ IP, cách tắt); phần cập nhật nói về alert. Quy trình tăng
  số cho chủ dự án (spec §8).
- CHANGELOG: mục `## 0.2.0 — <ngày>`, ghi rõ bản này là bản đầu có báo cập nhật.
- **Chấp nhận:** toàn bộ tiêu chí spec §12; kiểm tay spec §11.
- **File:** 3 file phiên bản, `README.md`, `CHANGELOG.md` · **Quy mô:** S
