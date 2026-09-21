# Spec: command-bar

> **Thêm 21/09:** khi ô tìm kiếm trống, dưới "Gần đây" hiện **block của các widget đang bật** có khai
> `CommandBarBlock` trong hợp đồng widget — hiện chỉ có clipboard. Command bar không biết tên widget nào; widget tự
> khai block của mình. Gõ chữ thì block ẩn đi để nhường chỗ cho kết quả.


> Module id: `command-bar` (xem `CAPABILITY-MAP.md`). Phụ thuộc: `notch-shell`. Trạng thái: **ĐÃ DUYỆT (2026-09-17)**.
> UI chuẩn: phần **Command bar** trong `design/winbar-mockup.html`. Hành vi tham khảo: Quick Launch của yasb fork.

## 1. Mục tiêu

Một ô tìm kiếm nổi, mở bằng phím tắt ở bất kỳ app nào. Gõ vài chữ rồi Enter để:
- mở app,
- mở file,
- tính phép tính,
- đổi đơn vị,
- tìm trên web,
- chạy hành động của winbar và của widget.

Command bar thay thế Quick Launch của yasb.

### User stories

- Tôi nhấn `Ctrl+Space` ở bất kỳ đâu. Command bar hiện ngay, con trỏ đã nằm trong ô nhập.
- Tôi gõ "code" rồi Enter: VS Code mở; command bar vẫn nằm đó cho tới khi tôi quay lại nó và bấm Esc.
- Tôi gõ "brief" và thấy file brief trong máy. Enter mở file, Ctrl+Enter mở thư mục chứa file.
- Tôi gõ `12*7+3` và thấy `= 87`. Enter copy kết quả.
- Tôi gõ `5 km to mi` và thấy `3.107 mi`. Enter copy.
- Tôi gõ `? tauri window` rồi Enter: trình duyệt mở trang tìm Google.
- Chưa gõ gì thì tôi thấy những thứ mở gần đây.
- Tôi kéo command bar sang chỗ khác. Lần sau nó mở đúng chỗ đó.
- Khi đã có module clipboard, gõ `cb` là tìm lịch sử clipboard. Tắt widget clipboard thì nguồn này biến mất.

## 2. Phạm vi

**Trong phạm vi**

| Hạng mục | Ghi chú |
|---|---|
| Cửa sổ command bar | Cửa sổ riêng: không viền, trong suốt, luôn nằm trên, không hiện trên taskbar. Mở thì lấy focus. Tạo sẵn và ẩn lúc app khởi động để mở nhanh |
| Mở / đóng | Phím tắt `hotkeys.commandBar` và mục "Command bar" ở menu khay: mở, hoặc đưa lên trước nếu đang mở. **Chỉ đóng khi bấm Esc lúc command bar đang có focus** (và ô trống). Click ra ngoài, chuyển app, chạy kết quả đều không đóng |
| Kéo và nhớ vị trí | Kéo bằng tay nắm ⠿. Lưu vị trí khi thả chuột. Chỗ đã lưu không còn nằm trên màn hình nào thì dùng vị trí mặc định |
| Nguồn **App** | Mọi app trong Start (app desktop + app Store), có icon thật |
| Nguồn **File** | Everything nếu đang chạy, không có thì Windows Search index |
| Nguồn **Máy tính** | Tự nhận biểu thức, hoặc gõ `=` ở đầu |
| Nguồn **Đổi đơn vị** | `5 km to mi`, `30 c to f`, `2 gb sang mb` |
| Nguồn **Tìm web** | Gõ `?` ở đầu. Là dòng cuối cùng khi không có kết quả nào |
| Nguồn **Hành động winbar** | Mở notch, mở tab Claude, Cài đặt winbar, Ẩn/Hiện notch, Thoát winbar |
| Nguồn từ widget | Command bar thu thập `searchProvider` của mọi widget đang bật (mục 6) |
| "Gần đây" | Ô trống thì hiện tối đa 8 mục vừa chạy, xếp theo tần suất + độ mới |
| Cài đặt | Mục **Command bar** trong cửa sổ Cài đặt (mục 7) |

**Ngoài phạm vi**
- Chưa làm ở module này:
  - nội dung provider clipboard (module `clipboard` làm),
  - Task Manager và nút nguồn (module `system` làm),
  - chuyển cửa sổ, emoji, tiền tệ, SSH/WSL và các provider khác của yasb.
- Menu chuột phải trên kết quả. v1 chỉ có phím tắt Ctrl+Enter.
- Tìm nội dung bên trong file (chỉ tìm theo tên).
- Chạy app với quyền admin.

## 3. Tech stack

Giữ nguyên stack của `notch-shell`. Phần thêm mới:

| Phần | Lựa chọn | Cần duyệt |
|---|---|---|
| Win32 từ Rust | Crate `windows` (bản Tauri đang dùng). Feature: `Win32_UI_Shell`, `Win32_System_Com`, `Win32_System_Search`, `Win32_Graphics_Imaging`, `Win32_Graphics_Gdi`, `Win32_UI_WindowsAndMessaging` | **Có** — thêm dependency |
| Liệt kê app | `FOLDERID_AppsFolder` qua `IShellItem` (chính nguồn `Get-StartApps` dùng; máy này có 196 app). Mở bằng `shell:AppsFolder\<id>` | — |
| Icon app/file | `IShellItemImageFactory` 32px (×DPI) → PNG bằng WIC. Cache ở `%LOCALAPPDATA%\winbar\icons\`. Không dùng crate ảnh | — |
| Everything | Everything SDK: nạp `Everything64.dll` (bản ARM64/x64 chính thức của voidtools) lúc chạy, kèm theo app | **Có** — thêm file nhị phân; Task 1 xác nhận giấy phép và bản ARM64 |
| Windows Search | OLE DB (`Search.CollatorDSO`) qua COM từ Rust. Đã đo bằng PowerShell trên máy này: **50–180ms** cho 20 kết quả trong `C:\Users\me` | — |
| Mở file/URL/app | `ShellExecuteW` từ Rust (không thêm plugin `opener`) | — |
| Copy kết quả | `navigator.clipboard.writeText` (cửa sổ đang có focus). Không thêm plugin clipboard | — |
| Máy tính, đổi đơn vị, xếp hạng | TypeScript tự viết, **không dùng `eval`/`Function`**, không thêm thư viện | — |
| UI | React + CSS modules + token của `notch-shell` (giống notch, không Tailwind/Radix) | — |

## 4. Lệnh

Giống `notch-shell`: `npm run tauri dev` · `npm test` · `cargo test --manifest-path src-tauri/Cargo.toml` · `npm run lint`.

Máy này có YASB đang giữ `Ctrl+Space`. Khi dev, đổi phím trong Cài đặt (ví dụ `Alt+Space`) hoặc tắt Quick Launch của YASB.

## 5. Hành vi

### 5.1 Giao diện

Theo mockup:
- **Kích thước:** rộng 660, bo góc 20, nền kính CSS đặc như notch.
- **Hàng trên (cao 60):** tay nắm ⠿, icon tìm kiếm, ô nhập chữ 18px, nút "Xóa" khi có chữ.
- **Vùng kết quả:** cao tối đa 420, cuộn khi dài hơn.
- **Hàng dưới (cao 40):** gợi ý phím.

| Vùng | Nội dung |
|---|---|
| Placeholder | "Tìm app, file, clipboard hoặc gõ phép tính…" |
| Nhóm kết quả | Tiêu đề nhóm: Gần đây · Ứng dụng · File · Clipboard · Hành động · Web |
| Dòng kết quả | Icon 32 · tên · dòng phụ (đường dẫn rút gọn "Documents › Reports", "Ứng dụng", …) · dòng đang chọn hiện động từ + `↵` ("Mở", "Copy", "Chạy") |
| Máy tính / đơn vị | Một khối lớn: `= 87` (mono 30px), biểu thức gốc ở dưới, "Copy ↵" bên phải |
| Không có kết quả | "Không tìm thấy kết quả. Thử `/f` để tìm file hoặc `=` để tính." + dòng "Tìm trên web: …" |
| Hàng dưới | `↑↓` chọn · `↵` chạy · `Esc` xóa / đóng · bên phải: `=` tính · `/f` file · `/g /y /r /x` web |
| Toast | Viên thuốc trắng "✓ Đã copy …" ở đáy, 1.2s |
| Nguồn file không chạy được | Dòng mờ trong nhóm File: "Không tìm được file: Windows Search đang tắt" (không chặn các nguồn khác) |

Cửa sổ native luôn khớp chiều cao nội dung, giữ cạnh trên cố định. Giống notch: to ra ngay, nhỏ lại sau khi nội dung đổi xong.
Nhờ vậy không có vùng trong suốt nào chặn chuột.

### 5.2 Bàn phím và chuột

| Thao tác | Kết quả |
|---|---|
| Phím tắt (đang đóng) | Hiện ở vị trí đã nhớ, focus ô nhập, bôi đen chữ cũ |
| Phím tắt (đang mở, không có focus) | Đưa lên trước, focus ô nhập, bôi đen chữ |
| Phím tắt (đang mở, đang có focus) | Không làm gì (không đóng) |
| Gõ | Tìm lại ngay. Nguồn file chờ 120ms sau lần gõ cuối |
| `↑` `↓` | Đổi dòng chọn (dừng ở đầu/cuối, không vòng) |
| `Enter` | Chạy dòng đang chọn, hoặc copy kết quả máy tính / đơn vị |
| `Ctrl+Enter` | File và app: mở thư mục chứa, chọn sẵn file |
| `Esc` (command bar đang có focus) | Có chữ thì xóa chữ; ô trống thì đóng. Đây là **cách duy nhất** để đóng |
| Rê chuột lên dòng | Chọn dòng đó |
| Bấm dòng | Chạy dòng đó |
| Click ra ngoài / chuyển sang app khác | Không đóng. Command bar vẫn nằm trên cùng, trông mờ hơn (viền nhạt) để biết nó không có focus; bấm vào nó hoặc nhấn phím tắt để gõ tiếp |
| Kéo ⠿ | Di chuyển cửa sổ (kéo native), thả thì lưu vị trí |
| Đang gõ dấu tiếng Việt (IME/UniKey đang ghép chữ) | Bỏ qua `Enter`/`Esc`/`↑↓` cho tới khi ghép xong (`isComposing`) |

Sau khi chạy app, file, web hoặc hành động: **không đóng**. App vừa mở tự lấy focus; command bar ở lại phía trên.
Sau khi copy kết quả máy tính hoặc đơn vị: hiện toast, không đóng.
Lần mở sau giữ chữ cũ nhưng bôi đen, gõ là thay luôn.

### 5.3 Vị trí

- **Mặc định:** màn hình đang có con trỏ chuột, giữa theo chiều ngang, cạnh trên cách đỉnh vùng làm việc 25% chiều cao.
- **Đã kéo:** lưu `commandBar.position` = góc trên-trái, px vật lý trên toàn desktop.
  Khi mở, nếu điểm giữa cạnh trên không nằm trong vùng làm việc của màn hình nào thì dùng vị trí mặc định.
  Không ghi đè vị trí đã lưu, để cắm lại màn hình thì vị trí cũ quay về.
- Chiều cao thay đổi thì giữ cạnh trên, chỉ đổi cạnh dưới. Nếu tràn đáy màn hình thì vùng kết quả tự thấp lại.

### 5.4 Tìm kiếm và xếp hạng

**Tiền tố** (khớp khi là cả ô, hoặc theo sau là dấu cách):

| Tiền tố | Chỉ tìm |
|---|---|
| `=` | Máy tính |
| `/f` | File (tối đa 20) |
| `/g` · `/y` · `/r` · `/x` | Tìm trên Google · YouTube · Reddit · X (một dòng) |
| `?` | Cả 4 trang trên, trang ưu tiên đứng đầu |
| `cb` | Clipboard (khi module clipboard có) |
| tiền tố của widget khác | Provider đó |

Tiền tố lấy từ `SearchProvider.prefix`. Hai provider trùng tiền tố thì provider đăng ký sau bị bỏ tiền tố, và có log cảnh báo.

**Không có tiền tố:**
1. Chữ là biểu thức tính được hoặc phép đổi đơn vị hợp lệ: hiện khối kết quả ở trên cùng, các nhóm khác vẫn hiện bên dưới.
2. Thứ tự nhóm: Ứng dụng (tối đa 6) · Hành động (4) · File (4, chỉ khi gõ ≥ 2 ký tự) · nhóm của widget (4 mỗi nhóm) · Web (1 dòng, chỉ khi không có gì khác).
3. Dòng được chọn sẵn là dòng đầu tiên. Nếu có kết quả máy tính / đơn vị thì chọn sẵn khối đó.

**Chấm điểm tên:** không phân biệt hoa thường, bỏ dấu tiếng Việt khi so ("cai dat" khớp "Cài đặt"). Theo thứ tự ưu tiên:
1. trùng hết,
2. trùng chữ đầu các từ ("vsc" → Visual Studio Code),
3. khớp đầu tên,
4. khớp đầu một từ,
5. chứa chuỗi,
6. các ký tự xuất hiện theo thứ tự.

Cùng bậc thì xếp theo lịch sử dùng (tần suất × độ mới, nửa đời 7 ngày), rồi tên ngắn hơn.

**Lịch sử:** `%APPDATA%\winbar\command-history.json`.
- Mỗi mục đã chạy lưu: `{ key, kind, title, subtitle, target, count, lastUsed }`. Giữ tối đa 200 mục.
- **Không lưu chữ đã gõ.**
- File hoặc app không còn tồn tại thì tự bỏ khỏi "Gần đây".

**Máy tính:**
- Phép tính: `+ - * / % ^`, ngoặc, số thập phân dùng dấu `.`.
- Hàm: `sqrt sin cos tan log ln abs round`. Hằng số: `pi e`.
- Làm tròn 10 chữ số. Hiện có dấu phân cách hàng nghìn, copy thì không có dấu phân cách.
- Không phải biểu thức (vd. "code") thì không hiện gì.

**Đổi đơn vị:** `<số> <đơn vị> (to|in|sang|->) <đơn vị>`

| Nhóm | Đơn vị |
|---|---|
| Độ dài | mm cm m km in ft yd mi |
| Khối lượng | mg g kg t oz lb |
| Nhiệt độ | c f k |
| Thể tích | ml l gal floz |
| Tốc độ | kmh mph ms |
| Dữ liệu | b kb mb gb tb (1024) |
| Thời gian | ms s min h d |

**Tìm web:** chỉ 4 trang Google, YouTube, Reddit, X, mỗi trang có lệnh riêng (`/g`, `/y`, `/r`, `/x`).
Trang ưu tiên đổi được trong Cài đặt, mặc định Google. Không có lệnh thì chỉ hiện 1 dòng của trang ưu tiên, và chỉ khi không có kết quả nào khác.
*(Đổi 2026-09-17 theo yêu cầu của bạn: `f` → `/f`, thêm lệnh cho từng trang, bỏ Bing/DuckDuckGo. Dòng gợi ý khi chỉ gõ lệnh, và ký tự đại diện `*` `?` cho file, lấy theo Quick Launch của yasb.)*

**Nguồn file:**
- **Chọn nguồn khi mở command bar:**
  - Everything đang chạy thì dùng Everything.
  - Không thì Windows Search (dịch vụ `WSearch` đang chạy).
  - Không có cả hai thì hiện dòng báo.
- **Everything:** tìm theo tên trên mọi ổ, sắp theo ngày sửa mới nhất.
- **Windows Search:**
  - Phạm vi: thư mục người dùng (`%USERPROFILE%`), sắp theo ngày sửa mới nhất.
  - Khớp theo tên file.
  - Chữ người dùng gõ phải được escape trước khi đưa vào câu SQL: dấu `'`, `%`, `_`, `[`.
- **Kết quả:** tên file, đường dẫn rút gọn tính từ thư mục người dùng, icon theo loại file.
- **Hủy tìm cũ:** gõ tiếp thì bỏ yêu cầu đang chạy (`AbortSignal`), và Rust bỏ kết quả của lần tìm cũ.

**App:**
- Liệt kê lúc khởi động (chạy nền).
- Liệt kê lại khi thư mục Start Menu đổi, hoặc khi mở command bar mà lần liệt kê trước đã quá 10 phút.
- Icon tải dần: dòng hiện chữ cái đầu cho tới khi có icon.

### 5.5 Chuyển động

Theo mục 5.3 của spec `notch-shell`.

| # | v1 |
|---|---|
| M11 mở/đóng | fade 150ms. Mockup có thêm co 0.96: để v2 |
| M12 dòng đang chọn | đổi nền ngay. Mockup có khối nền trượt: để v2 |
| Toast | hiện 150ms, giữ 1.2s, mờ 150ms |

Windows tắt Animation effects thì bỏ fade, chỉ còn 100ms.

## 6. Hợp đồng provider

Mở rộng `SearchProvider` / `SearchResult` trong `src/shell/widget-contract.ts`.
Đây là thay đổi hợp đồng đã duyệt, **duyệt cùng spec này**. Chưa widget thật nào dùng, nên không phải sửa code cũ.

```ts
export interface SearchProvider {
  id: string;
  /** Group heading, e.g. "Clipboard". */
  title: string;
  /** e.g. "cb"; typing it (alone or followed by a space) searches only this provider. */
  prefix?: string;
  /** Shown in "no prefix" results; false = only reachable through the prefix. Default true. */
  inDefaultResults?: boolean;
  /** Called on every query change; must honour `signal`. */
  search(query: string, signal: AbortSignal): Promise<SearchResult[]>;
}

export interface SearchResult {
  /** Stable across searches; used for history and selection. */
  id: string;
  title: string;
  subtitle?: string;
  /** Data URL, bundled asset URL, or an Icon name from src/shell/Icon.tsx. */
  icon?: string;
  /** Verb shown on the selected row: "Mở", "Copy", "Chạy". */
  verb: string;
  /** Higher sorts first inside the provider's group; the command bar does not re-rank provider results. */
  score?: number;
  run(): void | Promise<void>;
  /** Ctrl+Enter; omit when there is no secondary action. */
  runAlt?(): void | Promise<void>;
  /** false = do not record in "Gần đây" (e.g. clipboard secrets). Default true. */
  remember?: boolean;
}
```

Quy tắc:
- **Chỗ chạy:**
  - Cửa sổ command bar có React riêng, nạp cùng `src/widgets/index.ts` và lọc widget theo `settings.widgets`.
  - Vì vậy provider **chạy trong cửa sổ command bar, không chạy trong notch**.
  - Provider phải lấy dữ liệu qua lệnh Rust / sự kiện, **không** đọc state React của notch.
- **Mở notch:** `run()` muốn mở notch thì gọi lệnh Rust `open_notch(tab?)`. Notch nhận sự kiện `notch-open-requested`, đã có ở Task 10.
- **Chống treo:** mỗi provider có 1.5s. Quá giờ hoặc ném lỗi thì nhóm đó biến mất và có log. Các nhóm khác vẫn hiện.
- **Nguồn có sẵn** (app, file, máy tính, đơn vị, web, hành động winbar) dùng đúng interface này, nằm trong `src/command-bar/providers/`.

## 7. Cài đặt

Thêm vào `settings.json` (validate từng trường như `notch-shell`):

```json
"commandBar": {
  "position": null,
  "fileSearch": "auto",
  "webSearch": "google"
}
```

| Trường | Giá trị hợp lệ | Mặc định |
|---|---|---|
| `commandBar.position` | `null` hoặc `{ "x": int, "y": int }` (px vật lý) | `null` |
| `commandBar.fileSearch` | `auto` (Everything → Windows Search) · `everything` · `windows` · `off` | `auto` |
| `commandBar.webSearch` | `google` · `youtube` · `reddit` · `x` | `google` |

Cửa sổ Cài đặt thêm mục **Command bar**:
- **Tìm file** (ToggleGroup 4 lựa chọn) + dòng trạng thái: "Đang dùng Everything", "Đang dùng Windows Search", hoặc "Không có nguồn file".
- **Tìm trên web bằng** (ToggleGroup).
- **Vị trí:** nút "Đặt lại vị trí" (đặt `position` về `null`).
- **Phím tắt:** vẫn ở mục Phím tắt đã có.

## 8. Cấu trúc thư mục

```
src-tauri/src/
  command_bar/mod.rs         → tạo cửa sổ, hiện/ẩn, focus, đặt vị trí, đổi chiều cao, lưu vị trí
  command_bar/placement.rs   → tính vị trí mặc định / kiểm tra vị trí đã lưu (hàm thuần, có test)
  command_bar/apps.rs        → liệt kê AppsFolder, mở app
  command_bar/icons.rs       → icon → PNG, cache
  command_bar/files/mod.rs   → chọn nguồn, hủy tìm cũ
  command_bar/files/everything.rs
  command_bar/files/windows_search.rs  (+ hàm dựng câu SQL thuần, có test)
  command_bar/history.rs     → lịch sử + điểm tần suất/độ mới (thuần, có test)
  command_bar/launch.rs      → ShellExecute: app, file, thư mục chứa, URL http(s)
  resources/everything/      → Everything64.dll (nếu được duyệt)
src/command-bar/
  main.tsx, CommandBar.tsx, CommandBar.module.css
  use-command-search.ts      → gọi provider, gộp nhóm, hủy, timeout
  rank.ts                    → chấm điểm tên + bỏ dấu (thuần)
  calculator.ts, units.ts    → (thuần)
  providers/apps.ts, files.ts, calculator.ts, units.ts, web.ts, winbar-actions.ts
command-bar.html             → entry thứ 3 của Vite
```

## 9. Phong cách code

Giống `notch-shell` §9. Thêm:
- Mọi lệnh Rust nhận dữ liệu từ WebView phải kiểm tra đầu vào:
  - `launch` chỉ nhận id app có trong danh sách đã liệt kê, đường dẫn file đang tồn tại, hoặc URL `http`/`https`.
  - Câu SQL của Windows Search chỉ dựng từ hàm có test escape.
- Code tìm file và liệt kê app chạy ngoài luồng UI của Tauri (`spawn_blocking`). COM khởi tạo trên đúng luồng đó.

## 10. Kiểm thử

| Mức | Công cụ | Nội dung |
|---|---|---|
| Unit TS | Vitest | Máy tính (ưu tiên toán tử, ngoặc, hàm, chia 0, chuỗi không phải biểu thức) · đổi đơn vị (mọi nhóm, sai đơn vị, khác nhóm) · chấm điểm tên (6 bậc, bỏ dấu) · tách tiền tố · gộp nhóm, giới hạn số dòng, timeout, provider lỗi, hủy |
| Component | Vitest + Testing Library | Gõ → nhóm đúng thứ tự · ↑↓ dừng ở biên · Enter chạy đúng dòng · Ctrl+Enter · Esc 2 bước · `isComposing` bỏ qua phím · khối máy tính + toast · trạng thái không có kết quả |
| Rust | `cargo test` | Vị trí mặc định theo DPI/màn hình · vị trí đã lưu nằm ngoài mọi màn hình → mặc định · điểm lịch sử (tần suất, độ mới, giới hạn 200) · escape SQL Windows Search · `launch` từ chối URL `file:`/`javascript:` và đường dẫn không tồn tại |
| Thủ công | `tests/manual-command-bar.md` | Phím tắt khi đang ở các app khác nhau (trình duyệt, Terminal, app chạy quyền admin) · gõ tiếng Việt bằng UniKey · kéo, khởi động lại, rút màn phụ · Everything có/không · tắt WSearch · đo thời gian mở và RAM |

## 11. Tiêu chí hoàn thành

1. Nhấn phím tắt ở trình duyệt, Terminal, Explorer: command bar hiện **≤ 150ms** (tính từ lúc nhấn tới lúc hiện, đo trên bản release), ô nhập đã có focus. Nhấn lại khi nó đang mở thì chỉ focus lại, không đóng.
2. Gõ tên app: app đúng nằm trong 3 dòng đầu với "code", "term", "vsc", "sett" (Settings). Enter mở app; command bar không đóng.
3. App Store (vd. Calculator, Settings) và app desktop đều mở được, có icon thật.
4. Có Everything: tìm file toàn máy. Tắt Everything: tự dùng Windows Search trong thư mục người dùng, kết quả ≤ 300ms sau khi dừng gõ. Không có cả hai: hiện dòng báo, các nguồn khác vẫn chạy.
5. Ctrl+Enter trên file mở Explorer và chọn sẵn file đó.
6. `12*7+3` → `= 87`, `2^10` → `= 1,024`, `sqrt(144)` → `= 12`. `5 km to mi` → `3.10686 mi`, `30 c to f` → `86 °F`. Enter copy đúng số, có toast.
7. `? tauri` mở trình duyệt mặc định với công cụ tìm đã chọn.
8. Ô trống hiện "Gần đây" đúng thứ tự dùng. Khởi động lại app vẫn còn.
9. Kéo sang chỗ khác, đóng, mở lại, khởi động lại app: vẫn đúng chỗ. Rút màn hình chứa vị trí đó: mở ở vị trí mặc định.
10. Chỉ Esc (command bar có focus, ô trống) mới đóng. Click ra ngoài, chuyển app, chạy kết quả, nhấn lại phím tắt đều không đóng. Esc khi có chữ chỉ xóa chữ. Gõ tiếng Việt bằng UniKey không bị Enter chạy nhầm lúc đang ghép chữ.
11. Widget demo có `searchProvider` (tiền tố `demo`) hiện trong command bar. Tắt widget đó trong Cài đặt thì nhóm của nó biến mất, không cần khởi động lại.
12. Mục Command bar trong Cài đặt đổi được nguồn file và công cụ tìm web, áp dụng ngay. "Đặt lại vị trí" hoạt động.
13. Khi đứng yên (command bar đóng, notch thu gọn): CPU < 1%, RAM "Memory" trong Task Manager của cả app **< 150 MB**.
14. So với mockup không lệch rõ về kích thước, màu, bo góc, chữ.
15. `npm test`, `cargo test`, `npm run lint` đều qua.

## 12. Rủi ro

| # | Rủi ro | Cách xử lý |
|---|---|---|
| R1 | Windows chặn cửa sổ tự lấy focus (foreground lock), nên nhấn phím tắt xong mà gõ không vào ô | Gọi `SetForegroundWindow` trong lúc xử lý phím tắt (app đang nhận input nên được phép). Nếu vẫn chặn: `AllowSetForegroundWindow` / gửi phím giả Alt. Đo ở Task 1 |
| R2 | Tạo sẵn WebView thứ hai làm tăng RAM | Đo ở Task 1. Vượt ngưỡng tiêu chí 13 thì chuyển sang tạo khi mở lần đầu và hủy sau 5 phút không dùng. Báo trước khi đổi |
| R3 | Everything SDK: giấy phép kèm DLL, bản ARM64 | Task 1 kiểm. Không kèm được thì gọi IPC của Everything trực tiếp từ Rust (giao thức `WM_COPYDATA`), hỏi trước |
| R4 | Windows Search không index thư mục cần tìm | Ghi rõ trong Cài đặt: "chỉ thấy file trong thư mục Windows đã index" |
| R5 | App chạy quyền admin đang ở trước: phím tắt vẫn chạy nhưng cửa sổ thường không nhận được focus từ app admin (UIPI) | Ghi vào checklist. Không chạy winbar quyền admin |
| R6 | `Ctrl+Space` đang bị YASB giữ | Như `notch-shell` R3. Tắt Quick Launch trong YASB khi chuyển sang winbar |
| R7 | Liệt kê AppsFolder + icon chậm ở lần đầu | Chạy nền lúc khởi động. Icon tải dần, cache trên đĩa |

## 13. Giới hạn khi làm

- **Luôn:**
  - chạy `npm test`, `cargo test`, `npm run lint` trước khi commit,
  - theo đúng mockup,
  - hủy yêu cầu tìm cũ khi gõ tiếp,
  - không lưu chữ người dùng đã gõ.
- **Hỏi trước:**
  - thêm dependency ngoài mục 3,
  - kèm file nhị phân khác,
  - đổi hợp đồng provider sau khi duyệt,
  - thêm provider ngoài phạm vi,
  - bất cứ thao tác nào với `~/.claude`.
- **Không bao giờ:**
  - dùng `eval`/`Function` cho máy tính,
  - ghép chuỗi người dùng vào SQL mà không escape,
  - mở URL không phải `http`/`https` từ dòng web,
  - xóa hoặc bỏ qua test đang fail.

## 14. Quyết định đã chốt và câu hỏi còn mở

Đã chốt (2026-09-17):
- **Tìm file:** Everything, không có thì Windows Search.
- **Nguồn thêm cho v1:** Tìm trên web, Đổi đơn vị.
- **Vị trí:** nhớ chỗ đã kéo; mặc định ở màn hình có con trỏ.
- **Đóng:** chỉ bằng Esc khi command bar đang có focus (bạn chốt khi duyệt spec). Không đóng khi mất focus hay sau khi chạy kết quả.
- Duyệt: thêm crate `windows` + `Everything64.dll` (kiểm giấy phép ở Task 1), mở rộng hợp đồng provider, ngưỡng RAM 150 MB.

Không còn câu hỏi chặn việc bắt đầu.
