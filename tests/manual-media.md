# Checklist thủ công: media

> Spec: `SPEC-media.md` §11 · Chạy lần đầu: 2026-09-17 (Task 6)
> Máy: Windows 11 Pro ARM64, 12 nhân, màn 1920×1200 ở 125%, WebView2 153
>
> Ký hiệu: ✅ qua · 👤 bạn cần tự kiểm · ⚠️ qua nhưng có ghi chú

## Cách chạy

| Việc | Lệnh |
|---|---|
| Tự động | `npm test` · `cargo test --manifest-path src-tauri/Cargo.toml` · `npm run lint` |
| Nguồn phát thử | `powershell -File tests\tools\media-source.ps1 [-Artwork] [-Title …] [-Artist …] [-Seconds …]`: file WAV im lặng, tắt tiếng. Tắt tiến trình là phiên biến mất |
| Xem phiên Windows | `tests\tools\media-probe.ps1` (chỉ đọc) |
| Phát/tạm dừng phiên thử | `tests\tools\media-toggle.ps1` (chỉ đụng phiên `powershell.exe`) |

- Nguồn thử **không** cho chuyển bài, và **không** báo lại vị trí sau khi tua. Hai việc này cần app thật (👤).
- Khi thử bằng script trên bản dev: đặt tạm "Cách mở" là click, để chuột thật đi qua notch không đóng panel.

## 1. Thông tin bài (tiêu chí 1, 8)

- [x] ✅ Nguồn thử có ảnh 600×600: trong ~1.6s (gồm thời gian khởi động PowerShell) card hiện đúng tên bài, nghệ sĩ, album, tên app "Windows PowerShell".
  - Ảnh bìa thu về 280×280, 11 KB.
  - Nền card là ảnh bìa làm mờ.
- [x] ✅ Nguồn thử không có ảnh: ô gradient + nốt nhạc (test component).
- [x] ✅ Bạn xác nhận với nhạc thật: ảnh bìa hiện đúng (2026-09-17).
- [ ] 👤 Tên bài, nghệ sĩ, album đúng với Spotify và YouTube.

## 2. Đổi bài (tiêu chí 2)

- [x] ✅ `trackKey` đổi khi tên bài, nghệ sĩ, album, app hoặc ảnh bìa đổi. Nội dung card mờ dần 150ms khi đổi (test component).
- [ ] 👤 Đổi bài trên Spotify hoặc bằng phím media: notch đổi trong 1 giây.

## 3. Điều khiển (tiêu chí 3)

Bấm nút thật trong card (bản dev, chế độ click):

| Thao tác | Kết quả |
|---|---|
| ⏸ Tạm dừng | ✅ `paused` sau 149ms |
| ▶ Phát | ✅ `playing` sau 250ms |
| ⏭ khi app không cho | ✅ nút mờ, không gửi lệnh |
| ⏯ ở nửa always | ✅ gửi lệnh, không mở panel (test component) |

- [ ] 👤 ⏮ ⏭ với Spotify/YouTube.

## 4. Tiến độ và tua (tiêu chí 4, 5)

- [x] ✅ Tiến độ chạy mỗi giây khi panel mở (0:00 → 0:03 sau 3 giây); đồng hồ chỉ chạy khi card đang hiện.
- [x] ✅ Bấm, kéo (gửi khi thả), phím ← → Home End: gửi đúng vị trí, hiện ngay (test component).
- [x] ⚠️ Trên máy, app nhận lệnh tua (`ok`), nhưng nguồn thử không báo lại vị trí mới.
- [x] ✅ Livestream / không có độ dài: ẩn thanh tiến độ (test Rust `duration_is_hidden_when_unusable`, test component).
- [ ] 👤 Tua trên Spotify và YouTube; sau 3 phút tiến độ lệch ≤ 1 giây so với app.
- [ ] 👤 Livestream YouTube: không có thanh tiến độ.

## 5. Nhiều app (tiêu chí 6)

Hai nguồn thử cùng chạy (`powershell.exe`, `powershell.exe#2`):

- [x] ✅ Nút › đổi sang phiên kia sau 157ms; lăn chuột đổi lại sau 128ms.
- [x] ✅ Tắt app đang hiện: quay về phiên còn lại sau 148ms.
- [x] ✅ Lựa chọn tay bị bỏ khi Windows đổi phiên hiện tại (test Rust `picks_manual_then_system_then_first`).
- [ ] 👤 Spotify + YouTube cùng mở.

## 6. Tự ẩn và tự lên pill (tiêu chí 7, 9; spec §5.6)

- [x] ✅ Tắt nguồn thử: phiên biến mất sau 93–112ms; card biến mất khỏi panel, bố cục dồn lại.
- [x] ✅ Media là pill (bản dev tạm đặt ưu tiên Media): pill 32/36/40 đúng.
- [ ] 👤 Sau khi bỏ cột sóng (2026-09-18): ba nút ⏮ ⏯ ⏭ trên pill bấm được, không mở panel.
- [x] ✅ Always: nửa media (ảnh 40, tên, nghệ sĩ, ⏸) + vạch ngăn + widget kia.
- [x] ✅ Widget ưu tiên trống (tự ẩn) và có nhạc: media lên pill; hết nhạc: pill mặc định "winbar" (test `MediaPill.test.tsx`).
- [ ] 👤 Bản release (không có widget demo): mở nhạc thì media tự lên pill, tắt nhạc thì về "winbar".

## 7. Hiệu năng (tiêu chí 10)

Bản release, nguồn thử đang phát (media là pill, cột sóng chạy), panel đóng, 8 tiến trình.

**Lần 1 — cột sóng chạy mượt 60 khung/giây:**

| Thời điểm | RAM (Task Manager) |
|---|---|
| +36s | 117.7 MB |
| +133s | 120.6 MB |
| +200s | 123.6 MB |

- [x] ❌ CPU **1.007%**, vượt mức < 1%. RAM tăng ~1 MB mỗi 30 giây.

**Tìm nguyên nhân** (bản release có cổng debug):

| Đo | Kết quả |
|---|---|
| Sự kiện `media-changed` | 3 lần trong 20 giây (không đáng kể) |
| CPU khi cột sóng chạy mượt | 1.15% |
| CPU khi cột sóng chạy theo nấc, 4 thanh cùng nhịp | 0.27% (vẫn thấy 3 khung khác nhau trong 1.4 giây) |
| CPU khi tắt hẳn cột sóng | 0.016% |
| RAM renderer notch, tắt cột sóng 3 phút | +0.9 MB |
| RAM renderer notch, bật cột sóng 3 phút | +1.2 MB |
| Heap JS sau khi ép dọn rác | 1.66 → 1.76 MB sau 32 sự kiện; số node DOM không đổi |
| RAM tiến trình Rust | 6.8 MB, không đổi |

**Đã sửa:** cột sóng chạy theo nấc, 4 thanh cùng nhịp (`Media.module.css`); Rust bỏ qua sự kiện chỉ báo lại vị trí đúng như frontend đang ước lượng (`model::is_timeline_drift`).

**Lần 2 — sau khi sửa** (chạy qua đêm, khoảng 9 tiếng, nhạc phát suốt):

| Thời điểm | RAM (Task Manager) |
|---|---|
| +36s | 114.7 MB |
| +555s | 120.5 MB |
| ~9 giờ | 122.4 MB |
| ~9 giờ + 2 phút | 122.1 MB (đi ngang) |

- [x] ✅ CPU trung bình **0.27–0.31%**, dưới 1%.
- [x] ✅ RAM **122 MB**, tăng 13 MB so với 109 MB trước module media, trong mức ≤ 15 MB. Sau vài phút đầu thì đi ngang, không rò rỉ.
- [x] ⚠️ Còn dư ~28 MB trước ngưỡng 150 MB cho `system` và `clipboard`. Cần đo lại sau mỗi module.

## 8. So với mockup

So ảnh chụp app (card, pill 32/36/40, always) với `design/winbar-mockup.html`.

- [x] ✅ Card: nhãn "Đang phát" + tên app, ảnh bìa 140 bo 16, tên bài 16px đậm, nghệ sĩ, album mờ, thanh tiến độ 4px, giờ mono, ⏮ ⏯ (nút tròn sáng 38px) ⏭.
- [x] ✅ Nền card là ảnh bìa mờ 34px, độ đục 0.38, như mockup.
- [x] ⚠️ Pill: ảnh 24 bo 6, tên bài, nghệ sĩ mờ. Khác mockup: bỏ cột sóng, thay bằng ba nút điều khiển (bạn chốt 2026-09-18).
- [x] ✅ Always: ảnh 40 bo 9, hai dòng chữ, nút ⏯.
- [x] ⚠️ Khác có chủ đích:
  - chưa có hiệu ứng trượt khi đổi bài (M10 bản v1: chỉ mờ dần);
  - thêm ‹ › cạnh tên app khi có ≥ 2 app (mockup chỉ có một app).

## 9. Tự động (tiêu chí 11)

- [x] ✅ `npm test`: 35 file, 337 test.
- [x] ✅ `cargo test`: 96 test. `cargo clippy -D warnings`: sạch.
- [x] ✅ `npm run lint`: sạch.
- [x] ✅ `npm run tauri build -- --no-bundle`: `winbar.exe` 4.8 MB.

## Dọn dẹp sau lần chạy 2026-09-17

- [x] Trả `settings.json` từ bản sao lưu (bản release bỏ widget demo khỏi file).
- [x] Gỡ `Run\winbar` do bản release thêm vào.
- [x] Tắt nguồn phát thử; không còn phiên media nào.
- [x] Tắt bản release: vùng làm việc trả về mép 0 (sticky của bạn đang bật).
- [x] Mở lại app dev.
