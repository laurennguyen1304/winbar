# Spike: nền kính mờ, bo góc và RAM (Task 2)

> Ngày: 2026-09-16 · Máy: Windows 11 25H2 (build 26200), **ARM64**, màn hình 1920×1200, Transparency effects **bật**, cắm sạc.
> Tauri 2.11.5 · window-vibrancy 0.8 · WebView2 153. Code spike không được merge (chỉ giữ tài liệu và ảnh).

## Cách thử

Cửa sổ không viền, trong suốt, luôn nằm trên, không lấy focus (đúng như notch thật), đặt giữa mép trên, cách 8px.
Hai kích thước: pill 340×40 (bo 20px) và panel 780×486 (bo 28px). Chụp màn hình vùng notch sau 6 giây.

| Cách | Làm gì |
|---|---|
| `css` | Không dùng hiệu ứng Windows. Nền CSS `rgba(20,24,32,0.70)` + viền, bo góc bằng CSS |
| `css-dense` | Như trên, độ đục 0.90 |
| `acrylic-region` | `apply_acrylic` (backdrop Windows 11) + cắt bo góc bằng `SetWindowRgn` |
| `acrylic-dwm` | `apply_acrylic` + bo góc có sẵn của Windows 11 (`DWMWCP_ROUND`) |
| `mica` | `apply_mica` + `SetWindowRgn` |
| `blur-region` | `apply_blur` (kiểu làm mờ cũ) + `SetWindowRgn` |

## Kết quả

| Cách | Làm mờ desktop phía sau | Bo góc | Nhận xét |
|---|---|---|---|
| `css` | Không (chỉ trong suốt) | **Đúng 20/28px, mượt** | Chữ phía sau lộ rõ, khó đọc trên nền rối |
| `css-dense` | Không | **Đúng, mượt** | Đọc tốt; nền rối vẫn thấy mờ mờ. Nhìn gần mockup nhất |
| `acrylic-region` | **Không** — hiện thành khối xám phẳng `#555` | **Không** — vẫn vuông | Hỏng |
| `acrylic-dwm` | **Không** — khối xám phẳng | Chỉ bo ~8px (Windows cố định) | Hỏng |
| `mica` | Không — màu tối phẳng | Vuông | Hỏng |
| `blur-region` | Có làm mờ nhưng gần như đục, tối | Vuông | Không đạt bo góc |

Ảnh chụp của spike này **không đưa lên repo**: chúng chụp notch đè lên màn hình thật, nên dính cả tab trình duyệt và cửa sổ phía sau. Kết luận ở trên là đủ để đọc; muốn xem lại thì chạy lại spike trên máy mình.

### Vì sao acrylic/mica không dùng được

1. **Backdrop của Windows 11 (acrylic, mica) chỉ vẽ khi cửa sổ đang được focus.** Notch cố ý không lấy focus
   (để không cướp bàn phím của app đang dùng), nên Windows luôn vẽ màu thay thế: khối xám phẳng.
2. **`SetWindowRgn` không cắt được cửa sổ trong suốt của Tauri/WebView2** (thử cả khi tạo và sau 1.5s): góc vẫn vuông.
   Bo góc có sẵn của Windows 11 chỉ ~8px, không chỉnh được thành 20–28px.
3. Kiểu làm mờ cũ (`apply_blur`) vẫn chạy khi không focus, nhưng ra màu gần như đục và cũng không bo góc được.

## RAM

Đo tổng bộ nhớ riêng (private) của `winbar.exe` + các tiến trình WebView2 con, 6 giây sau khi mở, bản **dev (debug)**:

| Cách | Private MB | Working set MB* |
|---|---|---|
| Tất cả các cách | **161–173** | 396–411 |

\* Working set cộng trùng bộ nhớ dùng chung giữa 8 tiến trình, nên cao hơn thực tế; Task Manager hiển thị gần với cột Private.

**Bản release** (`css-dense`, pill, không làm gì trong 60 giây, 7 tiến trình):

| Thời điểm | Private MB | CPU trung bình |
|---|---|---|
| 10s sau khi mở | 137.2 | — |
| 70s sau khi mở | **135.3** | **0.02%** (của 12 nhân) |

Đạt tiêu chí 9 của spec (RAM < 150 MB, CPU < 1%). Còn ~15 MB dư cho widget; cần đo lại ở Task 13.

## Quyết định (Checkpoint 0)

Bạn chọn **`css-dense`** cho v1 (2026-09-16).

## Đề xuất

1. **Dùng nền CSS đặc (`css-dense`) cho v1**: `rgba(20,24,32,0.90)`, viền `rgba(255,255,255,0.14)`, bo góc bằng CSS.
   Giữ đúng hình dạng và bo góc của mockup, đọc tốt trên mọi hình nền; mất hiệu ứng làm mờ desktop phía sau.
   Có thể thêm lớp ánh sáng nhẹ (gradient mờ ở mép trên) để vẫn có cảm giác "kính".
2. **Bỏ acrylic/mica khỏi v1.** Muốn làm mờ thật thì phải có cửa sổ lấy focus hoặc tự vẽ lại ảnh desktop,
   cả hai đều trái yêu cầu "không cướp focus" hoặc tốn CPU. Ghi vào v2 để thử lại khi Windows/WebView2 hỗ trợ.
3. **RAM:** bản release ~135 MB, đạt mục tiêu < 150 MB. Giữ nguyên tiêu chí; dư địa nhỏ nên đo lại sau mỗi giai đoạn.

## Phát hiện phụ

- Pill cách mép trên 8px **đè lên thanh yasb** đang ở mép trên màn hình (cao ~32px). Khi dùng song song cần
  tăng khoảng cách mép trên (ví dụ 40px) hoặc tắt thanh yasb.
- Nền trong suốt của Tauri (`transparent: true`) và bo góc CSS hoạt động tốt trên ARM64, không có viền đen.
