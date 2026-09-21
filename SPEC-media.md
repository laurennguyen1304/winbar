# Spec: media

> Module id: `media` (xem `CAPABILITY-MAP.md`). Phụ thuộc: `notch-shell`. Trạng thái: **ĐÃ DUYỆT (2026-09-17)**.
> Nguồn UI: `design/winbar-mockup.html` (card "Đang phát", pill media, nửa media của pill always).
> Tham khảo hành vi: widget media của yasb fork (`src/core/widgets/services/media/media.py`), không copy code.

## 1. Mục tiêu

Hiện bài đang phát trên máy ngay trong notch và điều khiển được mà không phải mở app phát nhạc.
Nguồn là phiên media của Windows (cùng nguồn với bảng media khi bấm phím âm lượng), nên chạy với Spotify,
trình duyệt (YouTube, SoundCloud…), Apple Music, VLC… miễn là app báo cho Windows.

### User stories

- Nhạc đang phát thì card "Đang phát" hiện ảnh bìa, tên bài, nghệ sĩ, album, tiến độ, và nút ⏮ ⏯ ⏭.
- Tôi bấm hoặc kéo trên thanh tiến độ để tua.
- Có nhiều app cùng có nhạc thì notch theo app Windows đang chọn; tôi đổi sang app khác ngay trong card.
- Tôi chọn Media làm pill ưu tiên: pill hiện ảnh bìa nhỏ, tên bài, nghệ sĩ và ba nút ⏮ ⏯ ⏭ bấm được ngay.
- Ở mode always, nửa media có ảnh bìa, tên bài, nghệ sĩ và ba nút ⏮ ⏯ ⏭.
- Không có app nào có nhạc thì media biến mất hẳn: không card trống, pill nhường widget kế tiếp.

## 2. Phạm vi

**Trong phạm vi**

| Hạng mục | Ghi chú |
|---|---|
| Nguồn dữ liệu | WinRT `GlobalSystemMediaTransportControlsSessionManager` trong Rust |
| Thông tin bài | Tên bài, nghệ sĩ, album, ảnh bìa, trạng thái phát, vị trí/độ dài, tên app |
| Điều khiển | Phát/tạm dừng, bài kế, bài trước, tua; nút mờ và không bấm được khi app không cho |
| Nhiều app | Theo phiên Windows chọn; đổi tay bằng nút ‹ › hoặc lăn chuột trên card (§5.3) |
| Card | **Hai hàng** (chủ dự án chốt 20/09): ảnh bìa chiếm riêng hàng trên, phía dưới là tên bài / nghệ sĩ / album, thanh tua và ba nút. **Ảnh lấp đủ bề ngang** (21/09) thay vì vuông cố định 132 để lại khoảng trống hai bên: rộng bằng card, cao bằng phần hàng còn thừa (tối thiểu 120), cắt vừa khung. Ảnh không bao giờ làm panel cao thêm — nó chỉ ăn chỗ còn trống. Nền card vẫn là ảnh bìa làm mờ |
| Pill ưu tiên | Ảnh bìa 24, tên bài, nghệ sĩ, nút ⏮ ⏯ ⏭ |
| Pill always | Ảnh bìa 40, tên bài, nghệ sĩ, nút ⏮ ⏯ ⏭ |
| Tự ẩn | Không có phiên nào thì ẩn card, pill và nửa always |
| Mở rộng hợp đồng widget | `ShellApi.setHidden` (§6), cần cho tự ẩn; dùng lại được cho các widget sau |

**Ngoài phạm vi:** lệnh media trong command bar (bạn chọn không), âm lượng, shuffle/repeat, lời bài hát,
danh sách phát, phím media toàn cục (Windows đã có), mở app phát nhạc khi bấm vào card.

## 3. Tech stack

Không thêm thư viện. Chỉ bật thêm feature cho crate `windows` 0.61 đang dùng (**cần bạn duyệt**, xem §14):

| Feature | Dùng cho |
|---|---|
| `Media_Control` | `GlobalSystemMediaTransportControlsSessionManager` và các session |
| `Foundation`, `Foundation_Collections` | `IAsyncOperation`, `TypedEventHandler`, danh sách session |
| `Storage_Streams` | Đọc ảnh bìa (`IRandomAccessStreamReference`) |

Ảnh bìa thu nhỏ bằng WIC (đã có trong `command_bar/icons.rs`) về PNG tối đa 280×280, gửi lên dạng data URL.

## 4. Lệnh

Như notch-shell: `npm test` · `cargo test --manifest-path src-tauri/Cargo.toml` · `npm run lint` · `npm run tauri dev`.

## 5. Hành vi

### 5.1 Dữ liệu và cập nhật

- Rust giữ một luồng WinRT riêng. Nó nghe **sự kiện**, không hỏi định kỳ:
  - trên manager: `SessionsChanged`, `CurrentSessionChanged`;
  - trên từng session: `MediaPropertiesChanged`, `PlaybackInfoChanged`, `TimelinePropertiesChanged`.
- Mỗi lần có thay đổi, Rust phát sự kiện `media-changed` với ảnh chụp trạng thái (§6.2). Frontend không gọi lặp.
- Ảnh bìa chỉ đọc lại khi bài đổi (so tên bài + nghệ sĩ + album + app), và gửi qua lệnh riêng `media_art`
  để sự kiện nhỏ gọn.
- **Tiến độ:** Windows chỉ báo vị trí thỉnh thoảng. Frontend tự tính
  `vị trí = vị trí đã báo + (bây giờ − lúc báo) × tốc độ phát`, chỉ khi đang phát, và kẹp trong `[0, độ dài]`.
  - Chỉ chạy đồng hồ 1 giây/lần, **và chỉ khi panel đang mở**. Pill không hiện tiến độ nên không tốn CPU khi thu gọn.
- **Ẩn thanh tiến độ** khi app không báo độ dài, độ dài bằng 0 hoặc từ 7 ngày trở lên (livestream).
- App đang khởi động có thể chưa trả thông tin: bỏ qua lỗi, đợi sự kiện kế tiếp.

### 5.2 Giao diện

| Chỗ | Nội dung | Khi tạm dừng | Khi không có ảnh bìa |
|---|---|---|---|
| Card | Nhãn "Đang phát" + tên app (và ‹ › nếu có ≥2 app); ảnh bìa 140; tên bài 16px, nghệ sĩ, album; thanh tiến độ + `1:42 / 4:03`; ⏮ ⏯ ⏭ | nút hiện ▶ | ô gradient + nốt nhạc; nền card không có ảnh |
| Pill ưu tiên | ảnh bìa 24 · tên bài · nghệ sĩ (mờ) · **nút ⏮ ⏯ ⏭** | nút giữa thành ▶ | ô gradient nhỏ |
| Nửa always | ảnh bìa 40 · tên bài / nghệ sĩ · nút ⏮ ⏯ ⏭ | nút giữa thành ▶ | ô gradient |

- Thời gian: `m:ss`, từ 1 giờ trở lên là `h:mm:ss`.
- Tên dài cắt bằng `…`, không chạy chữ.
- Đổi bài: ảnh bìa và chữ mờ dần 150ms (M10 bản v1, không trượt).
- **Đổi 2026-09-18 (bạn chốt):** bỏ cột sóng ở trạng thái thu gọn, thay bằng ba nút điều khiển ngay trên notch. Nhờ vậy notch không vẽ lại liên tục: CPU khi panel đóng về mức nghỉ (~0.02%).
- Bấm nút trên pill hoặc nửa always **không** mở panel (như các nút widget khác).

### 5.3 Nhiều app

- Mặc định hiện phiên Windows chọn (`GetCurrentSession`) và theo khi Windows đổi (`CurrentSessionChanged`).
- Đổi tay:
  - ‹ › cạnh tên app trên card (chỉ hiện khi có ≥2 phiên);
  - lăn chuột trên card: xuống là app kế, lên là app trước.
- Lựa chọn tay giữ tới khi:
  - Windows đổi phiên hiện tại, hoặc
  - app đã chọn không còn phiên, lúc đó quay về phiên Windows chọn, rồi phiên đầu tiên.
- Tên app:
  - lấy tên hiển thị từ danh sách app (AppsFolder, như command bar), ví dụ "Spotify", "Google Chrome";
  - không tìm thấy thì dùng tên file exe bỏ `.exe`.

### 5.4 Tua

- Chỉ tua được khi app cho phép (`IsPlaybackPositionEnabled`) và có độ dài hợp lệ.
- Bấm vào thanh tiến độ tua tới điểm đó. Kéo thì thanh chạy theo tay, và chỉ gửi lệnh tua khi thả.
- Sau khi tua, hiện ngay vị trí mới (không đợi app báo lại). Nếu app báo vị trí khác thì theo app.
- Bàn phím: thanh tiến độ là `role="slider"`, ← → tua 5 giây.

### 5.5 Tự ẩn

- Có ít nhất một phiên (đang phát **hoặc** tạm dừng) thì hiện. Không còn phiên nào thì ẩn.
- Ẩn nghĩa là:
  - panel không có card media, bố cục tự dồn lại;
  - media là pill ưu tiên thì pill hiện widget kế tiếp có pill;
  - mode always chỉ hiện nửa còn lại.

### 5.6 Media tự lên pill (bạn đề xuất 2026-09-17)

- Pill vẫn ưu tiên widget bạn chọn. Nếu widget đó (và các widget đứng trước media) **trống** thì chúng tự ẩn, và media đang có phiên lên pill. Mode always cũng vậy.
- Không có nhạc và các widget khác trống: pill mặc định "winbar · Ctrl+Space".
- Quy ước cho mọi widget (ghi thêm vào hợp đồng §6.1): widget **không có gì để hiện** thì gọi `setHidden(id, true)`, không hiện pill rỗng. Ví dụ `claude-sessions` sau này ẩn khi không có phiên Claude nào.

## 6. Hợp đồng

### 6.1 Mở rộng hợp đồng widget (notch-shell)

```ts
export interface ShellApi {
  // …có sẵn…
  /** Ẩn/hiện widget này ở mọi chỗ (card, pill, nửa always) mà không tắt nó trong Cài đặt. Background vẫn chạy. */
  setHidden(widgetId: WidgetId, hidden: boolean): void;
}
```

- Shell giữ tập widget đang ẩn trong snapshot, và `pickPill`, `pickMidPills`, bố cục panel bỏ qua chúng.
- Widget mới bật mặc định **hiện**. Media gọi `setHidden("media", true)` ngay khi biết không có phiên.
- Quy ước: widget không có gì để hiện thì tự ẩn, để widget kế tiếp (ví dụ media) được lên pill (§5.6).

### 6.2 Rust ↔ frontend

```ts
// src/widgets/media/native.ts
export interface MediaSession {
  id: string;            // AppUserModelId của app
  appName: string;
}
export interface MediaState {
  sessions: MediaSession[];
  /** Phiên đang hiện (Windows chọn hoặc chọn tay); null = không có phiên nào. */
  current: null | {
    sessionId: string;
    title: string; artist: string; album: string;
    /** Đổi khi bài đổi; dùng để biết lúc nào gọi media_art. */
    trackKey: string;
    status: "playing" | "paused" | "stopped" | "other";
    positionMs: number | null; durationMs: number | null;
    /** Thời điểm (epoch ms) Windows báo positionMs. */
    positionAt: number;
    rate: number;
    can: { playPause: boolean; next: boolean; previous: boolean; seek: boolean };
  };
}
```

| Lệnh / sự kiện | Việc |
|---|---|
| `media_state()` → `MediaState` | Trạng thái lúc mở app |
| sự kiện `media-changed` (`MediaState`) | Mỗi lần có thay đổi |
| `media_art(trackKey)` → `string \| null` | Data URL PNG ≤ 280×280 của bài hiện tại; `null` nếu app không có ảnh hoặc bài đã đổi |
| `media_control(action)` | `"playPause" \| "next" \| "previous"`; lỗi nếu app không cho |
| `media_seek(positionMs)` | Tua phiên hiện tại |
| `media_select(sessionId \| null)` | Chọn tay; `null` = theo Windows |

## 7. Cài đặt

Không thêm cài đặt riêng. Bật/tắt, thứ tự card và "Pill ưu tiên hiện: Media" dùng mục Widget/Pill có sẵn.

## 8. Cấu trúc thư mục

```
src-tauri/src/media/
  mod.rs          lệnh Tauri, state, phát sự kiện
  session.rs      WinRT: manager, session, sự kiện, điều khiển (cfg(windows))
  model.rs        MediaState, chọn phiên, trackKey, kiểm độ dài hợp lệ, tên app (thuần, có test)
  art.rs          đọc ảnh bìa → WIC thu nhỏ → PNG data URL
src/widgets/media/
  index.tsx       WidgetDefinition: Card, Pill, MidPill, Background
  native.ts       gọi lệnh / nghe sự kiện
  store.ts        trạng thái + ảnh bìa (useSyncExternalStore)
  progress.ts     tính vị trí, định dạng thời gian, tua (thuần, có test)
  MediaCard.tsx · MediaPill.tsx · MediaMidPill.tsx · SeekBar.tsx · Artwork.tsx
  Media.module.css
  *.test.ts(x)
```

## 9. Phong cách code

Như notch-shell và command-bar: comment ngắn tiếng Anh, hàm thuần tách riêng để test, Rust bọc WinRT trong
`cfg(windows)`, lỗi WinRT trả `Result<_, String>` và không làm sập app.

```ts
/** Estimated playback position now, clamped to the track (SPEC-media §5.1). */
export function positionNow(s: TimelineSnapshot, now: number): number | null {
  if (s.positionMs === null || s.durationMs === null) return null;
  const moved = s.status === "playing" ? (now - s.positionAt) * s.rate : 0;
  return Math.min(Math.max(s.positionMs + moved, 0), s.durationMs);
}
```

## 10. Kiểm thử

| Mức | Nội dung |
|---|---|
| Rust (`cargo test`) | chọn phiên (tay/Windows/app biến mất), `trackKey`, độ dài hợp lệ, tên app từ AUMID/exe, thu nhỏ ảnh |
| TS thuần | `positionNow`, định dạng thời gian, điểm tua từ vị trí chuột, bước ← → |
| Component | card/pill/always theo trạng thái (phát, tạm dừng, không ảnh, không tua được, ≥2 app); nút gọi đúng lệnh; bấm nút pill không mở panel |
| Shell | `setHidden`: pill nhường widget kế, always còn một nửa, panel bỏ card |
| Thủ công | `tests/manual-media.md`: Spotify, YouTube trên Chrome/Edge, app không có ảnh, livestream, tắt app giữa chừng |

## 11. Tiêu chí hoàn thành

1. Phát nhạc trên Spotify: trong 1 giây card hiện đúng tên bài, nghệ sĩ, album, ảnh bìa.
2. Đổi bài trên Spotify hoặc bằng phím media: notch đổi trong 1 giây, có hiệu ứng mờ 150ms.
3. ⏮ ⏯ ⏭ trên card, và ⏯ ở nửa always, điều khiển đúng app; nút mờ khi app không cho.
4. Tiến độ chạy đúng khi panel mở (lệch ≤ 1 giây so với app sau 3 phút). Tua bằng bấm, kéo và phím ← →.
5. YouTube trên trình duyệt: hiện tên video và kênh. Livestream thì ẩn thanh tiến độ.
6. Spotify và YouTube cùng mở: theo phiên Windows chọn; ‹ › và lăn chuột đổi được. Tắt app đang chọn thì quay về phiên còn lại.
7. Tắt hết app phát nhạc: trong 1 giây card, pill media và nửa always biến mất; pill hiện widget kế tiếp.
8. App không có ảnh bìa: hiện ô gradient + nốt nhạc, không vỡ bố cục.
9. Pill media: ba nút ⏮ ⏯ ⏭ bấm được ngay khi notch thu gọn, và bấm nút **không** mở panel.
10. Hiệu năng (bản release, nhạc đang phát, panel đóng): CPU < 1%. RAM tăng ≤ 15 MB so với trước module.
11. `npm test`, `cargo test`, clippy, `npm run lint` qua; checklist thủ công chạy xong.

## 12. Rủi ro

| Rủi ro | Mức | Cách xử lý |
|---|---|---|
| Sự kiện WinRT chạy trên luồng lạ, dễ deadlock với main thread | Trung bình | Luồng WinRT riêng; handler chỉ gom thay đổi rồi phát sự kiện, không gọi ngược vào cửa sổ. Spike ở Task 1 |
| App báo vị trí thất thường (trình duyệt) | Trung bình | Chỉ nhận vị trí khi thời điểm báo mới hơn; frontend tự ước lượng giữa hai lần báo |
| ~~Cột sóng chạy liên tục tốn CPU~~ | — | Đã bỏ cột sóng (2026-09-18); pill giờ chỉ có nút, không có animation |
| Ảnh bìa lớn làm tăng RAM | Thấp | Thu nhỏ 280px trong Rust, chỉ giữ ảnh bài hiện tại |
| `setHidden` đụng logic pill/always đã ổn định | Thấp | Test shell riêng ở Task đầu; không đổi hành vi khi không widget nào ẩn |

## 13. Giới hạn khi làm

- **Luôn:** test trước khi commit; mỗi task một commit; kiểm trên app thật; không gửi phím media thật khi bạn đang nghe nhạc mà chưa báo.
- **Hỏi trước:** thêm crate/thư viện; đổi hợp đồng widget ngoài `setHidden`; thêm cài đặt.
- **Không:** ghi vào registry hay cài đặt Windows; điều khiển nhạc của bạn trong lúc test mà không có nhạc thử (dùng tab test riêng).

## 14. Quyết định đã chốt và câu hỏi còn mở

Bạn đã chốt (2026-09-17):
- Nhiều app: theo Windows, đổi tay được.
- Thanh tiến độ: bấm/kéo để tua.
- Không có nhạc: ẩn hết, pill nhường widget kế.
- Command bar: không thêm lệnh media.

Cần bạn duyệt cùng spec:
- Bật thêm feature `Media_Control`, `Foundation`, `Foundation_Collections`, `Storage_Streams` cho crate `windows` (§3).
- Mở rộng hợp đồng widget bằng `ShellApi.setHidden` (§6.1).
