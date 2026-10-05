'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { AgentAvatar } from '@/components/ai/agent-avatar'
import { N8nIntegrationGuide } from '@/components/ai/n8n-integration-guide'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { saveAiAgent, testAiAgent } from '@/lib/actions/ai'
import type { AiAgent } from '@/types/ai'

type AuthType = 'none' | 'basic' | 'header_secret'
type Protocol = 'chat' | 'legacy'

type ManagedAgent = AiAgent & {
  chat_url: string
  endpoint_hostname: string | null
  has_url: boolean
  has_credentials: boolean
  connection_issue: string | null
  auth_type: AuthType
  auth_header_name: string
  protocol: Protocol
  timeout_ms: number
  last_status: string
  last_tested_at: string | null
  last_latency_ms: number | null
  last_error_code: string | null
}

type AgentForm = {
  id?: string
  name: string
  description: string
  welcome_message: string
  avatar_url: string
  enabled: boolean
  available_to_users: boolean
  is_default: boolean
  archived: boolean
  chat_url: string
  auth_type: AuthType
  auth_header_name: string
  protocol: Protocol
  timeout_ms: number
  username: string
  password: string
  header_secret: string
  clear_credentials: boolean
  endpoint_hostname: string | null
  has_url: boolean
}

const blank: AgentForm = {
  name: '',
  description: '',
  welcome_message: '',
  avatar_url: '',
  enabled: false,
  available_to_users: true,
  is_default: false,
  archived: false,
  chat_url: '',
  auth_type: 'none',
  auth_header_name: 'X-N8N-SECRET',
  protocol: 'chat',
  timeout_ms: 55000,
  username: '',
  password: '',
  header_secret: '',
  clear_credentials: false,
  endpoint_hostname: null,
  has_url: false,
}

const selectClass = 'w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] p-2'

function connectionStatus(agent: ManagedAgent) {
  if (agent.last_status === 'connected') return 'Webhook và phản hồi AI hợp lệ'
  if (agent.last_status !== 'failed') return 'Chưa kiểm tra'
  const labels: Record<string, string> = {
    N8N_TIMEOUT: 'Webhook phản hồi quá thời gian',
    N8N_UNAVAILABLE: 'Không kết nối được webhook',
    N8N_AUTH_FAILED: 'Webhook từ chối xác thực',
    N8N_INVALID_RESPONSE: 'Webhook đã trả HTTP 200 nhưng JSON sai hoặc rỗng',
    N8N_CONFIGURATION: 'URL không hợp lệ hoặc Production Webhook chưa được Publish',
    N8N_WORKFLOW_ERROR: 'Webhook đã nhận yêu cầu nhưng workflow hoặc mô hình AI gặp lỗi',
  }
  return labels[agent.last_error_code ?? ''] ?? 'Kiểm tra thất bại'
}

function connectionChecks(agent: ManagedAgent) {
  if (!agent.last_tested_at)
    return 'Webhook: chưa kiểm tra · Xác thực: chưa kiểm tra · Phản hồi: chưa kiểm tra'
  if (agent.last_status === 'connected')
    return 'Webhook: kết nối được · Xác thực: hợp lệ · JSON: hợp lệ · AI: trả lời thành công'
  if (agent.last_error_code === 'N8N_AUTH_FAILED')
    return 'Webhook: kết nối được · Xác thực: bị từ chối'
  if (agent.last_error_code === 'N8N_INVALID_RESPONSE')
    return 'Webhook: kết nối được · Xác thực: hợp lệ · JSON: không hợp lệ'
  if (agent.last_error_code === 'N8N_WORKFLOW_ERROR')
    return 'Webhook: kết nối được · Xác thực: hợp lệ · Workflow/AI: gặp lỗi'
  if (agent.last_error_code === 'N8N_UNAVAILABLE') return 'Webhook: không kết nối được'
  if (agent.last_error_code === 'N8N_TIMEOUT') return 'Webhook/Workflow: hết thời gian chờ'
  return 'Cấu hình: cần kiểm tra URL và trạng thái Publish'
}

export function AiAgentManager({ agents }: { agents: ManagedAgent[] }) {
  const router = useRouter()
  const [form, setForm] = useState<AgentForm>(blank)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [hasCredentials, setHasCredentials] = useState(false)

  function edit(agent?: ManagedAgent) {
    setForm(
      agent
        ? {
            ...blank,
            ...agent,
            archived: Boolean(agent.archived_at),
            chat_url: '',
          }
        : blank
    )
    setHasCredentials(Boolean(agent?.has_credentials))
    setNotice('')
  }

  return (
    <div className="h-full w-full overflow-y-auto bg-[var(--bg-app)] p-4 pb-24 md:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <Link href="/admin" className="text-primary-500">
          ← Quản trị
        </Link>
        <header className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Quản lý AI Agents</h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Mỗi agent dùng một webhook n8n. Agent mặc định trả lời trong danh sách chat chính.
            </p>
          </div>
          <Button onClick={() => edit()} disabled={busy}>
            <Plus className="mr-2 h-4 w-4" />
            Tạo agent
          </Button>
        </header>
        <div className="grid gap-6 lg:grid-cols-2">
          <section aria-label="Danh sách agent" className="space-y-3">
            {agents.length === 0 && <p>Chưa có agent. Điền cấu hình để tạo trợ lý đầu tiên.</p>}
            {agents.map((agent) => (
              <button
                key={agent.id}
                disabled={busy}
                onClick={() => edit(agent)}
                className="flex w-full items-start gap-3 rounded-xl border border-[var(--border-default)] bg-[var(--bg-panel)] p-4 text-left hover:bg-[var(--bg-hover)]"
              >
                <AgentAvatar agent={agent} />
                <span className="min-w-0 space-y-1">
                  <span className="block font-semibold">{agent.name}</span>
                  <span className="block text-sm text-[var(--text-muted)]">
                    {agent.description}
                  </span>
                  <span className="block text-xs text-[var(--text-muted)]">
                    {agent.archived_at ? 'Đã lưu trữ' : agent.enabled ? 'Đang bật' : 'Đã tắt'} ·{' '}
                    {agent.available_to_users && agent.enabled && !agent.archived_at
                      ? 'Người dùng nhìn thấy'
                      : 'Ẩn với người dùng'}
                    {agent.is_default ? ' · Mặc định trong chat chính' : ''}
                  </span>
                  <span className="block text-xs text-[var(--text-muted)]">
                    {agent.endpoint_hostname ?? 'Chưa có webhook'} ·{' '}
                    {agent.auth_type === 'basic'
                      ? 'Basic Auth'
                      : agent.auth_type === 'header_secret'
                        ? `Header ${agent.auth_header_name}`
                        : 'Không xác thực'}{' '}
                    · {connectionStatus(agent)}
                  </span>
                  <span className="block text-xs text-[var(--text-muted)]">
                    {connectionChecks(agent)}
                  </span>
                  {agent.last_tested_at && (
                    <span className="block text-xs text-[var(--text-muted)]">
                      Kiểm tra: {new Date(agent.last_tested_at).toLocaleString('vi-VN')} ·{' '}
                      {agent.last_latency_ms ?? '—'} ms
                      {agent.last_error_code ? ` · ${agent.last_error_code}` : ''}
                    </span>
                  )}
                  {agent.connection_issue && (
                    <span className="block text-sm text-amber-400">
                      Cần sửa: {agent.connection_issue}
                    </span>
                  )}
                </span>
              </button>
            ))}
          </section>
          <form
            className="space-y-4 rounded-xl border border-[var(--border-default)] bg-[var(--bg-panel)] p-5"
            onSubmit={async (event) => {
              event.preventDefault()
              setBusy(true)
              setNotice('')
              try {
                await saveAiAgent(form)
                setForm(blank)
                setHasCredentials(false)
                setNotice('Đã lưu agent.')
                router.refresh()
              } catch (error) {
                setNotice(error instanceof Error ? error.message : 'Không lưu được agent.')
              } finally {
                setBusy(false)
              }
            }}
          >
            <h2 className="text-lg font-semibold">{form.id ? 'Sửa agent' : 'Agent mới'}</h2>
            <p className="text-sm text-[var(--text-muted)]">
              Tên, mô tả và lời chào hiển thị cho người dùng. Production URL phải gồm đường dẫn
              webhook. Workflow mới dùng Webhook node và giao thức Chatly Agent 1.1. Giao thức
              Chatly cũ vẫn hoạt động cho agent đã chuyển từ cấu hình trước.
            </p>
            <fieldset disabled={busy} className="space-y-4">
              {(
                [
                  ['name', 'Tên agent', 80],
                  ['description', 'Mô tả', 500],
                  ['welcome_message', 'Lời chào', 2000],
                  ['avatar_url', 'URL ảnh đại diện HTTPS (tùy chọn)', 2000],
                  ['chat_url', 'Production URL đầy đủ của n8n', 2000],
                ] as const
              ).map(([key, label, maxLength]) => (
                <label key={key} className="block space-y-1 text-sm">
                  <span>{label}</span>
                  <Input
                    value={form[key]}
                    maxLength={maxLength}
                    required={key === 'name' || (key === 'chat_url' && !form.id)}
                    type={key.endsWith('url') ? 'url' : 'text'}
                    onChange={(event) => setForm({ ...form, [key]: event.target.value })}
                  />
                </label>
              ))}
              {form.id && form.has_url && (
                <p className="text-xs text-[var(--text-muted)]">
                  Webhook hiện tại: {form.endpoint_hostname}. Để trống URL để giữ nguyên.
                </p>
              )}
              <details className="rounded-lg border border-[var(--border-default)] p-3">
                <summary className="cursor-pointer text-sm font-medium">Cài đặt nâng cao</summary>
                <label className="mt-3 block space-y-1 text-sm">
                  <span>Giao thức request gửi đến n8n</span>
                  <select
                    className={selectClass}
                    value={form.protocol}
                    onChange={(event) =>
                      setForm({ ...form, protocol: event.target.value as Protocol })
                    }
                  >
                    <option value="chat">Chatly Agent 1.1 (Webhook mới)</option>
                    <option value="legacy">Chatly cũ (giữ workflow hiện tại)</option>
                  </select>
                </label>
              </details>
              <label className="block space-y-1 text-sm">
                <span>Kiểu xác thực</span>
                <select
                  className={selectClass}
                  value={form.auth_type}
                  onChange={(event) =>
                    setForm({ ...form, auth_type: event.target.value as AuthType })
                  }
                >
                  <option value="none">Không xác thực</option>
                  <option value="basic">Basic Auth</option>
                  <option value="header_secret">Header chứa secret</option>
                </select>
              </label>
              {form.auth_type === 'basic' && (
                <div className="space-y-3">
                  <label className="block space-y-1 text-sm">
                    <span>Tên đăng nhập Basic Auth</span>
                    <Input
                      value={form.username}
                      autoComplete="off"
                      maxLength={200}
                      onChange={(event) => setForm({ ...form, username: event.target.value })}
                    />
                  </label>
                  <label className="block space-y-1 text-sm">
                    <span>Mật khẩu Basic Auth</span>
                    <Input
                      type="password"
                      value={form.password}
                      autoComplete="new-password"
                      maxLength={1000}
                      onChange={(event) => setForm({ ...form, password: event.target.value })}
                    />
                  </label>
                </div>
              )}
              {form.auth_type === 'header_secret' && (
                <div className="space-y-3">
                  <label className="block space-y-1 text-sm">
                    <span>Tên header</span>
                    <Input
                      value={form.auth_header_name}
                      maxLength={100}
                      onChange={(event) =>
                        setForm({ ...form, auth_header_name: event.target.value })
                      }
                    />
                  </label>
                  <label className="block space-y-1 text-sm">
                    <span>Secret</span>
                    <Input
                      type="password"
                      value={form.header_secret}
                      autoComplete="new-password"
                      maxLength={512}
                      onChange={(event) => setForm({ ...form, header_secret: event.target.value })}
                    />
                  </label>
                </div>
              )}
              {hasCredentials && form.auth_type !== 'none' && (
                <p className="text-xs text-[var(--text-muted)]">
                  Đã lưu xác thực. Để trống ô mật khẩu hoặc secret để giữ nguyên.
                </p>
              )}
              <label className="block space-y-1 text-sm">
                <span>Thời gian chờ tối đa (giây)</span>
                <Input
                  type="number"
                  min={1}
                  max={120}
                  value={form.timeout_ms / 1000}
                  onChange={(event) =>
                    setForm({ ...form, timeout_ms: Number(event.target.value) * 1000 })
                  }
                />
              </label>
              {(
                [
                  ['enabled', 'Bật agent'],
                  ['available_to_users', 'Hiển thị ở trang AI Agents'],
                  ['is_default', 'Dùng làm Chatly AI mặc định trong chat chính'],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form[key]}
                    disabled={
                      key === 'is_default' &&
                      form.is_default &&
                      agents.some((agent) => agent.id === form.id && agent.is_default)
                    }
                    onChange={(event) => setForm({ ...form, [key]: event.target.checked })}
                  />
                  {label}
                </label>
              ))}
              <p className="text-xs text-[var(--text-muted)]">
                Agent chỉ xuất hiện cho người dùng khi đang bật, được phép hiển thị và chưa lưu trữ.
                Kiểm tra kết nối gửi một câu thử đến AI và có thể tính vào hạn mức model.
              </p>
              <N8nIntegrationGuide
                authType={form.auth_type}
                headerName={form.auth_header_name}
                protocol={form.protocol}
              />
              <div className="flex flex-wrap gap-2">
                <Button type="submit">{busy ? 'Đang xử lý…' : 'Lưu agent'}</Button>
                {form.id && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={async () => {
                      setBusy(true)
                      setNotice('Đang kiểm tra cấu hình đã lưu…')
                      try {
                        const result = await testAiAgent(form.id!)
                        setNotice(
                          result.error
                            ? `Kiểm tra thất bại: ${result.error}. ${connectionStatus({
                                ...agents.find((agent) => agent.id === form.id)!,
                                last_status: 'failed',
                                last_error_code: result.error,
                              })}`
                            : `Webhook, xác thực và phản hồi AI hợp lệ: ${result.reply}`
                        )
                        router.refresh()
                      } catch {
                        setNotice('Không kiểm tra được kết nối.')
                      } finally {
                        setBusy(false)
                      }
                    }}
                  >
                    Kiểm tra phản hồi AI
                  </Button>
                )}
                {form.id && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy || form.is_default}
                    onClick={async () => {
                      setBusy(true)
                      setNotice('')
                      try {
                        await saveAiAgent({
                          ...form,
                          archived: !form.archived,
                          enabled: false,
                          available_to_users: false,
                        })
                        setForm(blank)
                        setNotice(
                          form.archived
                            ? 'Đã khôi phục agent ở trạng thái tắt.'
                            : 'Đã lưu trữ agent. Lịch sử chat được giữ lại.'
                        )
                        router.refresh()
                      } catch (error) {
                        setNotice(
                          error instanceof Error ? error.message : 'Không cập nhật được agent.'
                        )
                      } finally {
                        setBusy(false)
                      }
                    }}
                  >
                    {form.archived ? 'Khôi phục agent' : 'Lưu trữ agent'}
                  </Button>
                )}
              </div>
            </fieldset>
            <p role="status" className="text-sm whitespace-pre-wrap">
              {notice}
            </p>
          </form>
        </div>
      </div>
    </div>
  )
}
