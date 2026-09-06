'use client'

import { create } from 'zustand'
import type { FriendshipOverview } from '@/lib/actions/friendships'

interface FriendshipState {
  incomingCount: number
  revision: number
  overview: FriendshipOverview | null
  overviewFetchedAt: number
  setIncomingCount: (count: number) => void
  setOverview: (overview: FriendshipOverview) => void
  signalChange: () => void
  reset: () => void
}

export const useFriendshipStore = create<FriendshipState>((set) => ({
  incomingCount: 0,
  revision: 0,
  overview: null,
  overviewFetchedAt: 0,
  setIncomingCount: (incomingCount) => set({ incomingCount }),
  setOverview: (overview) =>
    set({ overview, overviewFetchedAt: Date.now(), incomingCount: overview.incoming.length }),
  signalChange: () => set((state) => ({ revision: state.revision + 1, overviewFetchedAt: 0 })),
  reset: () => set({ incomingCount: 0, revision: 0, overview: null, overviewFetchedAt: 0 }),
}))
