'use client'

import { create } from 'zustand'

interface NavigationBadgesState {
  unreadMessages: number
  setUnreadMessages: (count: number) => void
  reset: () => void
}

export const useNavigationBadgesStore = create<NavigationBadgesState>((set) => ({
  unreadMessages: 0,
  setUnreadMessages: (unreadMessages) => set({ unreadMessages: Math.max(0, unreadMessages) }),
  reset: () => set({ unreadMessages: 0 }),
}))
