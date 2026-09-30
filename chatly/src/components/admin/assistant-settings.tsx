'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Bot, Check, Clipboard, Cloud, Database, Workflow } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { AdminAssistantConfig } from '@/lib/assistant/schema'

const PROMPT_EXPRESSION = "{{ $('Normalize Input').first().json.message }}"
const SESSION_EXPRESSION = "{{ $('Normalize Input').first().json.sessionId }}"
const RESPONSE_EXPRESSION = '{{ $json }}'
const FORMAT_OUTPUT_CODE = `const input = $("Normalize Input").first().json;
const output = $input.first().json.output;
if (typeof output !== "string" || !output.trim()) {
  throw new Error("Missing assistant output");
}
return [{
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
}];`

function CopyValue({ value, label = 'Sao chép' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false)

  return (
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
      {copied ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}
      {copied ? 'Đã chép' : label}
    </Button>
  )
}

function SetupValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-2 rounded-xl border border-[var(--border-default)] bg-[var(--bg-app)] p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-[var(--text-primary)]">{label}</p>
        <CopyValue value={value} />
      </div>
      <pre className="overflow-x-auto rounded-lg bg-[var(--bg-panel)] p-3 text-xs break-all whitespace-pre-wrap text-[var(--text-secondary)]">
        <code>{value}</code>
      </pre>
    </div>
  )
}

export function AssistantSettings() {
  const [config, setConfig] = useState<AdminAssistantConfig | null>(null)
  const [url, setUrl] = useState('')
  const [secret, setSecret] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [loadError, setLoadError] = useState(false)

  async function loadConfig() {
    try {
      const response = await fetch('/api/admin/ai')
      if (!response.ok) throw new Error()
      setConfig(await response.json())
      setLoadError(false)
    } catch {
      setLoadError(true)
      setNotice(
        'Chưa tải được cấu hình AI. Hãy áp dụng hai migration AI và thiết lập biến môi trường server.'
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    void fetch('/api/admin/ai')
      .then(async (response) => {
        if (!response.ok) throw new Error()
        const value = (await response.json()) as AdminAssistantConfig
        if (active) setConfig(value)
      })
      .catch(() => {
        if (!active) return
        setLoadError(true)
        setNotice(
          'Chưa tải được cấu hình AI. Hãy áp dụng hai migration AI và thiết lập biến môi trường server.'
        )
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  async function submit(test = false) {
    if (!config) return
    setBusy(true)
    setNotice('')
    try {
      const response = await fetch(test ? '/api/admin/ai/test' : '/api/admin/ai', {
        method: test ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        ...(!test
          ? {
              body: JSON.stringify({
                name: config.name,
                description: config.description,
                welcome_message: config.welcome_message,
                avatar_url: config.avatar_url,
                enabled: config.enabled,
                timeout_ms: config.timeout_ms,
                ...(url ? { webhookUrl: url } : {}),
                ...(secret ? { webhookSecret: secret } : {}),
              }),
            }
          : {}),
      })
      if (!response.ok) {
        const body = await response.json()
        const messages: Record<string, string> = {
          INVALID_WEBHOOK:
            'Webhook phải dùng HTTPS và origin phải có trong N8N_ASSISTANT_ALLOWED_ORIGINS.',
          CONNECTION_REQUIRED: 'Nhập webhook và secret trước khi bật AI.',
          INVALID_CONFIG: 'Kiểm tra các trường cấu hình; secret cần ít nhất 16 ký tự.',
          INVALID_AVATAR: 'Dùng URL ảnh công khai trong bucket profile-avatars của Chatly.',
          N8N_TIMEOUT: 'TIMEOUT',
          N8N_INVALID_RESPONSE: 'INVALID_RESPONSE',
          N8N_UNAVAILABLE: 'FAILED',
        }
        setNotice(messages[body.error] ?? 'Không thể hoàn tất thao tác. Kiểm tra cấu hình server.')
        if (test) await loadConfig()
        return
      }
      setConfig(await response.json())
      if (!test) {
        setUrl('')
        setSecret('')
      }
      setNotice(test ? 'CONNECTED' : 'Đã lưu cấu hình.')
    } catch {
      setNotice('Không thể kết nối. Vui lòng thử lại.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="h-full flex-1 overflow-y-auto bg-[var(--bg-app)] p-4 sm:p-6">
      <div className="mx-auto max-w-5xl space-y-6 pb-16">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link href="/admin" className="text-primary-500 text-sm font-medium">
              ← Quản trị
            </Link>
            <h1 className="mt-3 flex items-center gap-2 text-2xl font-semibold">
              <Bot className="text-primary-500 h-6 w-6" /> AI Assistant qua n8n
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
              Chatly lưu hội thoại trong Supabase. n8n nhận tin nhắn, chạy AI Agent và trả phản hồi
              theo hợp đồng JSON bên dưới.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-[var(--border-default)] bg-[var(--bg-panel)] px-3 py-2 text-sm">
            <span
              className={`h-2.5 w-2.5 rounded-full ${config?.enabled ? 'bg-emerald-500' : 'bg-slate-400'}`}
            />
            {config?.enabled ? 'Đang bật' : 'Đang tắt'}
          </div>
        </header>

        {notice && (
          <div
            role="status"
            className={`rounded-xl border p-4 text-sm ${
              loadError
                ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
                : 'border-[var(--border-default)] bg-[var(--bg-panel)]'
            }`}
          >
            <p>{notice}</p>
            {loadError && (
              <Button
                className="mt-3"
                size="sm"
                variant="outline"
                onClick={() => {
                  setLoading(true)
                  setLoadError(false)
                  setNotice('')
                  void loadConfig()
                }}
              >
                Thử tải lại
              </Button>
            )}
          </div>
        )}

        <section className="grid gap-4 md:grid-cols-3">
          {[
            {
              icon: Database,
              title: 'Supabase lưu dữ liệu',
              text: 'Conversation, message, lịch sử và realtime vẫn chạy qua kiến trúc Chatly hiện tại.',
            },
            {
              icon: Workflow,
              title: 'n8n xử lý AI',
              text: 'Model, prompt, memory, RAG và tools được cấu hình trực tiếp trong workflow n8n.',
            },
            {
              icon: Cloud,
              title: 'Dùng n8n Cloud được',
              text: 'Không cần chạy n8n bằng Docker. Chỉ cần Production Webhook HTTPS công khai.',
            },
          ].map((item) => (
            <article
              key={item.title}
              className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-panel)] p-4"
            >
              <item.icon className="text-primary-500 h-5 w-5" />
              <h2 className="mt-3 font-semibold">{item.title}</h2>
              <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">{item.text}</p>
            </article>
          ))}
        </section>

        <section className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-panel)] p-4 sm:p-5">
          <h2 className="text-lg font-semibold">1. Cấu hình kết nối Chatly</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Secret chỉ được mã hóa và lưu phía server; trình duyệt không đọc lại được giá trị đã
            lưu.
          </p>
          {loading && <p className="mt-4 text-sm text-[var(--text-muted)]">Đang tải cấu hình…</p>}
          {config && (
            <form
              className="mt-5 space-y-4"
              onSubmit={(event) => {
                event.preventDefault()
                void submit()
              }}
            >
              <fieldset disabled={busy} className="space-y-4 disabled:opacity-60">
                <div className="grid gap-4 sm:grid-cols-2">
                  {(['name', 'description', 'avatar_url', 'welcome_message'] as const).map(
                    (field) => (
                      <label key={field} className="block space-y-1 text-sm">
                        <span>
                          {
                            {
                              name: 'Tên AI',
                              description: 'Mô tả',
                              avatar_url: 'URL avatar',
                              welcome_message: 'Lời chào',
                            }[field]
                          }
                        </span>
                        <Input
                          value={config[field]}
                          onChange={(event) =>
                            setConfig({ ...config, [field]: event.target.value })
                          }
                          maxLength={field === 'name' ? 80 : field === 'description' ? 500 : 2000}
                        />
                      </label>
                    )
                  )}
                </div>
                <label className="block space-y-1 text-sm">
                  <span>n8n Production Webhook URL {config.configured && '(đã cấu hình)'}</span>
                  <Input
                    type="url"
                    value={url}
                    onChange={(event) => setUrl(event.target.value)}
                    placeholder={
                      config.configured
                        ? 'Để trống để giữ webhook hiện tại'
                        : 'https://your-workspace.app.n8n.cloud/webhook/chatly-assistant'
                    }
                    autoComplete="off"
                  />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block space-y-1 text-sm">
                    <span>Webhook Secret</span>
                    <Input
                      type="password"
                      value={secret}
                      onChange={(event) => setSecret(event.target.value)}
                      placeholder={
                        config.configured
                          ? '••••••••••••'
                          : 'Ít nhất 16 ký tự không có khoảng trắng'
                      }
                      autoComplete="new-password"
                    />
                  </label>
                  <label className="block space-y-1 text-sm">
                    <span>Request timeout (ms)</span>
                    <Input
                      type="number"
                      min={1000}
                      max={120000}
                      value={config.timeout_ms}
                      onChange={(event) =>
                        setConfig({ ...config, timeout_ms: Number(event.target.value) })
                      }
                    />
                  </label>
                </div>
                <label className="flex items-center gap-2 rounded-xl bg-[var(--bg-app)] p-3">
                  <input
                    type="checkbox"
                    checked={config.enabled}
                    onChange={(event) => setConfig({ ...config, enabled: event.target.checked })}
                  />
                  Bật AI Assistant cho người dùng
                </label>
                <div className="flex flex-wrap gap-3">
                  <Button type="submit">{busy ? 'Đang xử lý…' : 'Lưu cấu hình'}</Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!config.configured || Boolean(url || secret) || busy}
                    onClick={() => void submit(true)}
                  >
                    Test Connection
                  </Button>
                </div>
                <p className="text-xs text-[var(--text-muted)]">
                  Test Connection dùng cấu hình đã lưu. Hãy lưu URL và secret mới trước khi kiểm
                  tra.
                </p>
              </fieldset>
              <dl className="grid gap-3 border-t border-[var(--border-default)] pt-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-[var(--text-muted)]">Webhook</dt>
                  <dd>{config.configured ? 'Đã cấu hình' : 'Chưa cấu hình'}</dd>
                </div>
                <div>
                  <dt className="text-[var(--text-muted)]">n8n Connection</dt>
                  <dd>{config.last_connection_status ?? 'Chưa kiểm tra'}</dd>
                </div>
                <div>
                  <dt className="text-[var(--text-muted)]">Lần thành công gần nhất</dt>
                  <dd>{config.last_success_at ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-[var(--text-muted)]">Độ trễ / lỗi gần nhất</dt>
                  <dd>
                    {config.latency_ms === null ? '—' : `${config.latency_ms} ms`}
                    {config.last_error ? ` · ${config.last_error}` : ''}
                  </dd>
                </div>
              </dl>
            </form>
          )}
        </section>

        <section className="space-y-4 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-panel)] p-4 sm:p-5">
          <div>
            <h2 className="text-lg font-semibold">2. Thông số node trên n8n</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Luồng: Webhook → Normalize Input → AI Agent → Format Output → Respond to Webhook.
            </p>
          </div>
          <ol className="list-decimal space-y-3 pl-5 text-sm leading-6 text-[var(--text-secondary)]">
            <li>
              <strong>Webhook:</strong> POST, path <code>chatly-assistant</code>, Authentication{' '}
              <strong>Header Auth</strong>, Respond bằng <strong>Respond to Webhook node</strong>.
            </li>
            <li>
              Credential Header Auth: name <code>X-N8N-SECRET</code>; value phải giống secret lưu
              trong Chatly.
            </li>
            <li>
              <strong>Edit Fields (Set)</strong>, đổi tên thành <code>Normalize Input</code>. Tạo{' '}
              <code>message</code>, <code>conversationId</code>, <code>sessionId</code>,{' '}
              <code>userId</code>, <code>requestId</code>, <code>event</code> từ body Webhook.
            </li>
            <li>
              <strong>AI Agent:</strong> Prompt Source = Define below; nối Chat Model, Memory, RAG
              và ít nhất một Tool. Nếu chưa có tool nghiệp vụ, có thể dùng Calculator để chạy thử.
            </li>
            <li>
              <strong>Respond to Webhook:</strong> Respond With = JSON, Response Code = 200, Body =
              expression <code>{RESPONSE_EXPRESSION}</code>.
            </li>
          </ol>
          <div className="grid gap-3 sm:grid-cols-2">
            <SetupValue label="message" value="{{ $json.body.message.text }}" />
            <SetupValue label="conversationId" value="{{ $json.body.conversation.id }}" />
            <SetupValue label="sessionId" value="{{ $json.body.session.id }}" />
            <SetupValue label="userId" value="{{ $json.body.user.id }}" />
            <SetupValue label="requestId" value="{{ $json.body.requestId }}" />
            <SetupValue label="event" value="{{ $json.body.event }}" />
            <SetupValue label="AI Agent Prompt/User Message" value={PROMPT_EXPRESSION} />
            <SetupValue label="Memory Session Key" value={SESSION_EXPRESSION} />
          </div>
          <SetupValue
            label="Code node: Format Output (Run Once for All Items)"
            value={FORMAT_OUTPUT_CODE}
          />
          <SetupValue label="Respond to Webhook: JSON Response Body" value={RESPONSE_EXPRESSION} />
        </section>

        <section className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-panel)] p-4 text-sm leading-6 sm:p-5">
          <h2 className="text-lg font-semibold">3. n8n Cloud hoặc n8n tự host</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-[var(--text-secondary)]">
            <li>
              <strong>n8n Cloud:</strong> dùng trực tiếp Production URL dạng{' '}
              <code>https://your-workspace.app.n8n.cloud/webhook/...</code>. Không cần Docker.
            </li>
            <li>
              <strong>n8n tự host:</strong> cần domain/ingress HTTPS công khai. URL{' '}
              <code>localhost:5678</code> chỉ dùng trong máy và không phù hợp khi Chatly chạy trên
              Vercel.
            </li>
            <li>
              Thêm đúng origin, không gồm path, vào biến server, ví dụ{' '}
              <code>N8N_ASSISTANT_ALLOWED_ORIGINS=https://your-workspace.app.n8n.cloud</code>.
            </li>
            <li>Publish workflow rồi mới copy Production URL và bấm Test Connection.</li>
          </ul>
        </section>
      </div>
    </main>
  )
}
