# Chatly: cấu hình AI Assistant qua n8n

## Kiến trúc

```text
Admin /admin/ai → server RBAC → chat_assistant_config (AES-256-GCM)
User /chats → ChatView → POST /api/assistant/messages
  → kiểm tra session + membership + conversation.type = ai
  → transaction lưu user message và claim requestId
  → N8nChatGateway → HTTPS webhook + X-N8N-SECRET
  → validate JSON + requestId + conversationId
  → transaction lưu AI message vào messages
  → Supabase Realtime hiện có → ChatView
```

Chỉ một assistant được quản lý tại `/admin/ai`. Mỗi user có một conversation
`type = ai`; `session.id` luôn bằng `conversation.id`. AI không có tài khoản
Auth, mật khẩu hay profile giả. Tin nhắn AI có `sender_id = null` và
`metadata.sender_type = ai`.

Website chỉ quản lý kết nối. Model, system prompt, memory, embeddings, RAG,
vector store và tools nằm hoàn toàn trong n8n.

Bạn có thể dùng **n8n Cloud trên website** hoặc n8n tự host. Chatly không phụ
thuộc vào container n8n local; điều kiện là workflow có Production Webhook HTTPS
công khai và origin của URL đó được thêm vào allowlist phía server Chatly.

## Chuẩn bị database và Vercel

1. Backup theo quy trình vận hành hiện có. Kiểm tra migration history của môi trường đích.
2. Chạy lần lượt hai migration mới, **mỗi file trong một transaction riêng**:
   - `chatly/supabase/migrations/20260929010000_ai_conversation_type.sql`
   - `chatly/supabase/migrations/20260929020000_chat_assistant.sql`
3. Không reset DB, không dùng `db push --force-reset`. Migration thứ hai cần schema
   Chatly hiện có, gồm `messages.metadata`, `profiles.is_suspended` và
   `conversation_participants.hidden_at`. Không cần migration `ai_agents` để chạy
   assistant tích hợp này. Các migration chưa áp dụng trước đó cần được review riêng.
4. Tạo key ở máy tin cậy:

   ```sh
   node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
   ```

5. Trong Vercel → Project → Settings → Environment Variables, thêm:

   ```dotenv
   AI_CONFIG_ENCRYPTION_KEY=<32 random bytes encoded as base64>
   N8N_ASSISTANT_ALLOWED_ORIGINS=https://n8n.example.com
   SUPABASE_SERVICE_ROLE_KEY=<existing server-only service role key>
   ```

   Giữ nguyên `NEXT_PUBLIC_SUPABASE_URL` và `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
   Không thêm tiền tố `NEXT_PUBLIC_` cho bất kỳ secret nào.
   Allowlist là **origin chính xác** gồm scheme/host/port; có thể phân cách bằng dấu phẩy.

6. Bật/kiểm tra Fluid compute và bảo đảm Function Duration cho hai route gửi AI/test
   ít nhất **150 giây**. Code dùng Node runtime, `maxDuration = 150`; timeout n8n
   được Admin đặt từ 1.000 đến 120.000 ms. Redeploy sau khi đổi environment.
   Kiểm tra giới hạn thực tế trong [Vercel Function duration](https://vercel.com/docs/functions/configuring-functions/duration).

Không thay key mã hóa khi vẫn cần đọc cấu hình cũ. Muốn xoay key cần giải mã bằng
key cũ rồi mã hóa lại bằng key mới trong thao tác bảo trì riêng; giữ bản backup key an toàn.

Gateway chỉ nhận HTTPS, hostname trong allowlist và DNS IPv4 công khai. Nó pin
địa chỉ đã kiểm tra vào kết nối TLS và không theo redirect. localhost, private IP,
metadata IP và endpoint chỉ có IPv6 không được hỗ trợ trong V1. Với n8n self-hosted
nội bộ, cung cấp một HTTPS ingress được bảo vệ bằng Header Auth, trỏ DNS tới IP
công khai và thêm origin đó vào allowlist; không mở quyền gọi private IP từ ứng dụng.

## Workflow n8n: từng bước

1. Vào n8n, tạo workflow mới.
2. Thêm node **Webhook**, giữ tên node chính xác là `Webhook`.
3. HTTP Method: **POST**. Path ví dụ: `chatly-assistant`.
4. Authentication: **Header Auth**. Tạo credential:
   - Name: `X-N8N-SECRET`
   - Value: một secret ngẫu nhiên, ít nhất 16 ký tự ASCII không có khoảng trắng.
5. Respond: **Using 'Respond to Webhook' Node**. Không bật streaming, không bật Raw Body.
6. Thêm node **Edit Fields (Set)**, đặt tên chính xác `Normalize Input`.
   Dùng Manual Mapping và tạo các trường string sau:

   | Field            | Expression                         |
   | ---------------- | ---------------------------------- |
   | `message`        | `{{ $json.body.message.text }}`    |
   | `conversationId` | `{{ $json.body.conversation.id }}` |
   | `sessionId`      | `{{ $json.body.session.id }}`      |
   | `userId`         | `{{ $json.body.user.id }}`         |
   | `requestId`      | `{{ $json.body.requestId }}`       |
   | `event`          | `{{ $json.body.event }}`           |

7. Nối `Webhook → Normalize Input`.
8. Thêm **AI Agent**. Source for Prompt/User Message: **Define below**.
9. Prompt/User Message expression chính xác:

   ```text
   {{ $('Normalize Input').first().json.message }}
   ```

10. Nối `Normalize Input → AI Agent`.
11. Nối Chat Model bạn chọn vào cổng Chat Model của AI Agent. Cấu hình LLM credential
    trực tiếp trong n8n. AI Agent hiện tại cần ít nhất một Tool; nối tool nghiệp vụ,
    RAG tool hoặc Calculator để chạy thử.
12. Nối Memory vào cổng Memory. Session ID: **Define below**; Session Key:

    ```text
    {{ $('Normalize Input').first().json.sessionId }}
    ```

    Khi quay lại cùng conversation, giá trị này không thay đổi. Với production cần
    lưu bền vững, chọn Postgres Chat Memory hoặc memory backend phù hợp. Simple Memory
    chỉ phù hợp thử nghiệm; không dùng Simple Memory với queue mode theo
    [tài liệu n8n](https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.memorybufferwindow/).

13. Nếu cần RAG, nối Vector Store Tool vào AI Agent và chọn Supabase Vector Store
    hoặc backend khác. Cấu hình embeddings, tài liệu và bộ lọc quyền dữ liệu tại n8n.
14. Nếu cần, nối thêm tools vào AI Agent. Website không cần sửa khi response contract giữ nguyên.
15. Thêm node **Code**, tên `Format Output`, chế độ **Run Once for All Items**.
    Nối `AI Agent → Format Output`. Dán:

    ```js
    const input = $("Normalize Input").first().json;
    const output = $input.first().json.output;
    if (typeof output !== "string" || !output.trim()) {
      throw new Error("Missing assistant output");
    }
    return [
      {
        json: {
          ok: true,
          requestId: input.requestId,
          conversationId: input.conversationId,
          assistant: {
            text: output,
            format: "markdown",
            sources: [],
          },
        },
      },
    ];
    ```

16. Thêm **Respond to Webhook** và nối `Format Output → Respond to Webhook`.
17. Respond With: **JSON**, Response Code: **200**. Response Body chuyển sang Expression:

    ```text
    {{ $json }}
    ```

    Trả **một JSON object**, không bọc thành array và không JSON.stringify thêm lần nữa.

18. Publish/Activate workflow. Copy **Production URL** từ Webhook; không dùng Test URL.
    [n8n Webhook](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/)
    phân biệt URL test và production; [Respond to Webhook](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.respondtowebhook/)
    định nghĩa response trả cho website.
19. Đăng nhập Chatly bằng Admin → `/admin` → **AI Assistant**.
20. Nhập tên, mô tả, lời chào và avatar tùy chọn. Avatar dùng URL công khai trong bucket
    `profile-avatars` của Supabase Chatly để tương thích CSP/Image hiện có.
21. Paste Production Webhook URL và secret giống credential `X-N8N-SECRET` trong n8n.
    Đặt timeout, chọn Bật AI và **Lưu cấu hình**.
22. Bấm **Test Connection**. Kết quả cần là **CONNECTED**. Test gọi workflow thật bằng
    `event = connection.test`, message `Connection test`, session UUID riêng; không ghi
    tin nhắn vào conversation của user. Có thể phát sinh chi phí model.
23. Đăng nhập bằng tài khoản User → Chats → bấm tên AI → gửi `Xin chào`.
24. Kiểm tra tin nhắn user xuất hiện, trạng thái đang trả lời, phản hồi AI qua realtime;
    reload và mở lại conversation để kiểm tra lịch sử. Dùng User B để kiểm tra lịch sử riêng.

Các expression trên phụ thuộc tên `Normalize Input`. Nếu đổi tên node, đổi expression tương ứng.
Nếu bật structured output parser khiến `AI Agent.output` thành object, sửa riêng bước Format
Output để lấy một string cho `assistant.text`; không đổi contract website.

Có thể thêm nhánh IF sau Normalize Input: khi `event === connection.test`, trả contract
thành công với text `Connected` rồi Respond to Webhook để kiểm tra kết nối mà không gọi LLM.
Nhánh chat bình thường vẫn chạy AI Agent. Test nhánh này chỉ xác nhận kết nối, không xác nhận model.

## Request chính xác của website

Header: `Content-Type: application/json`, `X-N8N-SECRET: <server secret>`.

```json
{
  "version": "1.0",
  "event": "chat.message.created",
  "requestId": "11111111-1111-4111-8111-111111111111",
  "conversation": { "id": "22222222-2222-4222-8222-222222222222" },
  "message": {
    "id": "11111111-1111-4111-8111-111111111111",
    "text": "Xin chào",
    "createdAt": "2026-09-29T00:00:00.000Z"
  },
  "user": { "id": "33333333-3333-4333-8333-333333333333", "role": "USER" },
  "session": { "id": "22222222-2222-4222-8222-222222222222" }
}
```

Role lấy từ DB; user ID lấy từ Supabase Auth. Không gửi cookie, session token, email,
password, OAuth token hoặc DB credential. Request ID bằng ID tin nhắn user và là UUID.

## Response chính xác của n8n

```json
{
  "ok": true,
  "requestId": "11111111-1111-4111-8111-111111111111",
  "conversationId": "22222222-2222-4222-8222-222222222222",
  "assistant": {
    "text": "Xin chào! Tôi có thể giúp gì cho bạn?",
    "format": "markdown",
    "sources": []
  }
}
```

`format` nhận `text` hoặc `markdown`. V1 hiển thị nội dung bằng renderer text/link an toàn
hiện có; không chạy HTML hay render Markdown HTML. Sources tối đa 20 mục, ví dụ:

```json
{
  "title": "Tài liệu",
  "url": "https://example.com/document",
  "documentId": "doc-1",
  "score": 0.94
}
```

URL source chỉ HTTP/HTTPS; title được React escape. `url`, `documentId`, `score` là optional.
Tin nhắn gửi tối đa 8.000 ký tự; trả lời tối đa 32.000 ký tự, body response tối đa 256 KiB.

## Lỗi, retry và vận hành

- `AI_DISABLED`: giữ lịch sử, không gọi n8n cho request mới.
- `FORBIDDEN`: user không có quyền/membership hoặc giả mạo conversation.
- `INVALID_MESSAGE`: trống, chỉ khoảng trắng, dài quá giới hạn hoặc field ngoài contract.
- `AI_BUSY`: đã có request đang chạy trong conversation; `RATE_LIMITED`: 10 request/user/phút.
- `N8N_TIMEOUT`, `N8N_UNAVAILABLE`, `N8N_INVALID_RESPONSE`: UI hiển thị lỗi chung;
  user message đã lưu vẫn tồn tại. Admin có trạng thái và mã lỗi đã chuẩn hóa.
- `INTERNAL_ERROR`: kiểm tra cấu hình server/migration; không đưa stack trace xuống browser.

Không có automatic retry. Gửi lại cùng requestId/content/conversation trả trạng thái cũ,
không gọi workflow lần nữa. Nếu mất response, kiểm tra lịch sử trước khi gửi tin nhắn mới.
Unique index chống hai AI reply cho cùng requestId. Request processing quá 3 phút được đánh
dấu failed khi có lượt gửi mới; không tự chạy lại workflow. Nếu process bị dừng sau khi n8n
đã thực hiện tool nhưng trước khi lưu reply, tác dụng ở n8n có thể đã xảy ra. Tools có side
effect nên có idempotency riêng dựa trên requestId; website không bảo đảm exactly-once ở n8n.

Admin disable không hủy workflow đã bắt đầu. Tránh log request headers/credential ở n8n;
đặt execution retention phù hợp vì n8n có thể lưu nội dung user gửi.

## Kiểm thử

Từ `chatly/`:

```sh
npm run lint
npm run typecheck
npx playwright test e2e/chat-assistant.spec.ts e2e/assistant-rbac.spec.ts e2e/session-redirect.spec.ts e2e/app-shell.spec.ts --workers=2
npm run build
```

Kiểm thử SQL cách ly (Docker, không dùng `.env.local`):

```sh
docker run --detach --name chatly-assistant-test-db --env POSTGRES_HOST_AUTH_METHOD=trust --publish 127.0.0.1:15439:5432 postgres:17-alpine
node scripts/test-chat-assistant-db.mjs
docker rm --force --volumes chatly-assistant-test-db
```

Fixture SQL dùng các bảng/RLS cơ sở từ migration hiện có, cộng các cột cần thiết;
không phải bản sao toàn bộ Supabase production. Script tự tạo/xóa database test riêng.

Nếu Windows Application Control chặn native binding SWC/Tailwind, dùng môi trường Linux
Docker để chạy `npm ci`, `npm run build` và `npm run start`. Việc build thành công với SWC
WASM chưa đủ để xác nhận CSS: Tailwind WASM trên máy Windows này không quét đầy đủ nguồn.
Không dùng bản CSS đó để đánh giá giao diện. Dependency lockfile thông thường hoạt động
trong môi trường Linux đã dùng để xác minh bản production.

Trước khi rollout, trên staging đã áp migration: kiểm tra Admin save/masked fields/test;
normal User gọi `/api/admin/ai` nhận 403; AI A/B không đọc chéo; disabled giữ lịch sử;
thử n8n thành công/timeout/500; kiểm tra một reply sau realtime reconnect, unread,
mobile, human chat, group, attachments, friends và notification. Chạy workflow thật
chỉ sau khi owner đã cấu hình model/credential.
