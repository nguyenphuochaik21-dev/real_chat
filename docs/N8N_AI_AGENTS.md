# Thiết lập nhiều AI Agent với n8n

Chatly có trang người dùng `/ai` và trang quản trị `/admin/ai-agents`. Mỗi agent có một
workflow n8n riêng, lịch sử trò chuyện riêng và một `sessionId` riêng theo conversation. Nhiều
agent có thể xử lý đồng thời vì khóa xử lý chỉ áp dụng trong từng conversation.

`ai_agents` và `ai_connections` là cấu hình chuẩn. Agent có nhãn **Mặc định** trả lời
trong `/chats`; các agent khác được chọn tại `/ai`. `/admin/ai` chuyển về
`/admin/ai-agents`. Cấu hình cũ được sao chép sang agent mặc định và giữ lại để các bản
ứng dụng đã triển khai trước migration vẫn hoạt động.

## 1. Chuẩn bị Chatly

Áp dụng các migration theo thứ tự, gồm:

- `20260928010000_ai_agents.sql`
- `20261001010000_ai_agent_rich_outputs.sql`
- `20261001020000_canonical_ai_agents.sql`
- `20261002010000_pin_ai_conversations.sql`
- `20261002020000_retire_abbott_agent.sql`
- `20261002030000_legacy_agent_bootstrap.sql`
- `20261002040000_chat_assistant_reply_index.sql`
- `20261002050000_cancel_ai_generation.sql`

Thiết lập biến môi trường server:

```env
AI_CONFIG_ENCRYPTION_KEY=<base64-32-byte>
N8N_ALLOWED_ORIGINS=https://your-n8n.example.com
```

Có thể tạo khóa bằng PowerShell:

```powershell
$bytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
[Convert]::ToBase64String($bytes)
```

Nếu n8n chạy Docker trên cùng máy khi phát triển:

```env
N8N_ALLOWED_ORIGINS=http://localhost:5678
```

Docker chỉ chạy n8n. Chatly vẫn chạy trực tiếp bằng `npm run dev`.

## 2. Tạo workflow n8n cho từng agent

1. Tạo workflow mới trong n8n.
2. Thêm **Webhook** nhận POST, chọn Respond using **Respond to Webhook node**.
3. Nếu dùng Basic Auth, tạo credential riêng cho agent.
4. Payload Chatly gửi có dạng:

```json
{
  "version": "1.1",
  "action": "sendMessage",
  "sessionId": "chatly:<conversation-uuid>",
  "chatInput": "Nội dung người dùng",
  "attachments": []
}
```

5. Nối trigger với **AI Agent**, model và memory. Dùng `sessionId` làm khóa memory.
6. Trả JSON qua **Respond to Webhook**. Dạng khuyến nghị:

```json
{ "text": "Nội dung trả lời", "attachments": [] }
```

Dạng text tương thích cũ:

```json
{ "output": "Nội dung trả lời" }
```

Dạng mở rộng có file, ảnh, âm thanh hoặc liên kết:

```json
{
  "output": "Tôi đã tạo kết quả.",
  "attachments": [
    {
      "type": "image",
      "url": "https://files.example.com/chart.webp",
      "name": "chart.webp",
      "mimeType": "image/webp",
      "size": 245120,
      "altText": "Biểu đồ"
    },
    {
      "type": "file",
      "url": "https://files.example.com/report.pdf",
      "name": "report.pdf",
      "mimeType": "application/pdf"
    },
    {
      "type": "link",
      "url": "https://example.com/dashboard",
      "title": "Mở dashboard"
    }
  ]
}
```

`type` nhận `image`, `audio`, `file` hoặc `link`. URL output phải là HTTPS, tối đa 12
mục, tổng response tối đa 256 KB. Chatly kiểm tra schema trước khi lưu và chỉ hiển thị liên kết an
toàn trong tab mới.

## 3. Tạo nhiều agent trong Chatly

1. Đăng nhập tài khoản admin.
2. Mở **Quản trị → Quản lý AI Agents** hoặc `/admin/ai-agents`.
3. Chọn **Tạo agent**.
4. Nhập tên, mô tả, lời chào, avatar và Production URL của workflow n8n.
5. Nếu workflow có Basic Auth, nhập username/password. Trình duyệt không nhận lại mật khẩu đã lưu.
   Với webhook Chatly cũ, chọn giao thức **Chatly cũ**, xác thực **Header chứa secret**,
   tên header `X-N8N-SECRET`. Agent được chuyển từ cấu hình cũ có sẵn các giá trị này.
6. Lưu ở trạng thái tắt, bấm **Kiểm tra phản hồi AI**, sau đó bật agent và cho phép người dùng trò chuyện.
7. Tạo thêm agent và lặp lại. Mỗi agent có thể dùng workflow, model, prompt, memory và tools riêng.
8. Người dùng mở mục **AI Agents** ở thanh điều hướng, chọn agent và tạo chat.

Chỉ agent bật, được phép hiển thị và chưa lưu trữ mới xuất hiện cho người dùng.
Một agent có thể được chọn làm mặc định; muốn lưu trữ agent mặc định, hãy chọn
agent mặc định khác trước. Việc lưu trữ giữ nguyên lịch sử chat.

Agent thử nghiệm Abbott AI đã được gỡ khỏi cấu hình. Sáu cuộc trò chuyện và tám lượt nhắn cũ
được giữ dưới dạng lịch sử chỉ đọc; chúng không còn phụ thuộc vào bản ghi agent hay kết nối n8n.

Webhook mới có thể trả `{ "text": "..." }` hoặc `{ "output": "..." }`.
Workflow Chatly cũ có thể trả `{ "ok": true, "requestId": "...",
"conversationId": "...", "assistant": { "text": "..." } }`.
Trường hợp n8n trả HTTP 200 với nội dung rỗng hoặc JSON sai, Chatly báo
`N8N_INVALID_RESPONSE`; hãy kiểm tra execution của workflow và lỗi model/RAG.
Workflow cũ hiện có thể trả nội dung rỗng khi node Gemini vượt hạn mức, dù webhook
vẫn trả HTTP 200. Cần sửa nhánh lỗi trong n8n để trả JSON có `ok: false` cùng
mã HTTP thích hợp; đồng thời tăng hạn mức hoặc đổi model/API key để tiếp tục chat.

## 4. Xử lý lỗi n8n

Trong lúc AI trả lời, khung nhập vẫn cho phép soạn tin tiếp theo. Nút **Dừng phản hồi**
hủy lượt xử lý trong Chatly, ngắt kết nối webhook và ngăn lưu câu trả lời đến muộn.
Tin đã gửi và bản nháp đang soạn được giữ lại. Bạn có thể gửi tin tiếp sau khi dừng hoặc
AI trả lời xong. Lượt đã dừng vẫn có trạng thái riêng khi tải lại lịch sử.
Workflow hoặc tool đã bắt đầu chạy phía n8n có thể tiếp tục thực thi; muốn dừng cả execution
cần bổ sung cơ chế hủy trong workflow n8n.

Tích hợp API dừng execution và hướng dẫn chỉnh workflow nằm trong
[N8N_STOP_EXECUTION.md](N8N_STOP_EXECUTION.md). Cần API key n8n và node đăng ký execution
trước AI; khi chưa cấu hình, nút Dừng vẫn hủy lượt trong Chatly như trên.

Khi n8n timeout, offline, trả HTTP lỗi hoặc JSON sai, Chatly lưu trạng thái thất bại trên lượt nhắn
và hiện thông báo ngay dưới tin nhắn người dùng. Thông báo vẫn còn sau khi tải lại trang. Lỗi một agent
không làm hỏng chat thường, Supabase Auth, Realtime hoặc các agent khác.

Không tự retry workflow có side effect. Khi cần retry, người dùng gửi một tin mới; trong n8n nên dùng
`sessionId` cùng ID execution để chống lặp tool có side effect.

## 5. Chuẩn bị input file/ảnh/âm thanh

Protocol 1.1 đã giữ sẵn mảng `attachments`. Hiện giao diện multi-agent gửi mảng rỗng để workflow text
đang chạy không bị thay đổi. Khi bật upload đầu vào, mỗi phần tử sẽ dùng dạng:

```json
{
  "id": "attachment-uuid",
  "type": "image",
  "name": "photo.webp",
  "mimeType": "image/webp",
  "size": 182340,
  "url": "https://signed-url...",
  "expiresAt": "2026-10-01T12:10:00.000Z"
}
```

File phải được lưu trong bucket private và Chatly chỉ gửi signed URL ngắn hạn cho n8n. Không đưa
Supabase service-role key hoặc cookie người dùng vào workflow. Khi phát triển input media, cần bật đồng
bộ bốn lớp: Storage/RLS, API schema, composer upload và node n8n tải binary. Hợp đồng response media ở
trên đã hoạt động nên n8n có thể trả file, ảnh, audio hoặc link ngay sau khi migration rich output được áp
dụng.
