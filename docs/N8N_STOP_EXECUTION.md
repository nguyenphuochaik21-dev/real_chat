# Dừng execution n8n từ Chatly

## Trạng thái

Ngày 04/10/2026: đã cấu hình trực tiếp workflow `Demon8n_chat` đang được hai agent
trỏ tới. Workflow đọc cả giao thức `legacy` và `chat`, đã có các node đăng ký/kiểm tra
execution và dùng lịch sử do Chatly cung cấp. Bản gốc được sao lưu trong
`chatly/.local/n8n-backups/` (không đưa vào Git).

`N8N_API_URL` phải cùng origin với webhook của agent. Với cấu hình hiện tại, cả API
và webhook dùng hostname ngrok đã xác minh; callback từ Docker vẫn dùng
`http://host.docker.internal:3000/api/ai/executions`. API key đã có trong `.env.local`.

Chatly hỗ trợ nút Dừng cho cả `/chats` và `/ai`. Khi cấu hình API n8n và thêm node
đăng ký execution vào workflow, nút này gọi `POST /api/v1/executions/{id}/stop`.
Callback được ký riêng cho từng lượt nhắn, không dùng Supabase key hoặc cookie người dùng.
Nếu bấm Dừng trước khi callback đến, callback đăng ký sau đó cũng yêu cầu dừng execution.
Chatly chỉ báo đã dừng n8n khi API xác nhận; lỗi xác thực/kết nối không bị coi là thành công.

Đã kiểm tra n8n local đang chạy trong Docker: phiên bản **2.36.8**, có API stop.
Migration `20261002060000_n8n_execution_control.sql` ghi execution ID và kết quả dừng
trên lượt nhắn hiện có. Migration `20261004020000_completed_ai_memory.sql` chỉ đọc
những lượt hoàn tất của chính chủ hội thoại để làm context. Cả hai đã áp dụng lên Supabase.

## 1. Cấu hình Chatly

Trong n8n: **Settings → n8n API → Create API key**. Key phải được phép đọc và dừng
execution, với quyền truy cập workflow tương ứng. Nếu có chọn scope, chọn
`execution:stop`, `execution:read`. Lưu key trong `chatly/.env.local`, không đưa vào Git/chat:

```dotenv
N8N_API_URL=http://localhost:5678/api/v1
N8N_API_KEY=<key bạn vừa tạo>
N8N_CHATLY_CALLBACK_URL=http://host.docker.internal:3000/api/ai/executions
```

Hai URL đã được điền trong `.env.local` cho môi trường local. Thay cổng `3000` nếu Chatly
chạy cổng khác. `host.docker.internal` giúp n8n trong Docker gọi được Chatly trên Windows.
Khởi động lại `npm run dev` sau khi lưu key.

Production dùng URL HTTPS có thể truy cập từ n8n, ví dụ:

```dotenv
N8N_API_URL=https://n8n.example.com/api/v1
N8N_CHATLY_CALLBACK_URL=https://chatly.example.com/api/ai/executions
```

Origin của `N8N_API_URL` phải trùng origin webhook của agent, và được khai báo trong
`N8N_ALLOWED_ORIGINS`. Tích hợp hiện cấu hình một n8n instance cho server Chatly.
Agent dùng instance khác vẫn chat được, nhưng chưa được dừng execution qua tích hợp này.
Giữ `AI_CONFIG_ENCRYPTION_KEY` hiện có; nó cũng ký callback bằng một ngữ cảnh riêng.

## 2. Đăng ký execution trước khi AI chạy

Có sẵn [file JSON gồm sáu node](n8n/chatly-execution-control-nodes.json), không chứa
credentials. Import thành workflow tạm trong n8n, rồi copy hai nhóm node vào workflow
chat đang dùng. File này chưa có trigger/model và không tự publish hay chạy.
Với `My workflow 3`, sửa Code của `Restore AI Output` từ `AI Agent` thành `AI Agent1`.

Các workflow local `Demon8n_chat` và `My workflow 3` có node tên `Webhook` và
`Normalize Input`. Chèn ba node giữa hai node đó:

```text
Webhook → Chatly Register Execution → IF Chưa hủy → Restore Webhook Input → Normalize Input
```

### HTTP Request: Chatly Register Execution

- Method: `POST`.
- URL (Expression): `={{ $('Webhook').first().json.body.chatlyControl.registerUrl }}`.
- Send Headers: bật; header `Authorization`:
  `={{ 'Bearer ' + $('Webhook').first().json.body.chatlyControl.token }}`.
- Send Body: bật; Body Content Type: JSON; Specify Body: Using JSON.
- JSON (Expression): `={{ { executionId: String($execution.id) } }}`.
- Timeout: `10000` ms. Không bật Continue On Fail / Never Error.

Token và URL do Chatly tự gửi trong `body.chatlyControl` với cả giao thức cũ và mới.
Không nhập API key n8n vào node này. Khi HTTP node lỗi, workflow phải dừng trước AI.

### IF: Chưa hủy

Boolean condition: `={{ $json.cancelled }}` **is false**.
Chỉ nối nhánh true sang `Restore Webhook Input`; để nhánh false kết thúc.

### Code: Restore Webhook Input

Mode: Run Once for All Items. Code:

```javascript
return $("Webhook").all();
```

Bước này giữ nguyên dữ liệu đầu vào cho `Normalize Input`, vì HTTP Request thay `$json`
bằng kết quả callback.

## 3. Kiểm tra trước khi lưu hoặc trả kết quả

Sau AI Agent và trước node ghi database/memory hoặc `Format Output`, thêm một HTTP Request
với cùng cấu hình trên, tiếp đến IF `cancelled is false`.
Nhánh false kết thúc. Nhánh true phục hồi output AI bằng Code rồi chạy bước tiếp theo:

```javascript
// Demon8n_chat: node tên AI Agent
return $("AI Agent").all();
```

Với `My workflow 3`, tên node là `AI Agent1`:

```javascript
return $("AI Agent1").all();
```

Callback có thể gọi lặp lại cho cùng execution, nhưng không cho đổi execution ID của lượt đó.
Kiểm tra lại này giúp bỏ qua ghi/trả kết quả nếu lượt nhắn đã bị hủy.

## 4. Memory và dữ liệu đã lưu

Workflow `Demon8n_chat` đã ngắt kết nối `Simple Memory` với AI Agent. Node vẫn có trên
canvas kèm ghi chú. Không xóa session hay lịch sử đã có.

Chatly gửi `history` gồm tối đa 12 lượt `completed` của cùng tài khoản/hội thoại, giới hạn
32.000 ký tự để tránh context quá lớn. `Normalize Input` đưa history cùng câu hỏi hiện tại
vào prompt. Lượt `cancelled`, `failed`, `processing` và `uncertain` không được đưa vào history.
Các bước lưu câu trả lời của Chatly đã kiểm tra trạng thái hủy nguyên tử trong database.
Vì vậy, lượt bị hủy không trở thành memory cho lần hỏi tiếp theo.

Trong Workflow Settings đã tắt lưu execution thành công/thất bại, lưu lần chạy thủ công
và lưu tiến trình. Execution đang chạy vẫn cần bản ghi tạm của n8n để điều khiển; sau khi
kết thúc, có thể không còn xem được execution đó trong danh sách. Các execution cũ vẫn giữ.
Tin người dùng đã gửi vẫn hiện trong lịch sử Chatly với trạng thái đã dừng.

Các workflow khác muốn có cùng bảo đảm phải dùng `history` và ngắt memory tự ghi tương tự.

Dừng execution không hoàn tác tool đã chạy, dữ liệu đã lưu, hoặc bảo đảm model bên ngoài
ngừng xử lý/tính phí ngay. Với các subworkflow, cần đăng ký/hủy từng execution nếu phiên bản
và cách chạy n8n không truyền cancellation xuống chúng.

## 5. Kiểm tra sau khi cấu hình

1. Publish workflow đã sửa. Gửi một câu hỏi mất vài giây từ `/ai` hoặc `/chats`.
2. Khi execution đang Running, bấm Dừng trên Chatly.
3. Trong n8n, execution tương ứng phải chuyển sang Canceled; không chạy các node kế tiếp.
   Nếu tắt lưu execution, bản ghi có thể được dọn sau khi hủy; Chatly lưu kết quả API dừng
   trong `n8n_stop_status` để vẫn kiểm tra được.
4. Tải lại Chatly: lượt nhắn vẫn có trạng thái đã dừng, không có câu trả lời đến muộn.
5. Gửi câu khác: chat và memory của các lượt hoàn tất trước đó phải hoạt động bình thường.
6. Thử bấm Dừng ngay sau Gửi để kiểm tra trường hợp callback đăng ký đến sau thao tác hủy.

Tài liệu API của phiên bản đang dùng:
https://github.com/n8n-io/n8n/blob/n8n%402.36.8/packages/cli/src/public-api/v1/openapi.yml
