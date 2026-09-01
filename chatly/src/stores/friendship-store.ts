'use client'

import { create } from 'zustand'

interface FriendshipState {
  incomingCount: number
  revision: number
  setIncomingCount: (count: number) => void
  signalChange: () => void
  reset: () => void
}

export const useFriendshipStore = create<FriendshipState>((set) => ({
  incomingCount: 0,
  revision: 0,
  setIncomingCount: (incomingCount) => set({ incomingCount }),
  signalChange: () => set((state) => ({ revision: state.revision + 1 })),
  reset: () => set({ incomingCount: 0, revision: 0 }),
}))
