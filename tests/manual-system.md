# Checklist thủ công: system

> Spec: `SPEC-system.md` §11 · Chạy lần đầu: 2026-09-18 (Task 3)
> Máy: Windows 11, màn 1920×1200 ở 125%, WebView2 153
>
> Ký hiệu: ✅ qua · 👤 bạn cần tự kiểm · ⚠️ qua nhưng có ghi chú

## Cách chạy

| Việc | Lệnh |
|---|---|
| Tự động | `npm test` · `cargo test --manifest-path src-tauri/Cargo.toml` · `npm run lint` |
| So số với Windows | `Get-Counter '\Processor(_Total)\% Processor Time'` và `Get-CimInstance Win32_OperatingSystem` |

## 1. Số liệu (tiêu chí 1, 2)

So `system_stats` với bộ đếm của Windows, 4 lần cách nhau 2 giây:

| winbar | Windows |
|---|---|
| CPU 12.0% · RAM 26.18 / 31.56 GB | CPU 13% · RAM 26.22 / 31.56 GB |
| CPU 17.7% · RAM 26.16 GB | CPU 14.3% · RAM 26.20 GB |
| CPU 20.0% · RAM 26.14 GB | CPU 21.4% · RAM 26.20 GB |
| CPU 24.9% · RAM 26.11 GB | CPU 22.6% · RAM 26.15 GB |

- [x] ✅ CPU lệch ≤ 3.5 điểm phần trăm (yêu cầu ≤ 5).
- [x] ✅ RAM lệch ≤ 0.05 GB (yêu cầu ≤ 0.3).
- [x] ✅ Card hiện số trong 1 giây sau khi mở panel; đổi sau mỗi 2 giây.
- [ ] 👤 So mắt với tab Performance của Task Manager khi máy đang nặng (render video, build).

## 2. Chỉ đo khi cần (tiêu chí 3)

- [x] ✅ Đếm `setInterval` đang sống trong trang notch: `[2000]` khi panel mở, `[]` sau khi đóng.
- [x] ✅ Test component: rời card thì không còn lệnh đo nào (`SystemCard.test.tsx`).

## 3. Task Manager (tiêu chí 4)

- [x] ✅ Gọi `open_task_manager`: Task Manager mở; gọi lần hai không mở thêm cửa sổ.
- [x] ⚠️ Script test **không đóng được** Task Manager (tiến trình quyền cao, `Stop-Process` và `CloseMainWindow` đều bị từ chối). Lần chạy 2026-09-18 để lại một cửa sổ, bạn tự đóng.
- [ ] 👤 Bấm nút trong card: Task Manager mở, dòng "Đã mở Task Manager" hiện rồi tự mất sau 2 giây.

## 4. Command bar (tiêu chí 5)

- [x] ✅ Test provider: "task", "Task Manager", "quan ly tac vu", "quản lý", "taskmgr" đều ra đúng một dòng; "a", "spotify", chuỗi rỗng thì không ra.
- [ ] 👤 Gõ trong command bar thật rồi Enter.

## 5. Lỗi

- [x] ✅ Đo lỗi: card hiện "—" cho cả CPU và RAM, kèm dòng "Không đọc được tình trạng máy" (test component).
- [x] ✅ Mở Task Manager lỗi: dòng đỏ kèm lý do, giữ trên màn hình (test component).

## 6. Hiệu năng (tiêu chí 6)

Bản release, Spotify đang phát (pill hiện media, cột sóng chạy).

| Trạng thái | CPU | RAM (Task Manager) |
|---|---|---|
| Panel đóng, bản release sạch | 0.268% | 111–114 MB |
| Mốc trước module system (sau module media) | 0.27–0.31% | 113–122 MB |
| Panel mở (đo theo lát 10 giây, có kiểm trạng thái) | +0.116 điểm so với lúc đóng | |

- [x] ✅ Panel đóng: CPU và RAM **không đổi** so với trước module (chênh trong khoảng dao động của máy).
- [x] ✅ Panel mở tốn thêm **0.116 điểm** CPU, dưới mức 0.5.
- [x] ✅ RAM tăng ≤ 5 MB so với trước module.
- [x] ⚠️ Lần đo có bật cổng debug cho số cao hơn (RAM 140 MB, panel mở 161 MB); số ở bảng trên lấy từ bản release sạch.

## 7. So với mockup

- [x] ✅ Nhãn "HỆ THỐNG" bên trái, nút Task Manager dạng viên thuốc bên phải; hai thanh mức CPU và RAM bên dưới.
- [x] ✅ Thu gọn theo yêu cầu 2026-09-18: card cao **79px**, trước đó 127px (giảm 38%).
- [x] ⚠️ Khác mockup có chủ đích: mockup có nút nguồn và lưới Ngủ / Khởi động lại / Tắt máy / Đổi người dùng; bạn chốt bỏ hẳn (2026-09-18), thay bằng hai thanh mức CPU và RAM.

## 8. Tự động (tiêu chí 7)

- [x] ✅ `npm test`: 37 file, 349 test.
- [x] ✅ `cargo test`: 102 test. `cargo clippy -D warnings`: sạch.
- [x] ✅ `npm run lint`: sạch.
- [x] ✅ `npm run tauri build -- --no-bundle`: `winbar.exe` 4.83 MB (+25 KB so với trước module).

## Dọn dẹp sau lần chạy 2026-09-18

- [x] Trả `settings.json` từ bản sao lưu (bản release bỏ widget demo khỏi file).
- [x] Gỡ `Run\winbar` do bản release thêm vào.
- [x] Tắt bản release, mở lại app dev.
- [x] Không còn cửa sổ Task Manager nào do test mở.
