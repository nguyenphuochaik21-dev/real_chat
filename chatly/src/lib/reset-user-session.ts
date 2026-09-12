'use client'

import { useCallStore } from '@/stores/call-store'
import { useChatCacheStore } from '@/stores/chat-cache-store'
import { useChatsListStore } from '@/stores/chats-list-store'
import { useDraftStore } from '@/stores/draft-store'
import { useFriendshipStore } from '@/stores/friendship-store'
import { useMessageActionsStore } from '@/stores/message-actions-store'
import { useNavigationBadgesStore } from '@/stores/navigation-badges-store'
import { useNotificationStore } from '@/stores/notification-store'

export function resetUserSessionState() {
  useCallStore.getState().reset()
  useChatCacheStore.getState().reset()
  useChatsListStore.getState().reset()
  useDraftStore.getState().clearAllDrafts()
  useFriendshipStore.getState().reset()
  useMessageActionsStore.getState().reset()
  useNavigationBadgesStore.getState().reset()
  useNotificationStore.getState().clearAll()
}
