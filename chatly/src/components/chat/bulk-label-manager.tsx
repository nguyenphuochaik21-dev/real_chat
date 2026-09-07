'use client'

import { useMemo, useState } from 'react'
import { Check, Plus, Search, Tag, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useConversationLabels } from '@/hooks/use-conversation-labels'
import { useI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import type { ConversationWithDetails } from '@/stores/chats-list-store'

const PRESET_COLORS = [
  '#8B5CF6',
  '#EF4444',
  '#F97316',
  '#EAB308',
  '#22C55E',
  '#14B8A6',
  '#3B82F6',
  '#EC4899',
]

interface BulkLabelManagerProps {
  isOpen: boolean
  conversations: ConversationWithDetails[]
  onClose: () => void
}

export function BulkLabelManager({ isOpen, conversations, onClose }: BulkLabelManagerProps) {
  const { t } = useI18n()
  const { labels, conversationLabels, createLabel, deleteLabel, assignLabel, removeLabel } =
    useConversationLabels()
  const [selectedLabelId, setSelectedLabelId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [newLabelName, setNewLabelName] = useState('')
  const [newLabelColor, setNewLabelColor] = useState(PRESET_COLORS[0])
  const [creating, setCreating] = useState(false)
  const [busyConversationIds, setBusyConversationIds] = useState<Set<string>>(new Set())

  const activeLabelId = labels.some((label) => label.id === selectedLabelId)
    ? selectedLabelId
    : (labels[0]?.id ?? null)
  const visibleConversations = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    if (!query) return conversations
    return conversations.filter((conversation) => {
      const name =
        conversation.type === 'group'
          ? conversation.title || t('group.tab')
          : conversation.participant?.display_name || t('common.user')
      return name.toLocaleLowerCase().includes(query)
    })
  }, [conversations, search, t])

  if (!isOpen) return null

  const create = async () => {
    const name = newLabelName.trim()
    if (!name) return
    setCreating(true)
    const result = await createLabel(name, newLabelColor)
    setCreating(false)
    if (!result.success || !result.label) return
    setSelectedLabelId(result.label.id)
    setNewLabelName('')
    setNewLabelColor(PRESET_COLORS[0])
  }

  const toggleConversation = async (conversationId: string) => {
    if (!activeLabelId || busyConversationIds.has(conversationId)) return
    setBusyConversationIds((current) => new Set(current).add(conversationId))
    const assigned = conversationLabels
      .get(conversationId)
      ?.some((label) => label.id === activeLabelId)
    if (assigned) await removeLabel(conversationId, activeLabelId)
    else await assignLabel(conversationId, activeLabelId)
    setBusyConversationIds((current) => {
      const next = new Set(current)
      next.delete(conversationId)
      return next
    })
  }

  return (
    <>
      <button
        className="fixed inset-0 z-40 bg-black/50"
        onClick={onClose}
        aria-label={t('common.close')}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={t('labels.manage')}
        className="fixed top-1/2 left-1/2 z-50 flex h-[min(680px,calc(100dvh-1rem))] w-[calc(100%-1rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-[var(--bg-panel)] shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-[var(--border-default)] p-4">
          <div className="flex items-center gap-2">
            <Tag className="text-primary-500 h-5 w-5" />
            <h2 className="font-semibold text-[var(--text-primary)]">{t('labels.manage')}</h2>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </header>

        <div className="grid min-h-0 flex-1 md:grid-cols-[220px_1fr]">
          <aside className="flex min-h-0 flex-col border-b border-[var(--border-default)] p-3 md:border-r md:border-b-0">
            <div className="flex max-h-36 gap-2 overflow-x-auto pb-2 md:max-h-none md:flex-1 md:flex-col md:overflow-y-auto">
              {labels.map((label) => (
                <button
                  key={label.id}
                  onClick={() => setSelectedLabelId(label.id)}
                  className={cn(
                    'group flex min-w-36 items-center gap-2 rounded-lg px-3 py-2 text-left text-sm md:min-w-0',
                    activeLabelId === label.id
                      ? 'bg-[var(--bg-active)]'
                      : 'hover:bg-[var(--bg-hover)]'
                  )}
                >
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: label.color ?? '#8B5CF6' }}
                  />
                  <span className="min-w-0 flex-1 truncate">{label.name}</span>
                  <Trash2
                    className="h-3.5 w-3.5 shrink-0 text-red-500 opacity-60 hover:opacity-100"
                    onClick={(event) => {
                      event.stopPropagation()
                      if (confirm(t('labels.deleteConfirm', { name: label.name || '' }))) {
                        void deleteLabel(label.id)
                      }
                    }}
                  />
                </button>
              ))}
            </div>
            <div className="mt-2 space-y-2 border-t border-[var(--border-default)] pt-3">
              <Input
                value={newLabelName}
                onChange={(event) => setNewLabelName(event.target.value)}
                placeholder={t('labels.name')}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void create()
                }}
              />
              <div className="flex items-center gap-1.5">
                {PRESET_COLORS.map((color) => (
                  <button
                    key={color}
                    aria-label={color}
                    className={cn(
                      'h-5 w-5 rounded-full',
                      newLabelColor === color && 'ring-2 ring-white'
                    )}
                    style={{ backgroundColor: color }}
                    onClick={() => setNewLabelColor(color)}
                  />
                ))}
              </div>
              <Button
                className="w-full"
                size="sm"
                disabled={!newLabelName.trim() || creating}
                onClick={() => void create()}
              >
                <Plus className="h-4 w-4" />
                {t('labels.create')}
              </Button>
            </div>
          </aside>

          <div className="flex min-h-0 flex-col p-3">
            {activeLabelId ? (
              <>
                <p className="mb-3 text-sm text-[var(--text-secondary)]">
                  {t('labels.assignManyHint')}
                </p>
                <div className="relative mb-3">
                  <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={t('labels.searchUsers')}
                    className="pl-9"
                  />
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto">
                  {visibleConversations.map((conversation) => {
                    const assigned = conversationLabels
                      .get(conversation.id)
                      ?.some((label) => label.id === activeLabelId)
                    const displayName =
                      conversation.type === 'group'
                        ? conversation.title || t('group.tab')
                        : conversation.participant?.display_name || t('common.user')
                    return (
                      <button
                        key={conversation.id}
                        disabled={busyConversationIds.has(conversation.id)}
                        onClick={() => void toggleConversation(conversation.id)}
                        className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-[var(--bg-hover)] disabled:opacity-60"
                      >
                        <span
                          className={cn(
                            'flex h-5 w-5 shrink-0 items-center justify-center rounded border',
                            assigned
                              ? 'border-primary-500 bg-primary-500 text-white'
                              : 'border-[var(--border-default)]'
                          )}
                        >
                          {assigned && <Check className="h-3.5 w-3.5" />}
                        </span>
                        <span className="truncate text-sm text-[var(--text-primary)]">
                          {displayName}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center text-center text-sm text-[var(--text-muted)]">
                {t('labels.createFirst')}
              </div>
            )}
          </div>
        </div>
      </section>
    </>
  )
}
