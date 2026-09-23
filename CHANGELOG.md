# Changelog

Ghi theo ngày, mới nhất ở trên. Mỗi mục là một thay đổi người dùng nhìn thấy được; chi tiết kỹ thuật nằm trong
các file `SPEC-*.md` ở gốc repo.

## 22/09/2026

### Sửa lỗi

- **Notch bị cắt hai bên và phía dưới trên máy để cỡ chữ lớn.** WebView2 vẽ trang ở scale màn hình **nhân** với
  Text size (Cài đặt Windows › Accessibility › Text size), nhưng cửa sổ lại được tính theo scale màn hình, nên nhỏ
  hơn nội dung. Notch, dải sticky và command bar giờ tính theo tỉ lệ vẽ thật của trang, và tính lại mỗi khi tỉ lệ
  đó đổi (sang màn hình khác DPI, hoặc đổi Text size).
- **Cửa sổ Cài đặt bị cắt mất phần dưới và bên phải.** Cửa sổ mở cố định 1000×680 nên không vừa màn hình nhỏ
  (laptop 1920×1080 ở scale 150% chỉ còn ~1280×672 để hiển thị). Giờ cửa sổ co theo vùng làm việc của màn hình
  chính, cỡ tối thiểu 640×480. Trong trang, nội dung co theo bề ngang cửa sổ, hàng hẹp thì nút chọn xuống dòng
  dưới tiêu đề, và khung xem trước tự thu nhỏ cho vừa.
- **Panel mở rộng hơn màn hình.** Mức "Rộng" là 860px, trong khi màn 1280px ở scale 150% chỉ rộng 853px. Panel
  giờ tự co lại cho vừa màn hình.
- **Chỉ bật nhạc và phiên Claude thì hở một cột trống.** Hai ô lớn không còn ô nhỏ nào bên cạnh mà lưới vẫn giữ ba
  cột, để trống ~180px bên phải. Hai ô giờ chia nhau trọn chiều ngang.

### Thay đổi

- **Xếp lại các ô trong panel.** Ô nhỏ không còn dồn hết vào cột hẹp bên phải: mỗi ô vào cột đang kết thúc cao
  nhất, ô cao xếp trước. Khi hạn mức Claude hiện nhiều tài khoản, cột hẹp cũ cao tới ~510px, nhạc và phiên Claude
  trống hơn nửa bên cạnh mà hạn mức vẫn bị cắt; giờ ô máy (Core) xuống dưới phiên Claude, hạn mức có nguyên một
  cột, cả dải cao ~370px. Tỉ lệ cột đổi từ `1.1 : 1.25 : 0.78` sang `1 : 1.1 : 1`.

### Tài liệu

- README nói rõ cách cập nhật: thoát winbar trước khi build lại, nếu không build sẽ dừng ở lỗi
  `Access is denied` vì Windows khoá file exe đang chạy.
