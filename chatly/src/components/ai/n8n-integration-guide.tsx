'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

type AuthType = 'none' | 'basic' | 'header_secret'

const REQUEST_EXAMPLE = JSON.stringify(
  {
    version: '1.1',
    action: 'sendMessage',
    sessionId: 'conversation-id',
    chatInput: 'Xin chào',
    attachments: [],
  },
  null,
  2
)

const FORMAT_OUTPUT_CODE = [
  'const result = $input.first().json;',
  'const text = result.text ?? result.output ?? result.assistant?.text;',
  'if (typeof text !== "string" || !text.trim()) {',
  '  throw new Error("AI Agent did not return text");',
  '}',
  'const attachments = Array.isArray(result.attachments) ? result.attachments : [];',
  'return [{ json: { text: text.trim(), attachments } }];',
].join('\n')

function CopyValue({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="space-y-2 rounded-xl border border-[var(--border-default)] bg-[var(--bg-app)] p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">{label}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={async () => {
            await navigator.clipboard.writeText(value)
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1500)
          }}
        >
          {copied ? 'Đã chép' : 'Sao chép'}
        </Button>
      </div>
      <pre className="overflow-x-auto text-xs whitespace-pre-wrap text-[var(--text-secondary)]">
        <code>{value}</code>
      </pre>
    </div>
  )
}

export function N8nIntegrationGuide({
  authType,
  headerName,
  protocol,
}: {
  authType: AuthType
  headerName: string
  protocol: 'chat' | 'legacy'
}) {
  return (
    <details className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-app)] p-4">
      <summary className="cursor-pointer font-semibold">Hướng dẫn kết nối n8n</summary>
      <div className="mt-4 space-y-5 text-sm leading-6">
        <p>
          Tạo workflow:{' '}
          <strong>Webhook → Normalize Input → AI Agent → Format Output → Respond to Webhook</strong>
          . Tạo và kiểm tra workflow trong n8n, sau đó Publish trước khi dùng Production URL.
        </p>
        {protocol === 'legacy' ? (
          <p className="rounded-lg border border-amber-500/40 p-3">
            Agent này đang dùng giao thức Chatly cũ. Giữ nguyên workflow hiện tại. Khi tạo workflow
            mới, chọn giao thức Chatly Agent 1.1 trong phần Cài đặt nâng cao rồi làm theo các bước
            dưới đây.
          </p>
        ) : (
          <>
            <section className="space-y-2">
              <h3 className="font-semibold">1. Webhook</h3>
              <p>
                Chọn phương thức POST và Respond = Using Respond to Webhook Node. Sao chép
                Production URL đầy đủ vào form agent.
              </p>
              {authType === 'none' && (
                <p>Authentication = None. Chỉ dùng khi endpoint đã được bảo vệ bằng cách khác.</p>
              )}
              {authType === 'header_secret' && (
                <p>
                  Authentication = Header Auth. Tên header là{' '}
                  <code>{headerName || 'X-N8N-SECRET'}</code>. Trong n8n, đặt giá trị credential
                  giống secret bạn nhập trong form. Secret đã lưu không được hiển thị lại.
                </p>
              )}
              {authType === 'basic' && (
                <p>
                  Authentication = Basic Auth. Tạo credential username/password trong n8n giống hai
                  ô trong form agent.
                </p>
              )}
            </section>
            <section className="space-y-2">
              <h3 className="font-semibold">2. Normalize Input (Edit Fields)</h3>
              <p>
                Đổi tên node thành <strong>Normalize Input</strong>. Request Chatly thực sự gửi là:
              </p>
              <CopyValue label="Request mẫu" value={REQUEST_EXAMPLE} />
              <div className="grid gap-2 sm:grid-cols-2">
                <CopyValue label="version" value="={{ $json.body.version }}" />
                <CopyValue label="action" value="={{ $json.body.action }}" />
                <CopyValue label="sessionId" value="={{ $json.body.sessionId }}" />
                <CopyValue label="chatInput" value="={{ $json.body.chatInput }}" />
                <CopyValue label="attachments" value="={{ $json.body.attachments ?? [] }}" />
              </div>
            </section>
            <section className="space-y-2">
              <h3 className="font-semibold">3. AI Agent và Memory</h3>
              <p>
                Prompt Source = Define below. Dùng chatInput làm User Message. Kết nối Chat Model
                và, nếu cần, thêm RAG hoặc tools. Có thể dùng Ollama, Gemini, OpenAI hoặc model khác
                n8n hỗ trợ. Memory phải dùng sessionId làm session key để các cuộc trò chuyện không
                trộn lẫn.
              </p>
              <CopyValue
                label="AI Agent: User Message"
                value="={{ $('Normalize Input').first().json.chatInput }}"
              />
              <CopyValue
                label="Memory: Session Key"
                value="={{ $('Normalize Input').first().json.sessionId }}"
              />
            </section>
            <section className="space-y-2">
              <h3 className="font-semibold">4. Format Output (Code)</h3>
              <p>Chọn Run Once for All Items. Response nên là JSON có text và attachments.</p>
              <CopyValue label="Code node" value={FORMAT_OUTPUT_CODE} />
              <p>
                Chatly vẫn nhận response cũ có output hoặc assistant.text, nên workflow đang chạy
                không cần sửa ngay.
              </p>
            </section>
            <section className="space-y-2">
              <h3 className="font-semibold">5. Respond to Webhook</h3>
              <p>Respond With = JSON, Response Code = 200. Trả JSON từ node Format Output.</p>
              <CopyValue label="Response Body" value="={{ $json }}" />
            </section>
          </>
        )}
        <section className="space-y-2">
          <h3 className="font-semibold">Triển khai</h3>
          <p>
            n8n Cloud cung cấp sẵn Production URL HTTPS; không cần Docker. Với n8n tự host, Chatly
            trên Vercel cần endpoint HTTPS công khai qua domain, reverse proxy hoặc tunnel;
            localhost:5678 chỉ dùng khi Chatly cũng chạy local trong chế độ development.
          </p>
          <CopyValue
            label="Biến môi trường trên server: chỉ ghi origin, không có /webhook/..."
            value="N8N_ALLOWED_ORIGINS=https://your-workspace.app.n8n.cloud"
          />
          <p>Lưu agent, kiểm tra kết nối, rồi mới bật agent cho người dùng.</p>
        </section>
      </div>
    </details>
  )
}
