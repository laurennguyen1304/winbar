# Capability Map: winbar

> Trạng thái: **ĐÃ DUYỆT (2026-09-16)**. Tính năng: ngang bằng yasb fork `laurennguyen1304/yasb`; trọng tâm là UI/UX mới.
> Mockup UI đã duyệt (2026-09-16): `design/winbar-mockup.html`. Bước tiếp theo: `SPEC-notch-shell.md`.

App notch cho Windows 11, trải nghiệm giống notch / Dynamic Island trên macOS: một pill kính mờ nổi cách mép
trên 8px, co giãn mượt thành lưới card widget. Mỗi tính năng là một widget độc lập cắm vào shell.

## Đã quyết định

- App mới. yasb fork (`laurennguyen1304/yasb`) chỉ là **tài liệu tham khảo về hành vi và nguồn dữ liệu**, không copy UI.
- Stack: **Tauri 2** (Rust cho phần native) + **React/TypeScript** (giao diện).
- Cách mở: `hover` (chờ 250ms), `click`, hoặc `always` (pill lớn luôn hiện Claude + media, bấm để mở đầy đủ).
- Pill thu gọn hiển thị nội dung của **một widget ưu tiên** do người dùng chọn.
- Clipboard: kéo item ra app khác.
- **Claude tách thành layout riêng** (xem bên dưới), cô lập hoàn toàn với phần lõi.
- Yêu cầu cấp quyền tạm chiếm pill và duyệt ngay trên pill. Chữ trạng thái Claude: `idle` / `Thinking` / `Cooking` / `wait for you`.
- Phím tắt command bar: `Ctrl+Space`.

## Hai layout

| Layout | Gồm | Nguyên tắc |
|---|---|---|
| **Core** | shell, command-bar, media, clipboard, system | Không đụng gì tới Claude. App vẫn chạy đầy đủ khi tắt layout Claude. |
| **Claude** | claude-sessions, claude-usage, claude-approvals | Một layout/trang riêng trong notch, **bật/tắt được**. Mặc định **chỉ đọc**: không ghi vào `~/.claude`, không cài hook, không chặn Claude. |

## Modules

| Module id | Layout | Trách nhiệm | Phụ thuộc |
|---|---|---|---|
| `notch-shell` | Core | Cửa sổ notch; pill ↔ mở rộng với animation kiểu macOS; mode hover/always; widget ưu tiên cho pill; **hợp đồng widget** (gồm cả *search provider* tùy chọn); chuyển giữa các layout; phím tắt toàn cục; khởi động cùng Windows; cài đặt; design tokens | — |
| `command-bar` | Core | Cửa sổ nổi riêng, mở bằng phím tắt; kéo đi bất kỳ đâu trên desktop và nhớ vị trí; tìm kiếm hợp nhất: app đã cài, file trong máy, item từ widget (clipboard, …), hành động của widget; máy tính (gõ biểu thức ra kết quả, Enter để copy) | notch-shell |
| `media` | Core | Bài đang phát, ảnh bìa, tiến độ; play/pause, next, previous; tự ẩn khi không có media | notch-shell |
| `system` | Core | Mở Task Manager; menu nguồn: Ngủ, Khởi động lại, Tắt máy, Đổi người dùng (Tắt máy và Khởi động lại phải xác nhận) | notch-shell |
| `clipboard` | Core | Lịch sử text/link/ảnh/code lưu lâu dài; tìm kiếm; lọc theo loại; ghim; kéo ra app khác; bỏ qua nội dung nhạy cảm | notch-shell |
| `claude-sessions` | Claude | Danh sách phiên live, phase `idle/thinking/tool/permission`, tool đang chạy, thời gian; mở project | notch-shell |
| `claude-usage` | Claude | % hạn mức 5 giờ và 7 ngày, giờ reset, cảnh báo ngưỡng | notch-shell |
| `claude-approvals` | Claude | Approve/Deny yêu cầu cấp quyền ngay trên notch | notch-shell, claude-sessions |

## Tình trạng (21/09/2026)

| Module | Trạng thái |
|---|---|
| `notch-shell` · `command-bar` · `media` · `system` · `clipboard` | ✅ xong, dùng hằng ngày |
| `claude-sessions` · `claude-usage` | ✅ xong |
| `claude-approvals` | ⬜ **chưa làm** — chủ dự án hoãn ngày 21/09. Khả thi (đã khảo sát: hook `PermissionRequest` quyết định được), nhưng nó **ghi hook vào `~/.claude`** nên cần duyệt riêng trước khi bắt đầu |

Ngoài phạm vi so với bản đầu: **menu nguồn** của `system` (Ngủ / Khởi động lại / Tắt máy / Đổi người dùng) —
Chủ dự án bỏ ngày 18/09, xem `SPEC-system.md` §1.

Thứ tự build:

```
notch-shell → command-bar → media → system → clipboard   (Core, dùng được hằng ngày)
            → claude-sessions → claude-usage → claude-approvals   (Claude, sau khi Core ổn)
```

`command-bar` không phụ thuộc trực tiếp vào widget nào: mỗi widget tự đăng ký search provider qua hợp đồng của
`notch-shell` (ví dụ `clipboard` đăng ký provider "tìm item clipboard"). Nhờ vậy không có vòng phụ thuộc, và tắt
một widget thì kết quả của nó tự biến mất khỏi command-bar.

`claude-approvals` là module duy nhất phải can thiệp vào Claude Code, nên làm cuối, và phải được duyệt riêng trước khi bắt đầu.

## Cách Claude layout không ảnh hưởng công việc hiện tại

| Module | Nguồn dữ liệu | Có ghi/đổi gì không |
|---|---|---|
| `claude-sessions` | `~/.claude/statusbar/state.d/*.json` — hook `lifecycle.js` của yasb **đã chạy sẵn** trên máy | Không. Chỉ đọc file |
| `claude-usage` | `~/.claude/.credentials.json` + endpoint OAuth usage (giống yasb); cache trên đĩa của app | Không ghi vào `~/.claude`. Tôn trọng rate limit (cache ≥ 120s) |
| `claude-approvals` | Hook `PermissionRequest` gọi vào server local của app | **Có** — phải thêm hook vào settings. Tắt mặc định; nếu app không chạy thì hook trả về ngay để Claude hỏi trong terminal như bình thường |

Mọi widget Claude có **chế độ dữ liệu giả (fixture)** để dựng và chỉnh UI mà không cần phiên Claude thật.

## Rủi ro đã biết

- Endpoint usage không công khai, có thể đổi hoặc bị chặn.
- `state.d` là định dạng của hook yasb; nếu đổi hook thì phải cập nhật parser.
- Kéo item ra app khác từ WebView2 cần native drag (plugin).
- Tìm file: Windows Search index có sẵn nhưng chậm và chỉ phủ thư mục đã index; Everything nhanh nhưng phải cài riêng (máy chưa có).
- Phím tắt toàn cục có thể trùng với app khác (yasb Quick Launch đang dùng `Ctrl+Space`).
- Cửa sổ trong suốt luôn nằm trên, phải cho click xuyên qua vùng ngoài notch, xử lý nhiều màn hình và DPI.

## Việc cần hỏi trước khi làm

- Cài Rust toolchain (`rustup`) — máy chưa có.
- Mọi thay đổi `~/.claude/settings.json` hoặc hook (chỉ xảy ra ở `claude-approvals`).
