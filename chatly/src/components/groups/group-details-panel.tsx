'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Crown,
  LogOut,
  MoreVertical,
  Pencil,
  Search,
  Shield,
  Trash2,
  UserMinus,
  UserPlus,
  UsersRound,
  X,
} from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  getGroupDetails,
  inviteGroupMembers,
  leaveGroup,
  removeGroupMember,
  setGroupMemberRole,
  updateGroupDetails,
  type GroupDetails,
  type GroupMember,
} from '@/lib/actions/groups'
import { getFriendshipOverview, type FriendshipItem } from '@/lib/actions/friendships'
import { createClient } from '@/lib/supabase/client'
import { deleteConversation } from '@/lib/actions/conversations'
import { useI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

interface GroupDetailsPanelProps {
  conversationId: string
  currentUserId: string
  onClose: () => void
  onLeft: () => void
  onUpdated: (title: string, memberCount: number) => void
}

export function GroupDetailsPanel({
  conversationId,
  currentUserId,
  onClose,
  onLeft,
  onUpdated,
}: GroupDetailsPanelProps) {
  const { t } = useI18n()
  const [details, setDetails] = useState<GroupDetails | null>(null)
  const [friends, setFriends] = useState<FriendshipItem[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editingName, setEditingName] = useState(false)
  const [name, setName] = useState('')
  const [inviteOpen, setInviteOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [openMemberId, setOpenMemberId] = useState<string | null>(null)
  const supabase = createClient()

  const loadDetails = useCallback(async () => {
    try {
      const nextDetails = await getGroupDetails(conversationId)
      setDetails(nextDetails)
      setName(nextDetails.conversation.title || '')
      onUpdated(nextDetails.conversation.title || t('group.tab'), nextDetails.members.length)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t('group.loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [conversationId, onUpdated, t])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadDetails()
      void getFriendshipOverview()
        .then((overview) => setFriends(overview.friends))
        .catch(() => setFriends([]))
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [loadDetails])

  useEffect(() => {
    const channel = supabase
      .channel(`group-details-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversation_participants',
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => void loadDetails()
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'conversations',
          filter: `id=eq.${conversationId}`,
        },
        () => void loadDetails()
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [conversationId, loadDetails, supabase])

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [busy, onClose])

  const existingMemberIds = useMemo(
    () => new Set(details?.members.map((member) => member.profile.id) ?? []),
    [details]
  )
  const inviteCandidates = friends.filter(({ profile }) => {
    if (existingMemberIds.has(profile.id)) return false
    const normalizedQuery = query.trim().toLowerCase()
    return (
      !normalizedQuery ||
      `${profile.display_name} ${profile.username ?? ''}`.toLowerCase().includes(normalizedQuery)
    )
  })
  const canManage = details?.currentUserRole === 'owner' || details?.currentUserRole === 'admin'

  const runMutation = async (key: string, mutation: () => Promise<void>) => {
    setBusy(key)
    setError(null)
    try {
      await mutation()
      await loadDetails()
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : t('common.unknownError'))
    } finally {
      setBusy(null)
      setOpenMemberId(null)
    }
  }

  const handleSaveName = () =>
    runMutation('name', async () => {
      await updateGroupDetails(conversationId, name.trim(), details?.conversation.avatar_url)
      setEditingName(false)
    })

  const handleInvite = () =>
    runMutation('invite', async () => {
      await inviteGroupMembers(conversationId, Array.from(selectedIds))
      setSelectedIds(new Set())
      setInviteOpen(false)
    })

  const handleRoleChange = (member: GroupMember) =>
    runMutation(`role-${member.profile.id}`, () =>
      setGroupMemberRole(
        conversationId,
        member.profile.id,
        member.role === 'admin' ? 'member' : 'admin'
      )
    )

  const handleRemove = (member: GroupMember) => {
    if (!window.confirm(t('group.removeConfirm', { name: member.profile.display_name }))) return
    void runMutation(`remove-${member.profile.id}`, () =>
      removeGroupMember(conversationId, member.profile.id)
    )
  }

  const handleLeave = async () => {
    if (!window.confirm(t('group.leaveConfirm'))) return
    setBusy('leave')
    setError(null)
    try {
      await leaveGroup(conversationId)
      onLeft()
    } catch (leaveError) {
      setError(leaveError instanceof Error ? leaveError.message : t('common.unknownError'))
      setBusy(null)
    }
  }

  const handleDelete = async () => {
    if (!window.confirm(t('group.deleteConfirm'))) return
    setBusy('delete')
    setError(null)
    try {
      const result = await deleteConversation(conversationId)
      if (!result.success) throw new Error(result.error || t('common.unknownError'))
      onLeft()
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : t('common.unknownError'))
      setBusy(null)
    }
  }

  return (
    <div className="fixed inset-0 z-[65] bg-black/45" onMouseDown={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="group-details-title"
        onMouseDown={(event) => event.stopPropagation()}
        className="ml-auto flex h-full w-full max-w-md flex-col border-l border-[var(--border-default)] bg-[var(--bg-panel)] shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-[var(--border-default)] px-4 py-3">
          <h2 id="group-details-title" className="font-semibold text-[var(--text-primary)]">
            {t('group.details')}
          </h2>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label={t('common.close')}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        {loading ? (
          <div className="flex flex-1 items-center justify-center" role="status">
            <div className="border-primary-500 h-7 w-7 animate-spin rounded-full border-2 border-t-transparent" />
          </div>
        ) : details ? (
          <>
            <ScrollArea className="min-h-0 flex-1">
              <div className="space-y-6 p-4">
                <section className="flex flex-col items-center text-center">
                  <Avatar
                    user={{
                      id: details.conversation.id,
                      display_name: details.conversation.title || t('group.tab'),
                      avatar_url: details.conversation.avatar_url,
                    }}
                    size="xl"
                  />
                  {editingName ? (
                    <div className="mt-4 flex w-full gap-2">
                      <Input
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        minLength={2}
                        maxLength={80}
                        aria-label={t('group.name')}
                        autoFocus
                      />
                      <Button
                        onClick={() => void handleSaveName()}
                        disabled={busy === 'name' || name.trim().length < 2}
                      >
                        {t('common.save')}
                      </Button>
                    </div>
                  ) : (
                    <div className="mt-3 flex items-center gap-2">
                      <h3 className="text-xl font-semibold text-[var(--text-primary)]">
                        {details.conversation.title}
                      </h3>
                      {canManage && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setEditingName(true)}
                          aria-label={t('group.rename')}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  )}
                  <p className="mt-1 text-sm text-[var(--text-muted)]">
                    {t('group.membersCount', { count: details.members.length })}
                  </p>
                </section>

                <section>
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="font-medium text-[var(--text-primary)]">{t('group.members')}</h3>
                    {canManage && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setInviteOpen(!inviteOpen)}
                      >
                        <UserPlus className="h-4 w-4" />
                        {t('group.invite')}
                      </Button>
                    )}
                  </div>

                  {inviteOpen && (
                    <div className="mb-4 rounded-xl border border-[var(--border-default)] p-3">
                      <div className="relative mb-2">
                        <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                        <Input
                          type="search"
                          value={query}
                          onChange={(event) => setQuery(event.target.value)}
                          placeholder={t('group.searchFriends')}
                          className="pl-9"
                        />
                      </div>
                      <div className="max-h-48 space-y-1 overflow-y-auto">
                        {inviteCandidates.map(({ profile }) => (
                          <button
                            key={profile.id}
                            type="button"
                            aria-pressed={selectedIds.has(profile.id)}
                            onClick={() =>
                              setSelectedIds((current) => {
                                const next = new Set(current)
                                if (next.has(profile.id)) next.delete(profile.id)
                                else next.add(profile.id)
                                return next
                              })
                            }
                            className={cn(
                              'flex w-full items-center gap-2 rounded-lg p-2 text-left',
                              selectedIds.has(profile.id)
                                ? 'bg-[var(--bg-active)]'
                                : 'hover:bg-[var(--bg-hover)]'
                            )}
                          >
                            <Avatar user={profile} size="sm" />
                            <span className="min-w-0 flex-1 truncate text-sm">
                              {profile.display_name}
                            </span>
                          </button>
                        ))}
                        {inviteCandidates.length === 0 && (
                          <p className="py-4 text-center text-sm text-[var(--text-muted)]">
                            {t('group.noInviteCandidates')}
                          </p>
                        )}
                      </div>
                      <Button
                        size="sm"
                        className="mt-3 w-full"
                        onClick={() => void handleInvite()}
                        disabled={selectedIds.size === 0 || busy === 'invite'}
                      >
                        {t('group.inviteSelected', { count: selectedIds.size })}
                      </Button>
                    </div>
                  )}

                  <div className="space-y-1">
                    {details.members.map((member) => {
                      const isSelf = member.profile.id === currentUserId
                      const actorCanRemove =
                        !isSelf &&
                        member.role !== 'owner' &&
                        (details.currentUserRole === 'owner' ||
                          (details.currentUserRole === 'admin' && member.role === 'member'))
                      const actorCanChangeRole =
                        details.currentUserRole === 'owner' && !isSelf && member.role !== 'owner'

                      return (
                        <div
                          key={member.profile.id}
                          className="relative flex items-center gap-3 rounded-xl p-2 hover:bg-[var(--bg-hover)]"
                        >
                          <Avatar user={member.profile} size="md" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                              {member.profile.display_name}
                              {isSelf && ` (${t('common.you')})`}
                            </p>
                            <p className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
                              {member.role === 'owner' && <Crown className="h-3 w-3" />}
                              {member.role === 'admin' && <Shield className="h-3 w-3" />}
                              {t(`group.role.${member.role}`)}
                            </p>
                          </div>
                          {(actorCanRemove || actorCanChangeRole) && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() =>
                                setOpenMemberId((current) =>
                                  current === member.profile.id ? null : member.profile.id
                                )
                              }
                              aria-label={t('group.memberActions', {
                                name: member.profile.display_name,
                              })}
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          )}
                          {openMemberId === member.profile.id && (
                            <div className="absolute top-11 right-2 z-10 w-52 rounded-lg border border-[var(--border-default)] bg-[var(--bg-panel)] p-1 shadow-lg">
                              {actorCanChangeRole && (
                                <button
                                  type="button"
                                  onClick={() => void handleRoleChange(member)}
                                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-[var(--bg-hover)]"
                                >
                                  <Shield className="h-4 w-4" />
                                  {member.role === 'admin'
                                    ? t('group.removeAdmin')
                                    : t('group.makeAdmin')}
                                </button>
                              )}
                              {actorCanRemove && (
                                <button
                                  type="button"
                                  onClick={() => handleRemove(member)}
                                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-red-500 hover:bg-red-500/10"
                                >
                                  <UserMinus className="h-4 w-4" />
                                  {t('group.removeMember')}
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </section>
              </div>
            </ScrollArea>

            <div className="border-t border-[var(--border-default)] p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {error && (
                <p
                  role="alert"
                  className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-500"
                >
                  {error}
                </p>
              )}
              <Button
                variant="outline"
                className="w-full text-red-500 hover:bg-red-500/10"
                onClick={() => void handleLeave()}
                disabled={busy === 'leave'}
              >
                <LogOut className="h-4 w-4" />
                {t('group.leave')}
              </Button>
              {details.currentUserRole === 'owner' && (
                <Button
                  variant="destructive"
                  className="mt-2 w-full"
                  onClick={() => void handleDelete()}
                  disabled={busy === 'delete'}
                >
                  <Trash2 className="h-4 w-4" />
                  {t('group.delete')}
                </Button>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
            <UsersRound className="mb-3 h-12 w-12 text-[var(--text-muted)]" />
            <p role="alert" className="text-sm text-red-500">
              {error || t('group.loadFailed')}
            </p>
          </div>
        )}
      </aside>
    </div>
  )
}
