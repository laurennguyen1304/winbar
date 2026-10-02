# Spec: claude-notices

> Trạng thái: **phát hành trong 0.4.0, 02/10/2026.** Lauren chọn hai việc này từ danh sách tính năng của coucou
> ("1, 3") và chốt hai điểm ở §7 cùng ngày. Đã thử ở bản dev: Lauren thấy cả thông báo xong lẫn thông báo lỗi trên
> pill (gửi qua relay thật bằng sự kiện giả), và một lượt thật 74 giây đã sinh thông báo có dòng tóm tắt. Chưa thử:
> huy hiệu agent con với phiên thật, và một lỗi thật.
>
> **Sửa sau 0.4.0 (02/10/2026, chưa phát hành; pill thông báo đã xem trên notch thật ở bản dev bằng sự kiện giả qua relay thật — tên 52 ký tự hiện đủ, giữ 7 giây; §4b chưa xem trên máy):** Lauren thấy tên phiên bị cắt và thông báo
> biến mất quá nhanh, và muốn mở notch ra là biết từng phiên đang ở đâu. Ba thay đổi: pill thông báo rộng hơn và
> hiện đủ tên phiên (§3), giữ lâu hơn 2 giây (§3), mỗi phiên trên thẻ có một dòng tình trạng (§4b).

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
| Lượt chạy từ **30 giây** trở lên vừa xong | `✓ <phiên> · xong — <một dòng từ câu trả lời cuối>` | 7 giây |
| Lượt dừng vì lỗi | `▲ <phiên> · dừng: <lý do>` | 10 giây |
| Lượt dừng vì chạm giới hạn dùng (`rate_limit`) | `▲ <phiên> · dừng: chạm giới hạn dùng` | 10 giây |

- **Tên phiên hiện đủ** (Lauren, 02/10): `<phiên>` là `<dự án> / <worktree>`, ngoài Orca thì chỉ tên thư mục. Trước
  đây chỉ có tên dự án, bị cắt ở 130 px. Pill thông báo rộng hơn pill của yêu cầu duyệt quyền 150 px (cỡ M: 640 px
  thay vì 490 px), không bao giờ rộng hơn màn hình. Thiếu chỗ thì dòng tóm tắt bị cắt trước, tên chỉ bị cắt khi
  dòng tóm tắt không còn gì (bố cục lưới: bố cục flex làm tên mất một phần pixel, đủ để dấu `…` nuốt hai chữ cái của
  một cái tên còn chỗ — thấy trên notch thật, 02/10). Pill rộng chỉ dành cho thông báo để đọc: yêu cầu duyệt quyền, thứ có nút, giữ cỡ cũ.
- **Giữ 7 và 10 giây** (Lauren, 02/10): lúc đầu là 5 và 8, hết trước khi đọc xong.

- **Lượt ngắn không báo xong** (Lauren, 02/10): hỏi đáp vài giây không làm pill nhấp nháy. Độ dài lượt tính từ
  `UserPromptSubmit` tới `Stop`. winbar mở giữa chừng một lượt thì không biết lượt đó dài bao lâu và không báo.
  Lỗi thì luôn báo, lượt dài hay ngắn.
- **Một dòng từ câu trả lời** (Lauren, 02/10): dòng đầu tiên có chữ của `last_assistant_message`, bỏ ký hiệu
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

## 4b. Dòng tình trạng của từng phiên

Lauren (02/10): hover hay bấm vào notch thì phải thấy từng phiên đang chạy đang ở đâu — đang làm gì, xong gì, hay
đang chờ. Panel đã mở khi hover; thứ thiếu là nội dung của từng dòng. Trên thẻ Phiên Claude, dòng thứ hai của mỗi
phiên là:

| Phiên đang | Dòng tình trạng | Cột giờ |
|---|---|---|
| có yêu cầu duyệt quyền đang chờ trên notch | `Chờ duyệt: <tóm tắt yêu cầu>` | như cũ |
| chạy (`Thinking`, `Cooking · <công cụ>`) | như cũ, kèm các bước gần nhất | như cũ |
| nghỉ, lượt cuối xong | `Xong — <một dòng từ câu trả lời cuối>` | lượt đó xong bao lâu rồi |
| nghỉ, lượt cuối dừng vì lỗi | `Dừng: <lý do>` (nhãn ở §3) | lượt đó dừng bao lâu rồi |
| nghỉ, winbar không thấy lượt nào kết thúc | `idle`, như cũ | như cũ |

- Kết quả lượt cuối là chính thông báo ở §3, Rust giữ thêm một bản **theo phiên** (tối đa 24 phiên, chỉ trong bộ
  nhớ). Mọi lượt đều được ghi, kể cả lượt dưới 30 giây: ngưỡng 30 giây là của pill, không phải của thẻ.
- `UserPromptSubmit` xoá kết quả của phiên đó. Phiên đang chạy không bao giờ hiện kết quả cũ, kể cả khi
  `UserPromptSubmit` bị lỡ: thẻ chỉ dùng kết quả cho phiên đang nghỉ.
- **Không dùng câu lệnh của người dùng** (Lauren, 02/10): thứ cho biết phiên đang làm gì là các bước và câu trả lời
  cuối. Prompt vẫn không rời relay (SPEC-claude-approvals §4.2).
- Dòng này chỉ để đọc. Bấm vào phiên vẫn mở terminal như cũ; duyệt quyền vẫn chỉ ở pill và thẻ riêng của yêu cầu.
- Tắt **Báo khi phiên dừng** thì thẻ chỉ ghi `Xong` và giờ, không trích câu trả lời (§6).
- Cần hook đã cài, như §3. Không cần cài lại: không có sự kiện mới.

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
| `claude_outcomes` | cửa sổ notch | lượt cuối của từng phiên kết thúc thế nào (§4b), theo `sessionId` |
| sự kiện `claude-notices-changed` | — | rỗng; trang tự hỏi lại, cả `claude_outcomes` |
| sự kiện `claude-steps-changed` (đã có) | — | cũng báo khi số agent con đổi, và khi lượt mới xoá kết quả lượt cũ |

Rust chỉ ghi nhận và làm sạch; trang quyết định có vẽ không (ngưỡng 30 giây, công tắc trong Cài đặt) và vẽ bao lâu.
Trang chỉ vẽ thông báo nào nó chưa vẽ và còn mới (dưới 30 giây), nên mở lại trang không phát lại thông báo cũ.

## 6. Bảo mật

| Điều | Cách xử lý |
|---|---|
| Dòng tóm tắt là chữ do mô hình viết, có thể bị nội dung nó vừa đọc chi phối | Chỉ để đọc: thông báo không có nút nào, bấm vào chỉ mở panel. Một dòng, 140 ký tự, ký tự điều khiển / đảo chiều / ẩn viết ra `\u{…}`, vẽ theo thứ tự lưu — như yêu cầu duyệt quyền |
| Dòng tóm tắt giả làm yêu cầu duyệt ("bấm Cho phép…") | Luôn đứng sau `<dự án> · xong —`, màu phụ, không có nút. **Không chặn** việc nó viết gì |
| Chương trình khác cùng tài khoản gửi thông báo giả qua pipe | **Không chặn** (như bước chạy, SPEC-claude-approvals §8): pipe mở cho mọi tiến trình của cùng người dùng. Thông báo giả không làm được gì ngoài hiện chữ |
| Nội dung câu trả lời lộ trên màn hình khi chia sẻ màn hình | Lauren chọn có dòng tóm tắt (§7). Tắt cả thông báo bằng công tắc ở §3; công tắc đó cũng bỏ dòng trích trên thẻ (§4b). **Từ §4b, lộ lâu hơn:** dòng trích nằm trên thẻ cho tới lượt sau, với mọi lượt chứ không chỉ lượt dài — nhưng chỉ khi panel đang mở |
| Pill thông báo rộng hơn che nhiều hơn phần trên màn hình | Trong 7–10 giây, pill phủ thêm 150 px bề ngang. Không có nút nào trên đó; một cú bấm rơi vào nó chỉ mở panel, như trước. **Không chặn** |
| Tóm tắt yêu cầu duyệt quyền hiện thêm ở thẻ (§4b) | Vẫn là chuỗi đã làm sạch của yêu cầu, vẽ theo thứ tự lưu. Thẻ không có nút duyệt: quy tắc "chỉ duyệt thứ đã hiện đủ" (SPEC-claude-approvals §4.5) không đổi |
| Lưu trữ | Chỉ trong bộ nhớ, tối đa 8 thông báo và kết quả lượt cuối của 24 phiên; không ghi ra đĩa, không vào log |
| Tràn | Mọi chuỗi qua pipe bị cắt ở relay và cắt lại ở server; số phiên, số agent, số thông báo đều có trần |

## 7. Lauren đã chốt (02/10/2026)

1. **Báo xong khi nào**: chỉ lượt chạy từ 30 giây trở lên. Lỗi và chạm giới hạn thì luôn báo.
2. **Dòng tóm tắt**: có, một dòng trích từ câu trả lời cuối của Claude.

3. **Sau 0.4.0**: pill thông báo một dòng, rộng hơn (không phải hai dòng); +2 giây; tình trạng từng phiên nằm
   trong thẻ Phiên Claude (không phải một thẻ riêng khi hover); không dùng prompt.

## 8. Kiểm thử

| Mức | Nội dung |
|---|---|
| Rust thuần | đọc bốn sự kiện từ JSON của hook, trường vắng; dòng tóm tắt (dòng đầu có chữ, bỏ markdown, cắt, làm sạch); độ dài lượt; tập agent con và việc xoá khi lượt hết; trần số lượng; hook cài đủ sự kiện mới, bản cài cũ bị coi là chưa đủ |
| Rust qua pipe thật | `Stop` sau `UserPromptSubmit` sinh thông báo có `turnMs`; `StopFailure` sinh thông báo lỗi |
| Rust thuần, §4b | kết quả lượt cuối theo phiên, lượt sau thay lượt trước, `UserPromptSubmit` xoá, trần 24 phiên |
| TS, §4b | dòng tình trạng cho từng trường hợp ở bảng §4b; phiên đang chạy không hiện kết quả cũ; công tắc tắt thì không trích; pill thông báo rộng 640 px, pill yêu cầu duyệt vẫn 490 px |
| TS | lượt ngắn không báo, lượt dài báo; lỗi luôn báo; hết giờ tự gỡ; không che yêu cầu duyệt; công tắc tắt thì không báo; thông báo cũ không phát lại; huy hiệu agent con |
| Thủ công | một lượt dài thật; ngắt mạng giữa lượt; một lượt có agent con |
