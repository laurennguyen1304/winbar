# Tasks: media

> Plan: `tasks/plan.md` · Spec: `SPEC-media.md`
> Lệnh chung: `npm test` · `cargo test --manifest-path src-tauri/Cargo.toml` · `npm run lint` · `npm run tauri dev`

### Task 1: Spike WinRT + Rust đọc trạng thái

**Mô tả:**
- **Feature:** bật `Media_Control`, `Foundation`, `Foundation_Collections`, `Storage_Streams` cho crate `windows`.
- **`media/model.rs` (thuần):** `MediaState`, chọn phiên (tay → Windows → phiên đầu), `trackKey`, độ dài hợp lệ (0 hoặc ≥7 ngày = không), tên app từ AUMID/exe.
- **`media/session.rs`:** luồng WinRT, manager + session, 5 sự kiện, debounce, phát `media-changed`.
- **Lệnh:** `media_state`.
- **Nguồn test:** script PowerShell phát WAV im lặng qua `MediaPlayer`, tên bài giả.

**Tiêu chí chấp nhận:**
- [x] Chạy script test: trong 1 giây có `media-changed` với đúng tên bài/nghệ sĩ, trạng thái `playing`.
- [x] Tạm dừng / tắt script: trạng thái đổi `paused` / `current: null` trong 1 giây.
- [x] App không crash khi không có phiên nào, và khi phiên biến mất giữa chừng.
- [x] Test Rust cho toàn bộ `model.rs`.

**Kiểm tra:** `cargo test`, clippy; thủ công bằng script + CDP nghe sự kiện.
- 2026-09-17: nguồn thử `tests/tools/media-source.ps1` (WAV im lặng, tắt tiếng). Sự kiện `playing` đúng tên bài/nghệ sĩ/album, độ dài 120s; tạm dừng qua `media-toggle.ps1` → `paused` sau 1.2s (gồm ~1s khởi động PowerShell); tắt nguồn → `current: null` sau 112ms. Tên app: "Windows PowerShell" (bỏ web app, ưu tiên tên chứa tên exe).

**Phụ thuộc:** không
**File dự kiến:** `src-tauri/Cargo.toml`, `src-tauri/src/media/{mod,model,session}.rs`, `src-tauri/src/lib.rs`
**Quy mô:** M

### Task 2: `ShellApi.setHidden`

**Mô tả:**
- **Hợp đồng:** thêm `setHidden(widgetId, hidden)` vào `ShellApi`; shell giữ tập widget ẩn trong snapshot.
- **Hiển thị:** `pickPill`, `pickMidPills` và bố cục panel bỏ qua widget ẩn.
- **Ghi chú:** tab Claude ẩn khi mọi widget Claude đều ẩn, như khi tắt.

**Tiêu chí chấp nhận:**
- [x] Widget ưu tiên bị ẩn: pill hiện widget kế tiếp có pill; hiện lại thì pill trở về.
- [x] Always: một widget ẩn thì chỉ còn một nửa, không vạch ngăn.
- [x] Panel bỏ card widget ẩn; Background của nó vẫn chạy.
- [x] Không widget nào ẩn: mọi test cũ vẫn qua.

**Kiểm tra:** `npm test`, `npm run lint`.

**Phụ thuộc:** không
**File dự kiến:** `src/shell/widget-contract.ts`, `src/shell/shell.ts`, `src/shell/pill-content.ts`, `src/shell/Panel.tsx`, test
**Quy mô:** S

### Task 3: Card "Đang phát" + ảnh bìa + tự ẩn

**Mô tả:**
- **`media_art`:** đọc thumbnail → WIC thu nhỏ ≤280 → PNG data URL, cache theo `trackKey`.
- **Frontend:** `native.ts`, `store.ts`, `progress.ts` (vị trí ước lượng, định dạng thời gian).
- **`MediaCard`:** nhãn + tên app, ảnh bìa 140 (không ảnh thì gradient + nốt nhạc), nền ảnh mờ, tên/nghệ sĩ/album, thanh tiến độ chỉ xem, nút hiển thị (chưa bấm), fade 150ms khi đổi bài.
- **Background:** gọi `setHidden("media", current === null)`.
- **Đăng ký:** widget `media` trong `src/widgets/index.ts`.

**Tiêu chí chấp nhận:**
- [x] Script test đang phát: card đúng tên, tiến độ chạy mỗi giây khi panel mở, ảnh bìa (hoặc gradient).
- [x] Tắt script: card biến mất trong 1 giây, bố cục dồn lại.
- [x] Livestream / không độ dài: ẩn thanh tiến độ.
- [x] Test: `progress.ts`, card theo trạng thái (phát, dừng, không ảnh, không độ dài).

**Kiểm tra:** `npm test`, `cargo test`, `npm run lint`; ảnh chụp card so với mockup.
- 2026-09-17: nguồn thử có ảnh 600×600 (`media-source.ps1 -Artwork`): `media_art` trả PNG 280×280, 11 KB; card đúng tên/nghệ sĩ/album/app, nền ảnh mờ, tiến độ 0:00 → 0:03 sau 3s; tắt nguồn thì card biến mất. Livestream: test component (chưa có nguồn thử).

**Phụ thuộc:** Task 1, Task 2
**File dự kiến:** `src-tauri/src/media/art.rs`, `src/widgets/media/{index.tsx,native.ts,store.ts,progress.ts,MediaCard.tsx,Artwork.tsx,Media.module.css}`, test
**Quy mô:** M

## Checkpoint 1
- [x] Bạn mở nhạc thật (Spotify/YouTube) và xem card: đúng thông tin, ảnh bìa, tiến độ. Bạn xác nhận ảnh bìa đúng (2026-09-17); yêu cầu thêm: media tự lên pill khi các widget khác trống → Task 5.

### Task 4: Điều khiển, tua, đổi app

**Mô tả:**
- **Rust:** `media_control(playPause|next|previous)`, `media_seek(ms)`, `media_select(id|null)`; lựa chọn tay tự bỏ khi Windows đổi phiên hoặc phiên biến mất.
- **`SeekBar`:** bấm/kéo (gửi khi thả), `role="slider"`, ← → 5 giây, hiện vị trí mới ngay.
- **Card:** nút ⏮ ⏯ ⏭ bấm được, mờ khi app không cho; ‹ › khi ≥2 phiên; lăn chuột đổi app.

**Tiêu chí chấp nhận:**
- [x] Script test: ⏯ đổi `playing`↔`paused`; tua đổi vị trí. ⚠️ Tua: app nhận lệnh, nhưng nguồn thử không báo lại vị trí cho Windows → 👤 kiểm tua với Spotify/YouTube.
- [x] Hai phiên test: ‹ › và lăn chuột đổi phiên; tắt phiên đang chọn thì về phiên còn lại.
- [x] Nút mờ và không gửi lệnh khi `can.*` là false.
- [x] Test Rust: chọn phiên tay. Test TS: điểm tua từ chuột, phím, nút gọi đúng lệnh.

**Kiểm tra:** `npm test`, `cargo test`, clippy, lint; thủ công bằng script test.
- 2026-09-17 (bấm nút thật trong card, chế độ click để chuột của bạn không đóng panel): tạm dừng 149ms, phát 250ms; ⏭ mờ (nguồn thử không cho); hai nguồn thử: › đổi phiên 157ms, lăn chuột 128ms; tắt phiên đang hiện → về phiên còn lại 148ms.

**Phụ thuộc:** Checkpoint 1
**File dự kiến:** `src-tauri/src/media/{mod,session,model}.rs`, `src/widgets/media/{SeekBar.tsx,MediaCard.tsx,native.ts,store.ts}`, test
**Quy mô:** M

### Task 5: Pill ưu tiên + nửa always

**Mô tả:**
- **`MediaPill`:** ảnh bìa 24, tên bài, nghệ sĩ mờ, cột sóng CSS (chỉ chạy khi playing, dừng khi giảm chuyển động).
- **`MediaMidPill`:** ảnh bìa 40, tên bài/nghệ sĩ, nút ⏯ (không mở panel).

**Tiêu chí chấp nhận:**
- [x] Chọn Media làm pill ưu tiên: pill hiện đúng; tắt script thì pill về widget kế.
- [x] Always: nửa media đúng thứ tự theo ưu tiên; ⏯ điều khiển được, không mở panel.
- [x] Test component cho cả hai.

**Kiểm tra:** `npm test`, lint; ảnh chụp pill 32/36/40 và always.
- 2026-09-17: thêm quy tắc bạn đề xuất (SPEC-media §5.6): widget ưu tiên trống thì tự ẩn, media đang có phiên lên pill (test `MediaPill.test.tsx`). Trên máy (tạm đặt ưu tiên Media vì bản dev có pill demo): pill 32/36/40 đúng, cột sóng chạy; always: media trước, demo sau, nút ⏸.

**Phụ thuộc:** Task 4
**File dự kiến:** `src/widgets/media/{MediaPill.tsx,MediaMidPill.tsx,index.tsx,Media.module.css}`, test
**Quy mô:** S

### Task 6: Đo, checklist thủ công, so mockup

**Tiêu chí chấp nhận:**
- [x] Bản release, script test đang phát, panel đóng: CPU 0.27–0.31% (trước khi sửa cột sóng: 1.007%); RAM 122 MB, +13 MB so với 109 MB, đi ngang sau vài phút (đo qua đêm ~9 giờ).
- [x] `tests/manual-media.md` theo tiêu chí §11 của spec; phần cần app thật đánh 👤.
- [x] So ảnh card/pill/always với mockup.

**Phụ thuộc:** Task 5
**Quy mô:** S
