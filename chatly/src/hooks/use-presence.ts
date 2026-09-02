'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface UserPresence {
  userId: string
  status: 'online' | 'offline' | 'away' | 'busy'
  lastSeen: string | null
}

// Global shared presence state across components
type PresenceListener = (presenceMap: Map<string, UserPresence>) => void

class PresenceManager {
  private channel: ReturnType<ReturnType<typeof createClient>['channel']> | null = null
  private presenceMap: Map<string, UserPresence> = new Map()
  private listeners: Set<PresenceListener> = new Set()
  private currentUserId: string | null = null
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null
  private supabase = createClient()
  private subscribed = false

  async init(userId: string) {
    if (this.currentUserId === userId && this.subscribed) {
      return // Already initialized for this user
    }

    // Clean up previous session if user changed
    if (this.currentUserId && this.currentUserId !== userId) {
      await this.setOffline()
      this.cleanup()
    }

    this.currentUserId = userId

    // Set user as online first
    await this.setOnline()

    // Subscribe to profile changes for presence updates
    this.setupRealtimeSubscription()

    // Heartbeat to keep user online (every 25 seconds, less than 30s threshold)
    this.heartbeatInterval = setInterval(async () => {
      await this.setOnline()
    }, 25000)

    this.subscribed = true
  }

  async setOnline() {
    if (!this.currentUserId) return
    try {
      await this.supabase.rpc('set_user_online')
    } catch {
      // Silently fail - heartbeat is best-effort
    }
  }

  async setOffline() {
    if (!this.currentUserId) return
    try {
      await this.supabase.rpc('set_user_offline')
    } catch {
      // Silently fail on cleanup
    }
  }

  async setAway() {
    if (!this.currentUserId) return
    try {
      await this.supabase.rpc('set_user_away')
    } catch {
      // Silently fail
    }
  }

  // Expose for cleanup
  setUserOffline = this.setOffline
  setUserAway = this.setAway

  private setupRealtimeSubscription() {
    if (this.channel) {
      this.supabase.removeChannel(this.channel)
    }

    this.channel = this.supabase
      .channel('profiles-presence')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
        },
        (payload) => {
          const updated = payload.new as { id: string; status: string; last_seen: string }
          if (updated.id === this.currentUserId) return // Skip self-updates

          const presence: UserPresence = {
            userId: updated.id,
            status: (updated.status || 'offline') as UserPresence['status'],
            lastSeen: updated.last_seen,
          }
          this.presenceMap.set(updated.id, presence)
          this.notifyListeners()
        }
      )
      .subscribe()
  }

  private notifyListeners() {
    const mapCopy = new Map(this.presenceMap)
    this.listeners.forEach((listener) => listener(mapCopy))
  }

  subscribe(listener: PresenceListener): () => void {
    this.listeners.add(listener)
    // Immediately call with current state
    listener(new Map(this.presenceMap))
    return () => {
      this.listeners.delete(listener)
    }
  }

  getPresence(userId: string): UserPresence | null {
    return this.presenceMap.get(userId) || null
  }

  isOnline(userId: string): boolean {
    const presence = this.presenceMap.get(userId)
    return presence?.status === 'online'
  }

  getStatus(userId: string): 'online' | 'offline' | 'away' | 'busy' {
    const presence = this.presenceMap.get(userId)
    return presence?.status || 'offline'
  }

  cleanup() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
    if (this.channel) {
      this.supabase.removeChannel(this.channel)
      this.channel = null
    }
    this.listeners.clear()
    this.subscribed = false
  }

  async cleanupAndOffline() {
    await this.setOffline()
    this.cleanup()
    this.currentUserId = null
  }
}

// Singleton instance
let presenceManagerInstance: PresenceManager | null = null

function getPresenceManager(): PresenceManager {
  if (typeof window === 'undefined') {
    // Server-side: return a dummy
    return new PresenceManager()
  }
  if (!presenceManagerInstance) {
    presenceManagerInstance = new PresenceManager()
  }
  return presenceManagerInstance
}

export function usePresence(userId: string | null) {
  const [presenceMap, setPresenceMap] = useState<Map<string, UserPresence>>(new Map())
  const managerRef = useRef<PresenceManager | null>(null)

  useEffect(() => {
    if (!userId) return

    const manager = getPresenceManager()
    managerRef.current = manager

    // Initialize manager for this user
    manager.init(userId)

    // Subscribe to changes
    const unsubscribe = manager.subscribe((map) => {
      setPresenceMap(new Map(map))
    })

    // Handle page unload - set user offline
    const handleUnload = () => {
      manager.setOffline()
    }
    window.addEventListener('beforeunload', handleUnload)

    // Handle visibility change (tab hidden = away)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        manager.setOnline()
      } else {
        manager.setAway()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      unsubscribe()
      window.removeEventListener('beforeunload', handleUnload)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      // Don't cleanup manager on component unmount
    }
  }, [userId])

  // Get status for a specific user
  const getUserStatus = useCallback(
    (targetUserId: string): 'online' | 'offline' | 'away' | 'busy' => {
      return presenceMap.get(targetUserId)?.status || 'offline'
    },
    [presenceMap]
  )

  // Check if user is online
  const isOnline = useCallback(
    (targetUserId: string): boolean => {
      const status = presenceMap.get(targetUserId)?.status
      return status === 'online'
    },
    [presenceMap]
  )

  // Get full presence info
  const getPresence = useCallback(
    (targetUserId: string): UserPresence | null => {
      return presenceMap.get(targetUserId) || null
    },
    [presenceMap]
  )

  return {
    presenceMap,
    isOnline,
    getUserStatus,
    getPresence,
  }
}
