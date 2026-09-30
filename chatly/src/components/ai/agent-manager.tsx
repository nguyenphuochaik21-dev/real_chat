'use client'

import { AgentAvatar } from '@/components/ai/agent-avatar'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { saveAiAgent, testAiAgent } from '@/lib/actions/ai'
import type { AiAgent } from '@/types/ai'

type ManagedAgent = AiAgent & { chat_url: string; has_credentials: boolean }
const blank = {
  id: undefined as string | undefined,
  name: '',
  description: '',
  welcome_message: '',
  avatar_url: '',
  enabled: false,
  chat_url: '',
  username: '',
  password: '',
  clear_credentials: false,
}

export function AiAgentManager({ agents }: { agents: ManagedAgent[] }) {
  const router = useRouter()
  const [form, setForm] = useState(blank)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [hasCredentials, setHasCredentials] = useState(false)
  function edit(agent?: ManagedAgent) {
    setForm(agent ? { ...blank, ...agent } : blank)
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
            <h1 className="text-2xl font-semibold">AI Agents</h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Kết nối các trợ lý của bạn với workflow n8n.
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
                className="flex w-full items-center gap-3 rounded-xl border border-[var(--border-default)] bg-[var(--bg-panel)] p-4 text-left hover:bg-[var(--bg-hover)]"
              >
                <AgentAvatar agent={agent} />
                <span className="min-w-0">
                  <span className="block font-semibold">{agent.name}</span>
                  <span className="block text-sm text-[var(--text-muted)]">
                    {agent.enabled ? 'Đang hoạt động' : 'Đã tắt'} ·{' '}
                    {agent.has_credentials ? 'Có xác thực' : 'Chưa có xác thực'}
                  </span>
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
            <fieldset disabled={busy} className="space-y-4">
              {(
                [
                  ['name', 'Tên agent', 80],
                  ['description', 'Mô tả', 500],
                  ['welcome_message', 'Lời chào', 2000],
                  ['avatar_url', 'URL ảnh đại diện (HTTPS, tùy chọn)', 2000],
                  ['chat_url', 'Chat URL production của n8n', 2000],
                  ['username', 'Tên đăng nhập Basic Auth', 200],
                  ['password', 'Mật khẩu Basic Auth', 1000],
                ] as const
              ).map(([key, label, maxLength]) => (
                <label key={key} className="block space-y-1 text-sm">
                  <span>{label}</span>
                  <Input
                    value={form[key]}
                    maxLength={maxLength}
                    required={key === 'name' || key === 'chat_url'}
                    type={key === 'password' ? 'password' : key.endsWith('url') ? 'url' : 'text'}
                    autoComplete={key === 'password' ? 'new-password' : 'off'}
                    onChange={(event) => setForm({ ...form, [key]: event.target.value })}
                  />
                </label>
              ))}
              {hasCredentials && (
                <p className="text-sm text-[var(--text-muted)]">
                  Đã lưu xác thực. Để trống cả hai ô để giữ nguyên.
                </p>
              )}
              {hasCredentials && (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.clear_credentials}
                    onChange={(event) =>
                      setForm({ ...form, clear_credentials: event.target.checked })
                    }
                  />
                  Xóa xác thực đã lưu
                </label>
              )}
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(event) => setForm({ ...form, enabled: event.target.checked })}
                />
                Cho phép người dùng trò chuyện
              </label>
              <div className="flex flex-wrap gap-2">
                <Button type="submit">{busy ? 'Đang xử lý…' : 'Lưu agent'}</Button>
                {form.id && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={async () => {
                      setBusy(true)
                      setNotice('Đang gửi câu thử tới cấu hình đã lưu…')
                      try {
                        const result = await testAiAgent(form.id!)
                        setNotice(result.error ?? `Kết nối thành công: ${result.reply}`)
                      } catch {
                        setNotice('Không kiểm tra được kết nối.')
                      } finally {
                        setBusy(false)
                      }
                    }}
                  >
                    Kiểm tra cấu hình đã lưu
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
