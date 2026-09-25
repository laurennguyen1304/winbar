# Spec: update

> Module id: `update`. Phụ thuộc: `notch-shell` (alert trên pill), `settings`. Trạng thái: **ĐÃ DUYỆT (bản 2,
> 2026-09-25)**.
>
> **Đổi so với bản nháp 1 (chủ dự án chốt 25/09):** bỏ tag và GitHub Release; tín hiệu có bản mới chỉ là số
> phiên bản trong code được push lên `main`. winbar hỏi **một tuần một lần**, không hỏi mỗi vài giờ.

## 1. Mục tiêu

Người đã cài winbar biết là có bản mới mà không phải tự vào GitHub xem. winbar chỉ **báo**; người dùng vẫn tự cập
nhật như README hướng dẫn (thoát winbar, `git pull`, `npm install`, build lại).

Tín hiệu do chủ dự án quyết định: **tăng số phiên bản rồi publish** là báo; không tăng thì push bao nhiêu lần cũng
không ai bị làm phiền.

### User stories

- Chủ dự án đổi phiên bản `0.1.0` → `0.2.0` và publish. Trong vòng một tuần, pill trên máy người dùng hiện "Có bản
  winbar 0.2.0".
- Tôi bấm **Xem**: trang CHANGELOG trên GitHub mở ra, đọc được bản mới có gì.
- Tôi bấm **Để sau**: alert biến mất và không báo lại cho bản `0.2.0` nữa. Có bản `0.3.0` thì báo tiếp.
- Tôi muốn biết ngay: bấm **Kiểm tra ngay** trong Cài đặt.
- Tôi không muốn winbar gọi mạng: tắt một công tắc trong Cài đặt là không còn request tự động nào.

## 2. Phạm vi

**Trong phạm vi**

| Hạng mục | Ghi chú |
|---|---|
| Bản đang chạy | Phiên bản của app lúc build (`tauri.conf.json`, cùng số với `Cargo.toml`, `package.json`) |
| Bản mới nhất | Số `version` trong `src-tauri/tauri.conf.json` trên nhánh `main` của repo công khai |
| Nhịp hỏi | Tối đa một lần mỗi 7 ngày, tính từ lần hỏi thành công trước, nhớ qua các lần khởi động lại |
| Báo | Alert trên pill, nút **Xem** và **Để sau** |
| Cài đặt | Công tắc bật/tắt; dòng phiên bản đang chạy; nút **Kiểm tra ngay** |

**Ngoài phạm vi:** tag, GitHub Release; tự tải hay tự cài bản mới; toast của Windows; hiện nội dung CHANGELOG
ngay trong winbar; máy chủ riêng hay kênh đẩy tín hiệu (§13).

## 3. Tech stack

Không thêm thư viện. Dùng lại `claude::http::get` (WinHTTP) cho request; chuyển `http.rs` ra chỗ dùng chung
(`src-tauri/src/http.rs`) vì nó không còn riêng của Claude.

## 4. Lệnh

```powershell
npm test
npm run lint
cargo test --manifest-path src-tauri/Cargo.toml
npm run tauri dev
```

## 5. Hành vi

### 5.1 Hỏi phiên bản mới nhất

- Request: `GET https://raw.githubusercontent.com/laurennguyen1304/winbar/main/src-tauri/tauri.conf.json`, header
  `User-Agent: winbar/<phiên bản>`. Không gửi token hay thông tin gì khác.
- Chỉ đọc trường `version`. Hợp lệ khi có dạng `1.2.3` (ba số nguyên). Khác dạng thì coi như không có bản mới.
- Có bản mới khi số trên GitHub **lớn hơn hẳn** bản đang chạy, so từng số một (`0.10.0` > `0.9.0`).
- **Khi nào hỏi:**
  - Lúc khởi động (chờ 1 phút cho máy mở xong), **chỉ khi** lần hỏi thành công gần nhất đã cách đây ≥ 7 ngày, hoặc
    chưa từng hỏi.
  - winbar chạy liên tục thì kiểm tra lại mốc này mỗi ngày một lần (chỉ so ngày, không gọi mạng); tới hạn mới hỏi.
  - Mốc thời gian lưu trên đĩa (`lastCheckedAt` trong `update.json`, §7), nên khởi động lại máy nhiều lần trong tuần cũng không
    hỏi thêm.
- Lỗi (mất mạng, 4xx/5xx, JSON hỏng, body quá 1 MB): im lặng, ghi một dòng ra stderr, **không** cập nhật mốc,
  nên lần khởi động sau hoặc ngày hôm sau sẽ thử lại. Không bao giờ hiện lỗi này lên pill.
- Đồng hồ máy bị chỉnh lùi (mốc lưu nằm ở tương lai): coi như tới hạn, hỏi lại.

### 5.2 Báo trên pill

```
╭──────────────────────────────────────────╮
│  ↑ Có bản winbar 0.2.0    [Xem] [Để sau] │
╰──────────────────────────────────────────╯
```

- Một alert, priority **1** (thấp hơn cảnh báo hạn mức Claude là 3, để việc đang diễn ra được ưu tiên).
- Alert nằm đó tới khi người dùng bấm một trong hai nút. Biết có bản mới mà chưa bấm gì thì khởi động lại winbar
  vẫn báo lại (bản mới nhất đã biết được lưu cùng mốc, không cần hỏi mạng lại).
- **Xem**: mở `https://github.com/laurennguyen1304/winbar/blob/main/CHANGELOG.md` bằng trình duyệt mặc định, rồi
  đóng alert. Bấm Xem cũng tính là đã biết, nên bản này không được báo lại, giống như bấm Để sau.
- **Để sau**: đóng alert.
- Cả hai nút lưu phiên bản đó vào `dismissedVersion` (§7). Bản ≤ số này không bao giờ được báo nữa.
- URL mở ra là **hằng số** trong code. winbar không mở gì lấy từ phản hồi của GitHub.

### 5.3 Trong Cài đặt

Một mục **Cập nhật** (trong trang Chung):

- Dòng chữ "Phiên bản 0.2.0", kèm "· Có bản 0.3.0" (bấm được, mở CHANGELOG) khi biết có bản mới.
- Công tắc **Tự kiểm tra bản mới**, mặc định **bật**. Mô tả: "Hỏi GitHub một tuần một lần. Tắt thì winbar không
  tự gọi mạng để kiểm tra."
- Nút **Kiểm tra ngay**: hỏi một lần, không cần đợi đủ 7 ngày. Kết quả hiện ngay dưới nút: "Đang dùng bản mới
  nhất", "Có bản 0.3.0", hoặc "Không kiểm tra được (mất mạng?)". Có bản mới thì alert hiện lại, kể cả khi bản đó đã
  bị bỏ qua.
- Công tắc tắt thì nút Kiểm tra ngay vẫn dùng được: người dùng bấm tức là cho phép gọi mạng một lần.

## 6. Hợp đồng

```ts
// src/update/native.ts
export interface UpdateStatus {
  /** Phiên bản đang chạy, ví dụ "0.2.0". */
  current: string;
  /** Bản mới hơn trên GitHub; không có khi đang mới nhất hoặc chưa hỏi được. */
  latest?: string;
  /** Epoch ms lần hỏi thành công gần nhất; 0 khi chưa có. */
  checkedAt: number;
  error?: "network";
}
update_status(): Promise<UpdateStatus>;   // đọc trạng thái đã có, không gọi mạng
update_check(): Promise<UpdateStatus>;    // hỏi ngay (nút trong Cài đặt)
update_open_changelog(): Promise<void>;   // mở URL hằng số
update_dismiss(version: string): Promise<void>;
// sự kiện "update-available" (payload: phiên bản) khi lần hỏi định kỳ thấy bản mới chưa bị bỏ qua
```

Alert do shell tự đẩy khi nhận sự kiện (và lúc khởi động nếu đã biết có bản mới chưa bỏ qua), không cần một
widget: update không có card, không chiếm ô nào trong panel.

## 7. Cài đặt và trạng thái

Trong file cài đặt, chỉ một công tắc:

```jsonc
"update": { "check": true }   // tự hỏi mỗi 7 ngày
```

Phần winbar tự ghi nằm ở file riêng `%APPDATA%\winbar\update.json`, cạnh cache hạn mức Claude, để việc ghi mốc
không làm cửa sổ Cài đặt tưởng cài đặt vừa đổi:

```jsonc
{
  "lastCheckedAt": 0,       // epoch ms lần hỏi thành công gần nhất
  "latestKnown": "",        // bản mới nhất thấy được ở lần đó
  "dismissedVersion": ""    // bản cao nhất người dùng đã bấm Xem hoặc Để sau
}
```

File cài đặt cũ không có mục `update` thì dùng mặc định. `update.json` thiếu hay hỏng thì coi như chưa hỏi bao giờ.

## 8. Quy trình phát hành

Thêm vào quy trình publish qua `public-main` hiện có, **chỉ khi chủ dự án muốn báo cho người dùng**:

1. Tăng phiên bản ở cả ba chỗ: `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` (`Cargo.lock`
   tự đổi theo). Một test kiểm tra ba số này bằng nhau.
2. `CHANGELOG.md`: tiêu đề mục mới ghi cả phiên bản, ví dụ `## 0.2.0 — 25/09/2026`.
3. Commit và publish qua `public-main` như thường lệ. Xong.

Cách tính số: sửa lỗi tăng số cuối (`0.2.1`), thêm tính năng tăng số giữa (`0.3.0`). Số đầu giữ `0` tới khi chủ
dự án muốn gọi là 1.0.

## 9. Cấu trúc thư mục

```
src-tauri/src/http.rs            chuyển từ claude/http.rs, dùng chung
src-tauri/src/update/
  mod.rs        lệnh, luồng nền (thức dậy mỗi ngày để so mốc), giữ trạng thái
  model.rs      đọc version, so phiên bản, tính tới hạn chưa (thuần, có test)
src/update/
  native.ts     gọi lệnh, nghe sự kiện
  UpdateAlert.tsx   nội dung alert trên pill
src/settings/UpdateSection.tsx   mục Cập nhật trong Cài đặt
```

## 10. Phong cách code

Như các module trước. Phần đọc, so phiên bản và tính hạn tách thuần để test:

```rust
/// `1.2.3`, ba số nguyên. Mọi dạng khác là không có bản mới.
pub fn parse_version(raw: &str) -> Option<(u64, u64, u64)> { … }

/// Đã đủ 7 ngày kể từ lần hỏi thành công trước chưa. Mốc ở tương lai (đồng hồ bị chỉnh lùi) tính là đã tới hạn.
pub fn is_due(last_checked_ms: u64, now_ms: u64) -> bool { … }
```

## 11. Kiểm thử

| Tầng | Kiểm tra |
|---|---|
| Rust | `parse_version`: đúng dạng, có `v`, thiếu số, chữ lạ, số quá lớn, khoảng trắng, `1.2.3-beta`. So sánh: `0.10.0 > 0.9.0`, bằng nhau không phải mới. Body: đúng dạng, thiếu `version`, JSON hỏng. `is_due`: chưa hỏi bao giờ, 6 ngày 23 giờ, đúng 7 ngày, mốc ở tương lai. Bản ≤ `dismissedVersion` không báo. Lỗi mạng không đổi mốc |
| Rust | Ba file phiên bản cùng một số |
| TS | Sự kiện tới thì alert hiện; Xem gọi `update_open_changelog` rồi `update_dismiss`; Để sau gọi `update_dismiss`; mục Cài đặt hiện đúng ba kết quả của Kiểm tra ngay |
| Tay | Build bản đang có, sửa tạm `version` trên máy xuống thấp hơn bản trên GitHub (không commit), bấm Kiểm tra ngay thấy alert. Khởi động lại hai lần, xem log thấy không có request thứ hai. Tắt công tắc, Resource Monitor không thấy winbar kết nối tới GitHub |

## 12. Tiêu chí hoàn thành

- Có bản mới hơn trên `main` thì pill báo ở lần hỏi kế tiếp (tối đa 7 ngày), hoặc ngay khi bấm Kiểm tra ngay.
- Khởi động lại nhiều lần trong tuần không tạo thêm request.
- Xem mở đúng CHANGELOG; bấm Xem hay Để sau thì bản đó không báo lại sau khi khởi động lại.
- Tắt công tắc thì không có request tự động nào tới GitHub.
- Mất mạng hay GitHub lỗi không hiện gì lên pill và không làm winbar chậm hay treo.
- README: một dòng ở phần Bảo mật nói winbar hỏi GitHub mỗi tuần một lần để kiểm tra bản mới (lộ IP cho GitHub)
  và cách tắt; phần cập nhật nói về alert.
- Test ở §11 qua; `npm run lint` và `cargo test` sạch.

## 13. Rủi ro

| Rủi ro | Mức | Cách xử lý |
|---|---|---|
| Người đang dùng bản hiện tại (chưa có tính năng này) sẽ **không** được báo bản đầu tiên có tính năng | Chắc chắn | Chỉ báo được từ bản sau trở đi. Ghi rõ trong CHANGELOG |
| Người dùng biết bản mới trễ tới 7 ngày | Chắc chắn | Chủ dự án đã chấp nhận (25/09). Ai cần sớm thì bấm Kiểm tra ngay |
| Quên tăng số ở một trong ba file | Trung bình | Test so ba số (§11) |
| Đổi tên hay chuyển vị trí `tauri.conf.json` trên `main` | Thấp | Bản cũ sẽ không đọc được nữa và im lặng. Đường dẫn nằm ở một hằng số; nếu phải đổi thì ghi vào CHANGELOG |
| Tài khoản GitHub của chủ dự án bị chiếm, kẻ xấu đổi số phiên bản | Thấp | Tệ nhất là người dùng thấy một số lạ và được mở CHANGELOG trên github.com. winbar không tải hay chạy gì |
| Máy chủ hay kênh đẩy tín hiệu thay cho hỏi | — | Không làm: cần máy chủ chạy liên tục và máy người dùng giữ kết nối, nặng hơn nhiều so với 1 request mỗi tuần |

## 14. Giới hạn khi làm

- **Luôn:** request chỉ tới một URL cố định trên `raw.githubusercontent.com`; chỉ đọc `version`; URL mở ra là hằng
  số.
- **Hỏi trước:** thêm thư viện; đổi số phiên bản thật lần đầu.
- **Không bao giờ:** tải hay chạy file từ GitHub; gửi thông tin máy hay cài đặt đi; hiện lỗi mạng lên pill.

## 15. Quyết định đã chốt

- Không tag, không GitHub Release; tín hiệu là số phiên bản trên `main` (25/09).
- Hỏi tối đa 7 ngày một lần; chấp nhận người dùng biết trễ tới một tuần (25/09).
- Công tắc **Tự kiểm tra bản mới** bật sẵn (25/09).
- Bản đầu tiên có tính năng này là `0.2.0` (25/09).
