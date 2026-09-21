# Spec: clipboard

> **Đổi 21/09 (chủ dự án chốt):** clipboard **không còn nằm trong notch** mà chuyển vào **command bar** — bấm
> Ctrl+Space là thấy block clipboard ngay dưới ô tìm kiếm, y nguyên card trước đây ở notch (tìm, lọc, ghim, xoá,
> tạm dừng). Block chỉ hiện khi ô tìm kiếm còn trống; gõ chữ thì nhường chỗ cho kết quả, vốn đã có mục clipboard
> qua provider. Widget vẫn **bật**, nên provider tìm kiếm và phần chạy nền không đổi. Mọi thứ khác của command bar
> giữ nguyên.


> Module id: `clipboard` (xem `CAPABILITY-MAP.md`). Phụ thuộc: `notch-shell`. Trạng thái: **CHỜ DUYỆT**.
> Nguồn UI: `design/winbar-mockup.html` (card "Clipboard": ô tìm, chip lọc, danh sách item, ghim, kéo ra ngoài).

## 1. Mục tiêu

Lấy lại thứ vừa copy mà không phải copy lại: đoạn text, link, đoạn code, ảnh chụp màn hình.
Lịch sử ngắn hạn, không biến winbar thành kho chứa dữ liệu, và **không** lưu thứ nhạy cảm.

### User stories

- Tôi copy vài thứ, mở notch, bấm vào item cũ là nó quay lại clipboard để dán.
- Tôi gõ vài chữ trong ô tìm để lọc ra item cần, hoặc lọc theo loại (text, link, code, ảnh).
- Tôi ghim item hay dùng để nó không bị dọn.
- Tôi kéo item từ notch thả thẳng vào app khác.
- Tôi copy mật khẩu hoặc API key: winbar **không** lưu.
- Tôi bấm tạm dừng khi làm việc nhạy cảm, xong bật lại.

## 2. Phạm vi

**Trong phạm vi**

| Hạng mục | Ghi chú |
|---|---|
| Bắt clipboard | Text (Unicode) và ảnh (bitmap). Nghe sự kiện của Windows, không hỏi vòng |
| Phân loại | `text` · `link` (chuỗi là URL) · `code` (đoạn nhiều dòng/có dấu hiệu code) · `image` |
| Lưu trữ | **50 mục, 1 ngày** (mặc định). Cài đặt cho kéo dài, **tối đa 2 ngày**. Mục ghim không bị dọn |
| Ảnh | Lưu file gốc trên đĩa + bản thu nhỏ để hiện. Kéo ra ngoài là kéo **file ảnh gốc** |
| Card | Ô tìm, chip lọc, danh sách cuộn, ghim, xóa một mục, xóa tất cả (có xác nhận) |
| Dán lại | Bấm item: đưa lại vào clipboard, pill nháy "Đã copy" (M7) |
| Kéo ra ngoài | **Chỉ ảnh** — kéo thả sang app khác là file ảnh gốc. Text không kéo được (xem §5.5) |
| Bỏ qua nhạy cảm | 4 lớp (§5.4): dấu hiệu của app, mẫu chuỗi key/token, danh sách app, nút tạm dừng |
| Search provider | Tìm trong command bar, tiền tố `cb`; Enter là copy lại |
| Cài đặt | Giữ bao lâu (1 hoặc 2 ngày), danh sách app bỏ qua, nút xóa toàn bộ lịch sử |

**Ngoài phạm vi:** đồng bộ nhiều máy, lịch sử dài hạn, sửa nội dung item, dán không định dạng,
file copy từ Explorer (CF_HDROP) — v1 bỏ qua, ghi chú ở §14; OCR ảnh; định dạng có style (RTF/HTML).

## 3. Tech stack

Không thêm thư viện cho phần bắt clipboard; dùng lại crate `windows` với feature đã có
(`Win32_System_DataExchange` là **feature mới duy nhất**, cần bạn duyệt):

| Việc | Cách làm |
|---|---|
| Nghe clipboard | `AddClipboardFormatListener` trên cửa sổ notch (đã có subclass cho sticky), nhận `WM_CLIPBOARDUPDATE` |
| Đọc/ghi clipboard | `OpenClipboard`, `GetClipboardData`, `SetClipboardData` (`Win32_System_DataExchange`) |
| Ảnh | `CF_DIB` → WIC (đã dùng cho ảnh bìa media) → PNG gốc + thumbnail 160px |
| App đang copy | `GetForegroundWindow` + `QueryFullProcessImageNameW` (feature đã bật) |

**Kéo item ra app khác** đã chốt sau Task 1: chữ dùng kéo HTML5 sẵn có của WebView2; **file ảnh** cần kéo kiểu
Windows (`DoDragDrop` + `CF_HDROP`) nên dùng crate `tauri-plugin-drag` 2.1.1 — **bạn đã đồng ý 18/09/2026**.

## 4. Lệnh

Như các module trước: `npm test` · `cargo test --manifest-path src-tauri/Cargo.toml` · `npm run lint` · `npm run tauri dev`.

## 5. Hành vi

### 5.1 Bắt và phân loại

- Mỗi lần clipboard đổi: đọc text hoặc ảnh, bỏ qua nếu trùng item mới nhất.
- Text rỗng hoặc chỉ khoảng trắng: bỏ qua. Text dài hơn 100 KB: cắt còn 100 KB và đánh dấu "đã cắt".
- Loại:
  - `link`: cả chuỗi là một URL `http(s)://…`;
  - `code`: nhiều dòng **và** có dấu hiệu code (`{}`, `;`, `=>`, `def `, `function`, thụt đầu dòng đều), hoặc một dòng bắt đầu bằng lệnh quen (`git `, `npm `, `cargo `, `docker `);
  - `image`: clipboard có bitmap;
  - còn lại là `text`.
- Ảnh: lưu PNG gốc vào `%APPDATA%\winbar\clipboard\images\<id>.png`, kèm thumbnail 160px `thumbs\<id>.png`.
  Ảnh lớn hơn 20 MB sau khi mã hóa PNG: bỏ qua, ghi log.

### 5.2 Lưu trữ và dọn

- File `%APPDATA%\winbar\clipboard\index.json`: danh sách mục (id, loại, thời điểm, preview ≤ 200 ký tự, ghim, app nguồn, đường dẫn ảnh).
- Nội dung text đầy đủ nằm trong `index.json` luôn (đã cắt ở 100 KB).
- Dọn khi: quá **50 mục** (bỏ mục cũ nhất) hoặc quá **hạn giữ** (1 ngày, cài đặt tối đa 2 ngày).
- **Mục ghim không bị dọn** và không tính vào 50 mục.
- Dọn chạy lúc khởi động và sau mỗi lần thêm mục; file ảnh của mục bị dọn thì xóa theo.
- Ghi file theo kiểu ghi tạm rồi đổi tên, như `settings.json` và lịch sử command bar.

### 5.3 Card (theo mockup)

```
CLIPBOARD                         Kéo item ra app khác
[ 🔍 Tìm trong clipboard…                          ]
( Tất cả )( Text )( Link )( Code )( Ảnh )      ⏸ Tạm dừng
┌ 📝 Gửi lại bản brief cho freelancer…      📌  2m ┐
│ 🔗 https://github.com/laurennguyen1304/…     9m │
│ ⌨  git worktree add ../firefish -b firefish  14m │
│ 🖼 [thumb] Ảnh chụp màn hình · 1920×1080     1h │
└──────────────────────────────────────────────────┘
```

- Card `tall` (chiếm một cột), như bố cục mockup.
- Mỗi dòng: icon theo loại (ảnh thì thumbnail 84×52), preview một dòng, dấu ghim, thời gian tương đối.
- Bấm dòng: copy lại, dòng nháy "Đã copy" 1.2 giây, pill nháy "Đã copy" (M7/M8).
- Hover dòng: hiện nút ghim và nút xóa ở bên phải.
- Ô tìm: lọc ngay khi gõ, không dấu cũng tìm được.
- Chip lọc: Tất cả · Text · Link · Code · Ảnh.
- Nút "Tạm dừng": đang tạm dừng thì đổi màu và ghi "Đang tạm dừng".
- Danh sách rỗng: "Chưa có gì trong clipboard" hoặc "Không có item khớp".

### 5.4 Bỏ qua nội dung nhạy cảm

Bốn lớp, chạy theo thứ tự; dính lớp nào là **không lưu** (và không ghi nội dung ra log):

1. **Dấu hiệu của app:** clipboard có một trong các format `ExcludeClipboardContentFromMonitorProcessing`,
   `CanIncludeInClipboardHistory` (giá trị 0), `CanUploadToCloudClipboard` (giá trị 0). Trình quản lý mật khẩu đặt cờ này.
2. **Mẫu chuỗi giống key/token** (bạn chốt: bỏ qua hết):
   - tiền tố quen: `sk-`, `pk_`, `ghp_`, `gho_`, `github_pat_`, `xox[abpr]-`, `AKIA`, `ASIA`, `AIza`, `ya29.`, `hf_`, `Bearer `;
   - JWT: ba đoạn base64url ngăn bởi dấu chấm, đoạn đầu bắt đầu `eyJ`;
   - khóa riêng: chứa `-----BEGIN ... PRIVATE KEY-----`;
   - chuỗi một dòng dài ≥ 32 ký tự chỉ gồm base64/hex và có đủ lộn xộn (có cả chữ hoa, chữ thường, số);
   - dòng có dạng `password=`, `secret=`, `token=`, `api_key=` (không phân biệt hoa thường).
3. **Danh sách app bỏ qua:** app đang ở tiền cảnh lúc copy nằm trong danh sách (mặc định: KeePass, KeePassXC,
   1Password, Bitwarden, Proton Pass, Dashlane, LastPass, Windows Credential Manager). Sửa được trong Cài đặt.
4. **Tạm dừng:** người dùng bấm tạm dừng thì không ghi gì cho tới khi bật lại (trạng thái nhớ qua lần mở sau).

Khi bỏ qua vì lớp 2 hoặc 3, card hiện dòng mờ "Đã bỏ qua một mục nhạy cảm" trong 3 giây, **không** kèm nội dung.

### 5.5 Kéo ra app khác — **chỉ ảnh**

- **Ảnh**: kéo ra là **file ảnh gốc** trên đĩa (`DoDragDrop` + `CF_HDROP` qua `tauri-plugin-drag`). Trong lúc kéo,
  panel không tự thu gọn.
- **Text / link / code: không kéo được.** Bản đầu có gắn kéo HTML5 với giả định WebView2 sẽ chuyển tiếp ra
  Windows. **Nó không chuyển** — kéo một dòng text không xảy ra gì cả. Chủ dự án thử trên máy thật ngày 20/09, nói
  không cần kéo text, chỉ cần **bấm để copy** là đủ. Nên dòng text **không còn nhận `draggable`** và con trỏ là
  mũi tên thường chứ không phải bàn tay: một lời mời hỏng còn tệ hơn là không mời. Bỏ luôn phần đọc trước nội
  dung khi rê chuột — trước đây rê qua một dòng là đọc **toàn bộ** nội dung của nó vào trang, phòng khi có kéo.
- File ảnh kéo bằng `tauri-plugin-drag` (chốt sau Task 1); chữ vẫn là kéo HTML5 thường.

### 5.6 Trong command bar

- Provider `clipboard`, nhóm "Clipboard", tiền tố `cb`, hiện trong kết quả mặc định (tối đa 4 dòng).
- Tìm theo preview, không dấu cũng được; ảnh tìm theo tên ("ảnh", "screenshot") và kích thước.
- Enter: copy lại và đóng command bar. Ctrl+Enter với ảnh: mở file ảnh.
- **Không** ghi item clipboard vào "Gần đây" (`remember: false`), vì nội dung có thể riêng tư.

## 6. Hợp đồng

```ts
// src/widgets/clipboard/native.ts
export type ClipKind = "text" | "link" | "code" | "image";
export interface ClipItem {
  id: string;
  kind: ClipKind;
  /** Một dòng, ≤ 200 ký tự, đã cắt. */
  preview: string;
  /** Thời điểm copy (epoch ms). */
  at: number;
  pinned: boolean;
  /** Tên app đã copy, nếu biết. */
  app?: string;
  /** Ảnh: kích thước gốc và đường dẫn file. */
  image?: { width: number; height: number; path: string; thumb: string };
  /** Text đã bị cắt vì quá dài. */
  truncated?: boolean;
}
```

| Lệnh / sự kiện | Việc |
|---|---|
| `clipboard_list()` → `ClipItem[]` | Danh sách hiện tại, mới nhất trước |
| sự kiện `clipboard-changed` | Có mục mới, bị xóa, hoặc đổi ghim |
| `clipboard_copy(id)` | Đưa mục đó lại vào clipboard |
| `clipboard_pin(id, pinned)` | Ghim / bỏ ghim |
| `clipboard_remove(id)` | Xóa một mục (xóa cả file ảnh) |
| `clipboard_clear()` | Xóa tất cả trừ mục ghim |
| `clipboard_pause(paused)` / `clipboard_paused()` | Tạm dừng ghi |
| `clipboard_text(id)` → `string` | Nội dung đầy đủ khi cần kéo/copy |
| sự kiện `clipboard-skipped` | Vừa bỏ qua một mục nhạy cảm (không kèm nội dung) |

## 7. Cài đặt

| Trường | Giá trị | Mặc định |
|---|---|---|
| `clipboard.retentionDays` | `1` · `2` | `1` |
| `clipboard.maxItems` | 50 (cố định ở v1, không hiện trong Cài đặt) | `50` |
| `clipboard.ignoredApps` | danh sách tên exe | 8 app quản lý mật khẩu ở §5.4 |
| `clipboard.paused` | bool | `false` |

Trong Cài đặt: mục "Clipboard" với thời gian giữ, danh sách app bỏ qua (thêm/xóa), nút "Xóa toàn bộ lịch sử" (xác nhận).

## 8. Cấu trúc thư mục

```
src-tauri/src/clipboard/
  mod.rs        lệnh Tauri, state, phát sự kiện
  watcher.rs    nghe WM_CLIPBOARDUPDATE, đọc clipboard (cfg(windows))
  model.rs      phân loại, cắt preview, dọn theo số mục/hạn giữ (thuần, có test)
  secrets.rs    nhận diện key/token, cờ của app (thuần, có test)
  store.rs      đọc/ghi index.json, file ảnh
src/widgets/clipboard/
  index.tsx     WidgetDefinition: Card (tall) + search provider
  ClipboardCard.tsx · ClipRow.tsx · Clipboard.module.css
  native.ts · store.ts · filter.ts (lọc, tìm không dấu — thuần, có test)
src/settings/ClipboardSection.tsx
```

## 9. Phong cách code

Như các module trước. Không bao giờ `println!`/`console.log` nội dung clipboard; log chỉ ghi id, loại, độ dài.

## 10. Kiểm thử

| Mức | Nội dung |
|---|---|
| Rust | phân loại text/link/code; cắt preview; dọn theo 50 mục và theo hạn giữ, giữ mục ghim; nhận diện key/token (nhiều mẫu thật và mẫu dễ nhầm); đọc/ghi index hỏng |
| TS thuần | lọc theo chip + ô tìm không dấu; thời gian tương đối ("2m", "1h") |
| Component | danh sách, ghim, xóa, xóa tất cả (xác nhận), tạm dừng, dòng "đã bỏ qua", trạng thái rỗng |
| Command bar | provider trả đúng dòng, `remember: false` |
| Thủ công | `tests/manual-clipboard.md`: copy text/link/code/ảnh thật, kéo ra Notepad và Explorer, thử với trình quản lý mật khẩu |

## 11. Tiêu chí hoàn thành

1. Copy một đoạn text: trong 1 giây item hiện đầu danh sách, đúng loại.
2. Copy link, đoạn code, ảnh chụp màn hình: đúng loại; ảnh có thumbnail và kích thước.
3. Bấm item: clipboard đổi thành nội dung đó (dán ra Notepad đúng), pill nháy "Đã copy".
4. Ghim: mục ghim vẫn còn sau khi vượt 50 mục và sau khi quá hạn giữ.
5. Dọn: quá 50 mục thì mục cũ nhất biến mất; đổi hạn giữ 1 ↔ 2 ngày trong Cài đặt có tác dụng ngay.
6. Kéo: text thả vào Notepad ra đúng chữ; ảnh thả vào Explorer ra file ảnh (hoặc kết luận rõ nếu không làm được, §14).
7. Nhạy cảm: copy từ trình quản lý mật khẩu **không** vào lịch sử; copy chuỗi `sk-…`, JWT, `password=…` cũng không; card báo đã bỏ qua.
8. Tạm dừng: không ghi gì; bật lại thì ghi tiếp; trạng thái nhớ sau khi khởi động lại.
9. Command bar: `cb` + từ khóa ra đúng item, Enter copy lại, không xuất hiện trong "Gần đây".
10. Riêng tư: `index.json` không chứa nội dung bị bỏ qua; log không có nội dung clipboard.
11. Hiệu năng (bản release, 50 mục có 5 ảnh): RAM tăng ≤ 15 MB; panel đóng CPU như trước module.
12. `npm test`, `cargo test`, clippy, `npm run lint` qua; checklist thủ công chạy xong.

## 12. Rủi ro

| Rủi ro | Mức | Cách xử lý |
|---|---|---|
| ~~Kéo file ảnh ra ngoài không làm được trong WebView2~~ | — | Đã chốt: dùng `tauri-plugin-drag` 2.1.1 (bạn đồng ý 18/09/2026) |
| Nhận nhầm nội dung thường là key rồi bỏ qua | Trung bình | Mẫu bám vào tiền tố/độ dài/độ lộn xộn; test nhiều chuỗi dễ nhầm (hash git, base64 ngắn, câu tiếng Việt) |
| Bỏ sót nội dung nhạy cảm | Cao | 4 lớp; lớp 1 theo đúng cờ Windows; có nút tạm dừng; ghi rõ giới hạn trong checklist |
| Ảnh làm phình RAM/đĩa | Trung bình | Chỉ giữ thumbnail trong bộ nhớ; ảnh gốc nằm trên đĩa; giới hạn 20 MB mỗi ảnh, 50 mục, 1–2 ngày |
| Đọc clipboard lúc app khác đang giữ | Trung bình | Thử lại 3 lần cách 50ms rồi bỏ qua; không chặn luồng giao diện |
| Vòng lặp: winbar copy lại rồi tự bắt chính mình | Trung bình | Bỏ qua lần đổi ngay sau khi winbar tự ghi clipboard (so id + nội dung) |

## 13. Giới hạn khi làm

- **Luôn:** test trước khi commit; mỗi task một commit; kiểm trên app thật; giữ nội dung clipboard ra khỏi log và ảnh chụp.
- **Hỏi trước:** thêm crate (`tauri-plugin-drag` đã được đồng ý); thêm feature `windows` ngoài `Win32_System_DataExchange`, `Win32_System_Memory`, `Win32_System_Ole`; đổi hạn giữ quá 2 ngày.
- **Không:** đọc clipboard khi đang tạm dừng; gửi nội dung đi đâu; ghi nội dung ra log.

## 14. Quyết định đã chốt và câu hỏi còn mở

Bạn đã chốt (2026-09-18):
- Giữ **50 mục trong 1 ngày**; Cài đặt cho kéo dài, **tối đa 2 ngày**.
- Ảnh: hiện **bản thu nhỏ**, kéo ra là **file ảnh gốc**.
- Bỏ qua nhạy cảm bằng **cả 4 lớp**, trong đó "bỏ qua hết những chuỗi trông giống key, token".

Cần bạn duyệt cùng spec:
- Bật feature `Win32_System_DataExchange` cho crate `windows`.
- **Mục ghim không bị dọn và không tính vào 50 mục** — mình đề xuất vậy, bạn OK không?
- File copy từ Explorer (CF_HDROP): v1 **bỏ qua**, chỉ text và ảnh. Có cần không?
