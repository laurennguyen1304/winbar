# Changelog

Ghi theo ngày, mới nhất ở trên. Mỗi mục là một thay đổi người dùng nhìn thấy được; chi tiết kỹ thuật nằm trong
các file `SPEC-*.md` ở gốc repo. Từ 0.2.0, mục nào đổi số phiên bản thì tiêu đề ghi cả số đó: winbar trên máy bạn
sẽ báo bản mới trên pill.

## 0.4.0 — 02/10/2026

### Tính năng

- **Thả file vào notch để hỏi Claude.** Kéo một file từ Explorer thả lên pill: pill báo *Thả để hỏi Claude*, và
  thả xong thì một cửa sổ terminal mở ra với Claude Code đã biết file đó là file nào. Claude chưa đọc gì cho tới khi
  bạn gõ câu hỏi. Nhận PDF, ảnh (`.png` `.jpg` `.jpeg` `.gif` `.webp`), `.csv` `.xlsx` `.xls`, `.docx` `.doc`,
  tối đa 10 file một lần; loại khác, thư mục, shortcut và đường dẫn mạng bị từ chối ngay lúc kéo vào, pill nói lý do.
  Phiên mở kiểu này **luôn hỏi quyền** dù cài đặt thường ngày của bạn là gì, và đứng trong một thư mục riêng của
  winbar chứ không phải thư mục chứa file — nên lần đầu Claude Code hỏi có tin thư mục `claude-drop` không (trả lời
  một lần), và khi trả lời câu hỏi đầu tiên Claude xin phép đọc file. Cần widget Phiên Claude đang bật và `claude`
  có trên `PATH`.
- **Báo khi phiên Claude dừng.** Một lượt chạy từ 30 giây trở lên kết thúc thì pill hiện `✓ <dự án> · xong` kèm
  một dòng từ câu trả lời cuối, trong 5 giây. Phiên dừng vì lỗi hay chạm giới hạn dùng thì luôn báo, trong 8 giây.
  Thông báo không bao giờ che một yêu cầu đang chờ duyệt. Tắt ở Cài đặt › Claude › *Báo khi phiên dừng*.
- **Số agent con.** Phiên đang chạy agent con hiện `+N agent` trên card Phiên Claude và `+N` trên pill.

  Hai mục trên dùng hook duyệt quyền. **Đã cài hook từ 0.3.0 thì phải cài lại:** Cài đặt › Claude sẽ báo hook chưa
  đủ, bấm *Cài lại…* (vẫn xem trước và sao lưu như cũ), rồi mở lại phiên Claude Code.

### Thay đổi

- **Phiên mới hiện lên notch nhanh hơn sau khi thả file**: trong 20 giây sau một lần thả, winbar nhìn danh sách phiên
  0,4 giây một lần thay vì 5 giây.

## 0.3.0 — 01/10/2026

### Tính năng

- **Duyệt quyền Claude Code ngay trên pill.** Khi Claude Code xin quyền chạy một tool, pill hiện tên project và câu
  lệnh, kèm nút *Từ chối* và *Cho phép*; bấm xong là phiên chạy tiếp, không phải quay lại terminal. *Cho phép* chỉ có
  trên pill khi pill hiện đủ cả yêu cầu (một lệnh ngắn, một dòng). Yêu cầu dài hơn thế — lệnh dài, lệnh nhiều dòng,
  sửa hay ghi file — thì nút là *Xem…*: mở thẻ đọc đủ tham số, cuộn hết rồi duyệt ở đó. Thẻ ở yên cho tới khi bạn trả
  lời hoặc tự thu lại. Terminal vẫn hỏi song song, trả lời ở đâu trước thì tính ở đó, và winbar tắt thì Claude Code
  hỏi như chưa từng có winbar. Phiên không có người ngồi trước (`claude -p`, agent chạy nền) cũng lên pill, và chờ
  tối đa 5 phút trước khi bị từ chối như cũ.
  **Tắt sẵn.** Bật ở Cài đặt › Claude › *Duyệt quyền trên notch*: winbar cho xem đúng phần sẽ thêm vào
  `settings.json` của Claude Code, sao lưu file cũ rồi mới ghi; gỡ cũng ở đó. Phiên Claude Code đang mở có thể phải
  mở lại mới dùng hook mới. Cần Git Bash (Claude Code trên Windows vốn dùng nó để chạy hook).
- **Các bước của phiên đang chạy.** Đã bật duyệt quyền thì card Phiên Claude hiện ba bước gần nhất dưới phiên đang
  làm việc: đọc file nào, chạy lệnh gì. Chỉ tên file, không kèm thư mục.

### Thay đổi

- **Notch mở có độ nảy, đóng dứt khoát.** Mở panel dùng chuyển động lò xo; thu gọn 340 ms không nảy. Trước đây cả
  hai chiều dùng chung một đường cong 420 ms nên lúc đóng cũng hơi nảy.

## 0.2.1 — 29/09/2026

### Sửa lỗi

- **Sticky không còn chừa một khe trống giữa notch và cửa sổ phóng to ở màn hình phụ.** Khi hai màn hình có tỉ lệ
  khác nhau (ví dụ 125% và 100%), dải giữ chỗ ở màn hình phụ đôi khi bị tính theo tỉ lệ của màn hình chính: notch
  cao 36px nhưng dải cao 45px, nên để lộ hình nền giữa notch và cửa sổ bên dưới. Trước đây lỗi chỉ hết khi đổi cài
  đặt hoặc mở lại winbar.

## 28/09/2026

### Tài liệu

- **Ghi rõ giới hạn: phiên Claude Code chạy trên cloud không hiện trên notch.** Phiên mở trong Claude Desktop với
  môi trường cloud, trên claude.ai/code hay bằng `claude --cloud` chạy hook trên máy chủ cloud, nên máy bạn không
  có file trạng thái nào của chúng. Khi đó pill vẫn hiện phiên local gần nhất, thường là "idle". Xem mục 6 của
  [Vẫn không hiện](docs/claude-status-hook.md#vẫn-không-hiện).

## 0.2.0 — 25/09/2026

### Tính năng

- **Báo có bản mới trên pill.** Tối đa một tuần một lần, winbar đọc số phiên bản trên GitHub; có bản mới hơn thì
  pill hiện "↑ Có bản winbar …" với nút *Xem* (mở trang này) và *Để sau*. Bấm nút nào thì bản đó cũng không báo lại.
  Cài đặt › Chung có công tắc *Tự kiểm tra bản mới* (bật sẵn) và nút *Kiểm tra ngay*. Đây là bản đầu tiên có tính
  năng này: bản đang cài trên máy bạn chưa có nên không tự báo được bản này, cần cập nhật tay một lần.

### Tài liệu

- **Hướng dẫn tạo hook trạng thái Claude Code** ([docs/claude-status-hook.md](docs/claude-status-hook.md)). Widget
  phiên Claude chỉ đọc file do hook này ghi ra, nên máy chưa có hook thì pill Claude không bao giờ hiện, dù đã bật
  widget. Trang mới có cách kiểm tra máy đã có hook chưa, một prompt dán vào Claude Code để nó tự tạo hook, định
  dạng file winbar đọc, và các lý do khác khiến pill không hiện.

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
