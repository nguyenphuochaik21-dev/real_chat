import { create } from 'zustand'

export type NotificationType = 'message' | 'call' | 'mention' | 'system'

export interface Notification {
  id: string
  type: NotificationType
  title: string
  body: string
  conversationId?: string
  senderId?: string
  senderName?: string
  senderAvatar?: string | null
  read: boolean
  createdAt: string
}

interface NotificationState {
  notifications: Notification[]
  unreadCount: number
  toasts: Notification[] // Active toasts to display
  isOpen: boolean // Notification center open state

  // Actions
  addNotification: (notification: Omit<Notification, 'id' | 'read' | 'createdAt'>) => void
  markAsRead: (id: string) => void
  markAllAsRead: () => void
  removeNotification: (id: string) => void
  clearAll: () => void
  setIsOpen: (open: boolean) => void
  addToast: (notification: Omit<Notification, 'id' | 'read' | 'createdAt'>) => void
  removeToast: (id: string) => void
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  toasts: [],
  isOpen: false,

  addNotification: (notification) => {
    const newNotification: Notification = {
      ...notification,
      id: crypto.randomUUID(),
      read: false,
      createdAt: new Date().toISOString(),
    }

    set((state) => ({
      notifications: [newNotification, ...state.notifications].slice(0, 50), // Keep last 50
      unreadCount: state.unreadCount + 1,
    }))

    // Also show as toast
    get().addToast(newNotification)
  },

  markAsRead: (id) => {
    set((state) => {
      const notification = state.notifications.find((n) => n.id === id)
      if (!notification || notification.read) return state

      return {
        notifications: state.notifications.map((n) =>
          n.id === id ? { ...n, read: true } : n
        ),
        unreadCount: Math.max(0, state.unreadCount - 1),
      }
    })
  },

  markAllAsRead: () => {
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    }))
  },

  removeNotification: (id) => {
    set((state) => {
      const notification = state.notifications.find((n) => n.id === id)
      return {
        notifications: state.notifications.filter((n) => n.id !== id),
        unreadCount: notification && !notification.read
          ? Math.max(0, state.unreadCount - 1)
          : state.unreadCount,
      }
    })
  },

  clearAll: () => {
    set({ notifications: [], unreadCount: 0 })
  },

  setIsOpen: (open) => {
    set({ isOpen: open })
    // Auto-mark all as read when opening
    if (open && get().unreadCount > 0) {
      get().markAllAsRead()
    }
  },

  addToast: (notification) => {
    const toast: Notification = {
      ...notification,
      id: crypto.randomUUID(),
      read: false,
      createdAt: new Date().toISOString(),
    }

    set((state) => ({
      toasts: [...state.toasts, toast],
    }))

    // Auto-remove toast after 5 seconds
    setTimeout(() => {
      get().removeToast(toast.id)
    }, 5000)
  },

  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }))
  },
}))
