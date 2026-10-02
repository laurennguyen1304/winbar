# Spec: claude-notices

> Trạng thái: **đã làm, 02/10/2026 — chưa commit.** chủ dự án chọn hai việc này từ danh sách tính năng của coucou
> ("1, 3") và chốt hai điểm ở §7 cùng ngày. Đã thử ở bản dev: chủ dự án thấy cả thông báo xong lẫn thông báo lỗi trên
> pill (gửi qua relay thật bằng sự kiện giả), và một lượt thật 74 giây đã sinh thông báo có dòng tóm tắt. Chưa thử:
> huy hiệu agent con với phiên thật, và một lỗi thật.

## 1. Mục tiêu

Hai thứ notch chưa nói được về một phiên Claude Code:

1. **Phiên vừa dừng**: chạy xong một lượt dài, dừng vì lỗi, hay chạm giới hạn dùng — báo trên pill vài giây.
2. **Phiên đang chạy agent con**: hiện số agent con đang chạy cạnh phiên đó.

**Không làm:** âm thanh; lịch sử thông báo; trả lời Claude từ notch; thông báo của Windows (toast); đọc file
transcript của phiên.

Cả hai dùng hook của winbar (SPEC-claude-approvals §4.2), nên chỉ có khi hook đã cài. Không cài thì notch như cũ.

## 2. Sự kiện

Thêm ba sự kiện vào các hook winbar cài, đều chạy nền (`async`), relay không in gì và luôn thoát 0:

| Sự kiện | winbar lấy gì | Để làm gì |
|---|---|---|
| `Stop` (đã có) | thêm `last_assistant_message` | báo xong, kèm một dòng |
| `StopFailure` | `error` | báo dừng vì lỗi |
| `SubagentStart` | `agent_id` | đếm agent con |
| `SubagentStop` | `agent_id` | đếm agent con |

Tên trường theo tài liệu hook của Claude Code (đọc 02/10/2026). Trường nào cũng coi là có thể vắng: thiếu
`last_assistant_message` thì báo xong không kèm dòng nào, thiếu `error` thì là "lỗi không rõ", thiếu `agent_id` thì
bỏ qua sự kiện.

Người đã cài hook từ bản trước sẽ thấy Cài đặt › Claude báo hook chưa đủ và mời **Cài lại…** — vẫn là xem trước,
sao lưu, rồi mới ghi (SPEC-claude-approvals §4.7). Chưa cài lại thì hai việc ở §1 không chạy, phần còn lại như cũ.

## 3. Báo phiên dừng

| Chuyện gì | Pill | Giữ |
|---|---|---|
| Lượt chạy từ **30 giây** trở lên vừa xong | `✓ <dự án> · xong — <một dòng từ câu trả lời cuối>` | 5 giây |
| Lượt dừng vì lỗi | `▲ <dự án> · dừng: <lý do>` | 8 giây |
| Lượt dừng vì chạm giới hạn dùng (`rate_limit`) | `▲ <dự án> · dừng: chạm giới hạn dùng` | 8 giây |

- **Lượt ngắn không báo xong** (chủ dự án, 02/10): hỏi đáp vài giây không làm pill nhấp nháy. Độ dài lượt tính từ
  `UserPromptSubmit` tới `Stop`. winbar mở giữa chừng một lượt thì không biết lượt đó dài bao lâu và không báo.
  Lỗi thì luôn báo, lượt dài hay ngắn.
- **Một dòng từ câu trả lời** (chủ dự án, 02/10): dòng đầu tiên có chữ của `last_assistant_message`, bỏ ký hiệu
  markdown ở đầu dòng (`#`, `-`, `*`, `>`), tối đa 140 ký tự. Rỗng thì chỉ có `· xong`.
- Lý do lỗi là nhãn tiếng Việt của mã lỗi, không phải chữ do máy chủ trả về:

  | `error` | Nhãn |
  |---|---|
  | `rate_limit` | chạm giới hạn dùng |
  | `overloaded`, `server_error` | máy chủ Claude đang lỗi |
  | `authentication_failed`, `oauth_org_not_allowed`, `cloud_credential_error` | cần đăng nhập lại |
  | `account_on_hold`, `billing_error` | tài khoản có vấn đề thanh toán |
  | `max_output_tokens` | câu trả lời quá dài |
  | mã khác, hoặc không có | lỗi không rõ |

- Thứ tự trên pill: yêu cầu duyệt quyền (5) > báo lỗi (4) > cảnh báo hạn mức (3) > báo xong (2). Báo xong không
  bao giờ che một yêu cầu đang chờ duyệt.
- Bấm vào thông báo mở panel, như mọi alert không có thẻ riêng. Hết giờ thì tự gỡ.
- Nhiều phiên dừng gần nhau: xếp hàng, mỗi cái hiện đủ thời gian của nó, tối đa 8 cái đang chờ; cái cũ hơn 30 giây
  khi tới lượt thì bỏ.
- Tắt được: Cài đặt › Claude › **Báo khi phiên dừng** (bật sẵn). Tắt thì không báo cả xong lẫn lỗi.
- Notch đang ẩn, layout Claude tắt hay widget Phiên Claude tắt: không báo.

## 4. Agent con

- `SubagentStart` thêm `agent_id` vào tập agent đang chạy của phiên; `SubagentStop` bỏ ra.
- Thẻ Phiên Claude: phiên đang chạy có agent con hiện huy hiệu `+N agent` cạnh trạng thái. Pill: `+N` sau tên dự án.
- Tập này bị xoá khi lượt kết thúc (`Stop`, `StopFailure`) hoặc lượt mới bắt đầu (`UserPromptSubmit`), để một
  `SubagentStop` bị lỡ không để lại con số treo mãi. Tối đa 32 agent mỗi phiên.

## 5. Giao diện với Rust

```ts
interface ClaudeNotice {
  id: string;                    // tăng dần trong một lần chạy winbar
  kind: "finished" | "failed";
  sessionId: string;
  title: string;                 // như trên thẻ phiên
  project?: string;
  summary?: string;              // finished: một dòng, đã làm sạch để vẽ
  reason?: string;               // failed: mã lỗi, vd "rate_limit"
  turnMs?: number;               // finished: lượt dài bao lâu; vắng khi không biết
  at: number;                    // epoch ms
}
```

| Lệnh / sự kiện | Ai gọi được | |
|---|---|---|
| `claude_notices` | cửa sổ notch | các thông báo gần đây (tối đa 8), cũ trước |
| `claude_agents` | cửa sổ notch | số agent con đang chạy theo phiên |
| sự kiện `claude-notices-changed` | — | rỗng; trang tự hỏi lại |
| sự kiện `claude-steps-changed` (đã có) | — | cũng báo khi số agent con đổi |

Rust chỉ ghi nhận và làm sạch; trang quyết định có vẽ không (ngưỡng 30 giây, công tắc trong Cài đặt) và vẽ bao lâu.
Trang chỉ vẽ thông báo nào nó chưa vẽ và còn mới (dưới 30 giây), nên mở lại trang không phát lại thông báo cũ.

## 6. Bảo mật

| Điều | Cách xử lý |
|---|---|
| Dòng tóm tắt là chữ do mô hình viết, có thể bị nội dung nó vừa đọc chi phối | Chỉ để đọc: thông báo không có nút nào, bấm vào chỉ mở panel. Một dòng, 140 ký tự, ký tự điều khiển / đảo chiều / ẩn viết ra `\u{…}`, vẽ theo thứ tự lưu — như yêu cầu duyệt quyền |
| Dòng tóm tắt giả làm yêu cầu duyệt ("bấm Cho phép…") | Luôn đứng sau `<dự án> · xong —`, màu phụ, không có nút. **Không chặn** việc nó viết gì |
| Chương trình khác cùng tài khoản gửi thông báo giả qua pipe | **Không chặn** (như bước chạy, SPEC-claude-approvals §8): pipe mở cho mọi tiến trình của cùng người dùng. Thông báo giả không làm được gì ngoài hiện chữ |
| Nội dung câu trả lời lộ trên màn hình khi chia sẻ màn hình | chủ dự án chọn có dòng tóm tắt (§7). Tắt cả thông báo bằng công tắc ở §3 |
| Lưu trữ | Chỉ trong bộ nhớ, tối đa 8 thông báo; không ghi ra đĩa, không vào log |
| Tràn | Mọi chuỗi qua pipe bị cắt ở relay và cắt lại ở server; số phiên, số agent, số thông báo đều có trần |

## 7. Chủ dự án đã chốt (02/10/2026)

1. **Báo xong khi nào**: chỉ lượt chạy từ 30 giây trở lên. Lỗi và chạm giới hạn thì luôn báo.
2. **Dòng tóm tắt**: có, một dòng trích từ câu trả lời cuối của Claude.

## 8. Kiểm thử

| Mức | Nội dung |
|---|---|
| Rust thuần | đọc bốn sự kiện từ JSON của hook, trường vắng; dòng tóm tắt (dòng đầu có chữ, bỏ markdown, cắt, làm sạch); độ dài lượt; tập agent con và việc xoá khi lượt hết; trần số lượng; hook cài đủ sự kiện mới, bản cài cũ bị coi là chưa đủ |
| Rust qua pipe thật | `Stop` sau `UserPromptSubmit` sinh thông báo có `turnMs`; `StopFailure` sinh thông báo lỗi |
| TS | lượt ngắn không báo, lượt dài báo; lỗi luôn báo; hết giờ tự gỡ; không che yêu cầu duyệt; công tắc tắt thì không báo; thông báo cũ không phát lại; huy hiệu agent con |
| Thủ công | một lượt dài thật; ngắt mạng giữa lượt; một lượt có agent con |
