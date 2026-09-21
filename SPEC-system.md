# Spec: system

> Module id: `system` (xem `CAPABILITY-MAP.md`). Phụ thuộc: `notch-shell`. Trạng thái: **ĐÃ DUYỆT (bản 2, 2026-09-18)**.
> Nguồn UI: `design/winbar-mockup.html` (card "Hệ thống"; phần chỉ số lấy kiểu thanh mức của card hạn mức Claude).
>
> **Đổi so với bản 1 (2026-09-18, bạn chốt):** bỏ hẳn menu nguồn (Ngủ / Khởi động lại / Tắt máy / Đổi người dùng).
> Card chỉ còn Task Manager và tình trạng máy: CPU, RAM.

## 1. Mục tiêu

Liếc notch là biết máy đang nặng hay nhẹ, và mở Task Manager ngay khi cần xem kỹ.

### User stories

- Tôi mở panel, thấy CPU đang bao nhiêu phần trăm và RAM đã dùng bao nhiêu trên tổng.
- Thấy máy nặng, tôi bấm một nút là Task Manager mở lên.
- Panel đóng thì winbar không đo gì nữa, không tốn CPU chỉ để hiện số.

## 2. Phạm vi

**Trong phạm vi**

| Hạng mục | Ghi chú |
|---|---|
| Card **"Core"** | CPU (%) + RAM (đã dùng / tổng), mỗi cái một thanh mức; nút Task Manager. Nhãn là "Core" chứ không phải "Hệ thống" (chủ dự án chốt 21/09): card nằm ở cột hẹp của bento, chữ dài hơn đẩy "Task Manager" xuống hai dòng. Tên widget trong Cài đặt vẫn là "Hệ thống" |
| Nhịp đo | 2 giây một lần, **chỉ khi card đang hiện** (panel mở). Panel đóng thì dừng hẳn |
| Search provider | Một dòng "Mở Task Manager" trong command bar, tìm được cả khi gõ không dấu |
| Lỗi | Đo lỗi thì hiện "—" thay cho số; mở Task Manager lỗi thì hiện lý do trong card |

**Ngoài phạm vi:** menu nguồn (đã bỏ), ổ đĩa, pin, mạng, nhiệt độ, GPU, biểu đồ theo thời gian,
danh sách tiến trình nặng, chỉ số trên pill hay pill always, cảnh báo khi máy quá tải.

## 3. Tech stack

Không thêm thư viện. Bật thêm 2 feature cho crate `windows` 0.61 đang dùng (**cần bạn duyệt**):

| Feature | Dùng cho |
|---|---|
| `Win32_System_SystemInformation` | `GlobalMemoryStatusEx` (RAM đã dùng / tổng) |
| `Win32_System_Threading` | `GetSystemTimes` (thời gian CPU rảnh / nhân / người dùng) |

Task Manager mở bằng `taskmgr.exe` (chương trình sẵn có của Windows), không cần quyền gì thêm.

## 4. Lệnh

Như các module trước: `npm test` · `cargo test --manifest-path src-tauri/Cargo.toml` · `npm run lint` · `npm run tauri dev`.

## 5. Hành vi

### 5.1 Card

Card gọn, cao khoảng 79px (bạn chốt thu nhỏ ~30% ngày 2026-09-18; bản đầu cao 127px):

```
HỆ THỐNG                          [ ⌁ Task Manager ]
CPU                38%     RAM      24.5 / 31.6 GB
▇▇▇▇▇▁▁▁▁▁▁▁▁▁▁▁   ▇▇▇▇▇▇▇▇▇▇▁▁▁▁▁▁
```

- **CPU:** phần trăm toàn máy, làm tròn số nguyên.
- **RAM:** đã dùng / tổng, đơn vị GB một số lẻ (ví dụ `24.5 / 31.6 GB`); thanh mức theo tỉ lệ đã dùng.
- Thanh đổi màu khi cao: ≥ 90% màu cảnh báo, 75–89% màu vàng, dưới 75% màu chữ thường.
- Nút Task Manager nằm ngay trên hàng tiêu đề (chỗ mockup để ghi chú), nền viên thuốc, cao 22px.
- Số nhảy thì không có hiệu ứng đếm; chỉ đổi thẳng (M9 để sau).

### 5.2 Nhịp đo

- Card hiện (panel mở, tab Core, widget đang bật): đo ngay lần đầu, rồi 2 giây một lần.
- Card biến mất (đóng panel, đổi tab, tắt widget): dừng đo. Không có tiến trình nền nào của module này.
- CPU tính theo chênh lệch giữa hai lần đọc. Lần đầu sau khi mở panel không có mốc trước đó, nên Rust tự đo nhanh trong 150ms để có số ngay.

### 5.3 Task Manager

- Bấm nút: chạy `taskmgr.exe`, hiện dòng "Đã mở Task Manager" 2 giây.
- Task Manager đang chạy sẵn: Windows đưa cửa sổ cũ lên, không mở thêm cái mới.
- Lỗi: dòng đỏ ghi lý do, giữ tới khi bấm chỗ khác; ghi log ra stderr.

### 5.4 Trong command bar

- Provider `system`, nhóm "Hệ thống", hiện trong kết quả mặc định, không có tiền tố.
- Một dòng: "Mở Task Manager", tìm được bằng "task", "tackman", "quản lý tác vụ", "quan ly tac vu".
- Enter: chạy luôn, command bar đóng.

## 6. Hợp đồng

```ts
// src/widgets/system/native.ts
export interface SystemStats {
  /** 0–100, phần trăm CPU toàn máy giữa hai lần đo. */
  cpuPercent: number;
  ramUsedBytes: number;
  ramTotalBytes: number;
}
system_stats(): Promise<SystemStats>;   // lỗi trả chuỗi tiếng Việt
open_task_manager(): Promise<void>;
```

## 7. Cài đặt

Không thêm cài đặt riêng.

## 8. Cấu trúc thư mục

```
src-tauri/src/system/
  mod.rs        lệnh `system_stats`, `open_task_manager`, giữ mốc đo trước
  stats.rs      đọc RAM và thời gian CPU (cfg(windows))
  model.rs      tính % CPU từ hai mốc, định dạng GB (thuần, có test)
src/widgets/system/
  index.tsx     WidgetDefinition: Card + search provider
  SystemCard.tsx · System.module.css · native.ts
  use-stats.ts  hook: đo 2 giây/lần khi card hiện (có test)
  *.test.ts(x)
```

## 9. Phong cách code

Như các module trước; phần tính toán tách riêng để test:

```rust
/// CPU use between two samples of GetSystemTimes; kernel time already contains idle time.
pub fn cpu_percent(prev: Times, now: Times) -> Option<f64> {
    let busy = (now.kernel + now.user).checked_sub(prev.kernel + prev.user)?;
    let idle = now.idle.checked_sub(prev.idle)?;
    (busy > 0).then(|| 100.0 * (busy - idle) as f64 / busy as f64)
}
```

## 10. Kiểm thử

| Mức | Nội dung |
|---|---|
| Rust | `cpu_percent`: mốc bình thường, mốc lùi (đồng hồ nhảy), chia cho 0; định dạng GB |
| TS thuần | ngưỡng màu thanh mức; định dạng `12.4 / 31.7 GB`; từ khóa tìm không dấu |
| Component | card hiện số; đo lại sau 2 giây; rời card thì dừng đo; lỗi thì hiện "—"; nút gọi đúng lệnh |
| Thủ công | `tests/manual-system.md`: so số với Task Manager thật; đo CPU lúc panel mở và lúc đóng |

## 11. Tiêu chí hoàn thành

1. Panel mở: CPU và RAM hiện trong 1 giây, cập nhật 2 giây một lần.
2. Số khớp Task Manager: CPU lệch ≤ 5 điểm phần trăm, RAM lệch ≤ 0.3 GB.
3. Panel đóng: không còn lệnh đo nào chạy (kiểm bằng log lệnh).
4. Nút Task Manager mở đúng, và không mở thêm cửa sổ thứ hai khi đã có sẵn.
5. Command bar: gõ "task" hoặc "quan ly tac vu" ra dòng Mở Task Manager, Enter là chạy.
6. Hiệu năng bản release: panel đóng CPU như trước module (≈0.3% khi có nhạc); panel mở thêm không quá 0.5%. RAM tăng ≤ 5 MB.
7. `npm test`, `cargo test`, clippy, `npm run lint` qua.

## 12. Rủi ro

| Rủi ro | Mức | Cách xử lý |
|---|---|---|
| Đo CPU tốn CPU | Thấp | 2 giây/lần, chỉ khi card hiện; hai lời gọi Win32 rẻ |
| Lần đo đầu phải chờ 150ms | Thấp | Chạy trên luồng blocking, không chặn giao diện |
| Số CPU lệch Task Manager | Trung bình | Cùng cách tính của Windows (idle/kernel/user); ghi mức lệch vào checklist |

## 13. Giới hạn khi làm

- **Luôn:** test trước khi commit; mỗi task một commit; kiểm trên app thật.
- **Hỏi trước:** thêm crate/feature ngoài 2 feature ở §3; thêm chỉ số mới (ổ đĩa, pin, mạng).
- **Không:** chạy lệnh nguồn nào (tắt máy, khởi động lại, ngủ) — đã bỏ khỏi module.

## 14. Quyết định đã chốt

- 2026-09-18: bỏ menu nguồn; card chỉ có Task Manager + CPU + RAM; đo 2 giây/lần khi panel mở; không hiện chỉ số trên pill.
