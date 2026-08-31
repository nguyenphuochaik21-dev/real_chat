'use client'

import { useState, useEffect } from 'react'
import { Ban, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { blockUser, unblockUser, getBlockedUsersWithProfiles } from '@/lib/actions/block'
import { useNotificationStore } from '@/stores/notification-store'
import type { Tables } from '@/types'
import { useI18n } from '@/lib/i18n'

type Profile = Tables<'profiles'>

interface BlockedUserWithDate extends Profile {
  blocked_at: string
}

interface BlockUserModalProps {
  isOpen: boolean
  onClose: () => void
  userToBlock?: { id: string; display_name: string; avatar_url: string | null } | null
  onBlocked?: () => void
}

export function BlockUserModal({ isOpen, onClose, userToBlock, onBlocked }: BlockUserModalProps) {
  const { t, dateLocale } = useI18n()
  const [blockedUsers, setBlockedUsers] = useState<BlockedUserWithDate[]>([])
  const [loading, setLoading] = useState(false)
  const addToast = useNotificationStore((state) => state.addToast)

  const fetchBlockedUsers = async () => {
    try {
      const users = await getBlockedUsersWithProfiles()
      setBlockedUsers(users)
    } catch (err) {
      console.error('Failed to fetch blocked users:', err)
    }
  }

  useEffect(() => {
    if (!isOpen) return
    const timeoutId = window.setTimeout(() => void fetchBlockedUsers(), 0)
    return () => window.clearTimeout(timeoutId)
  }, [isOpen])

  const handleBlock = async () => {
    if (!userToBlock) return
    setLoading(true)

    try {
      const result = await blockUser(userToBlock.id)
      if (result.success) {
        addToast({
          type: 'system',
          title: t('block.blocked'),
          body: t('block.blockedBody', { name: userToBlock.display_name }),
        })
        onBlocked?.()
        onClose()
      } else {
        addToast({
          type: 'system',
          title: t('block.blockFailed'),
          body: result.error || t('common.unknownError'),
        })
      }
    } catch (err) {
      addToast({
        type: 'system',
        title: t('block.blockFailed'),
        body: err instanceof Error ? err.message : t('common.unknownError'),
      })
    } finally {
      setLoading(false)
    }
  }

  const handleUnblock = async (userId: string, displayName: string) => {
    try {
      const result = await unblockUser(userId)
      if (result.success) {
        setBlockedUsers((prev) => prev.filter((u) => u.id !== userId))
        addToast({
          type: 'system',
          title: t('block.unblocked'),
          body: t('block.unblockedBody', { name: displayName }),
        })
      } else {
        addToast({
          type: 'system',
          title: t('block.unblockFailed'),
          body: result.error || t('common.unknownError'),
        })
      }
    } catch (err) {
      addToast({
        type: 'system',
        title: t('block.unblockFailed'),
        body: err instanceof Error ? err.message : t('common.unknownError'),
      })
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-[calc(100%-1rem)] max-w-md rounded-lg bg-[var(--bg-panel)] shadow-lg">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-default)] p-4">
          <div className="flex items-center gap-3">
            <Ban className="h-5 w-5 text-[var(--text-muted)]" />
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">{t('block.title')}</h2>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Block a user */}
        {userToBlock && (
          <div className="p-4">
            <p className="mb-3 text-sm text-[var(--text-secondary)]">{t('block.confirm')}</p>
            <div className="flex items-center justify-between rounded-lg bg-[var(--bg-hover)] p-3">
              <div className="flex items-center gap-3">
                <Avatar user={userToBlock} size="sm" showStatus={false} />
                <span className="font-medium text-[var(--text-primary)]">
                  {userToBlock.display_name}
                </span>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={onClose}>
                  {t('block.cancel')}
                </Button>
                <Button variant="destructive" size="sm" onClick={handleBlock} disabled={loading}>
                  {t('block.action')}
                </Button>
              </div>
            </div>
          </div>
        )}

        <Separator />

        {/* Blocked users list */}
        <div className="max-h-80">
          {blockedUsers.length > 0 ? (
            <ScrollArea className="p-2">
              {blockedUsers.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between p-3 hover:bg-[var(--bg-hover)]"
                >
                  <div className="flex items-center gap-3">
                    <Avatar user={user} size="sm" showStatus={false} />
                    <div>
                      <p className="font-medium text-[var(--text-primary)]">{user.display_name}</p>
                      <p className="text-xs text-[var(--text-muted)]">
                        {user.blocked_at &&
                          t('block.blockedOn', {
                            date: new Date(user.blocked_at).toLocaleDateString(dateLocale),
                          })}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleUnblock(user.id, user.display_name)}
                  >
                    {t('block.unblock')}
                  </Button>
                </div>
              ))}
            </ScrollArea>
          ) : (
            <div className="p-8 text-center">
              <Ban className="mx-auto mb-3 h-12 w-12 text-[var(--text-muted)] opacity-50" />
              <p className="text-sm text-[var(--text-muted)]">{t('block.none')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
