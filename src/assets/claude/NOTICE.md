# Claude status images

| File | Nguồn |
|---|---|
| `claude-fu-transparent.gif` | chủ dự án đưa vào, dùng từ mockup đầu tiên |
| `claude_headstone.png` | chủ dự án đưa vào, dùng từ mockup đầu tiên — **không còn dùng từ 20/09/2026**, giữ file lại phòng khi đổi ý |
| `working.gif` | chủ dự án đưa vào yasb; theo `NOTICE.md` của yasb đây là ảnh người dùng tự thêm, nên dùng lại được |
| `clawd-sleeping.png` · `clawd-angry.png` · `clawd-sparkles.png` · `clawd-thinking.png` | chủ dự án đưa vào 19/09/2026 (bộ "clawd" của icons8, 48×48 pixel art) |

Gán theo trạng thái (chủ dự án chốt 19/09, sửa 20/09/2026):

| Trạng thái | Ảnh trong vòng xoay |
|---|---|
| `idle` | `clawd-sleeping.png` · `clawd-angry.png` |
| `thinking`, `tool` | `clawd-sparkles.png` · `claude-fu-transparent.gif` · `working.gif` |
| `permission` | `clawd-thinking.png` · `claude-fu-transparent.gif` (viền màu `--warn`) |

`claude_headstone.png` bị bỏ khỏi vòng xoay ngày 20/09: ảnh minh họa 256px đứng cạnh pixel art 48px trong cùng một
ô 24px trông như của app khác. Icon tab "Claude" trong panel cũng đổi sang `clawd-sleeping.png` cho đồng bộ.

Ảnh `spark_*.png` và `logo.png` của yasb **không** được sao chép vào đây: chúng thuộc
[m1ckc3s/claude-status-bar](https://github.com/m1ckc3s/claude-status-bar) (MIT), chưa dùng tới.

Thêm ảnh mà không cần build lại: thả file vào `%APPDATA%\winbar\claude-icons\<trạng thái>\`
(`idle`, `thinking`, `tool`, `permission`) — xem `SPEC-claude.md` §5.4.
