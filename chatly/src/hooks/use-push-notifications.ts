'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''

interface UsePushNotificationsOptions {
  userId: string | null
  enabled?: boolean
}

export function usePushNotifications({ userId, enabled = true }: UsePushNotificationsOptions) {
  const [permission, setPermission] = useState<NotificationPermission>('default')
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const subscriptionRef = useRef<PushSubscription | null>(null)
  const supabase = createClient()

  // Check current permission status
  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      if ('Notification' in window) setPermission(Notification.permission)
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [])

  // Register service worker
  const registerServiceWorker = useCallback(async (): Promise<ServiceWorkerRegistration | null> => {
    if (!('serviceWorker' in navigator)) {
      console.log('[Push] Service Worker not supported')
      return null
    }

    try {
      const registration = await navigator.serviceWorker.register('/sw.js')
      console.log('[Push] Service Worker registered:', registration.scope)
      return registration
    } catch (error) {
      console.error('[Push] Service Worker registration failed:', error)
      return null
    }
  }, [])

  // Convert base64 to Uint8Array for VAPID key
  const urlBase64ToUint8Array = useCallback((base64String: string): Uint8Array => {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
    const rawData = window.atob(base64)
    const outputArray = new Uint8Array(rawData.length)
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i)
    }
    return outputArray
  }, [])

  // Subscribe to push notifications
  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!userId || !VAPID_PUBLIC_KEY) {
      console.log('[Push] Cannot subscribe: missing userId or VAPID key')
      return false
    }

    setIsLoading(true)

    try {
      // Register service worker first
      const registration = await registerServiceWorker()
      if (!registration) {
        throw new Error('Service worker registration failed')
      }

      // Check permission
      const perm = await Notification.requestPermission()
      setPermission(perm)

      if (perm !== 'granted') {
        console.log('[Push] Permission denied')
        return false
      }

      // Subscribe to push
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      })

      console.log('[Push] Subscription created:', subscription)

      // Send subscription to server
      const subscriptionData = subscription.toJSON()
      const endpoint = subscriptionData.endpoint
      const p256dh = subscriptionData.keys?.p256dh
      const auth = subscriptionData.keys?.auth
      if (!endpoint || !p256dh || !auth) {
        throw new Error('Push subscription is missing required keys')
      }
      const { error } = await supabase.from('push_subscriptions').upsert({
        user_id: userId,
        endpoint,
        p256dh,
        auth,
        updated_at: new Date().toISOString(),
      })

      if (error) {
        console.error('[Push] Failed to save subscription:', error)
        return false
      }

      subscriptionRef.current = subscription
      setIsSubscribed(true)
      console.log('[Push] Successfully subscribed')
      return true
    } catch (error) {
      console.error('[Push] Subscription failed:', error)
      return false
    } finally {
      setIsLoading(false)
    }
  }, [userId, registerServiceWorker, urlBase64ToUint8Array, supabase])

  // Unsubscribe from push notifications
  const unsubscribe = useCallback(async (): Promise<boolean> => {
    if (!userId) return false

    setIsLoading(true)

    try {
      if (subscriptionRef.current) {
        await subscriptionRef.current.unsubscribe()
      }

      // Remove from server
      const { error } = await supabase.from('push_subscriptions').delete().eq('user_id', userId)

      if (error) {
        console.error('[Push] Failed to remove subscription:', error)
      }

      subscriptionRef.current = null
      setIsSubscribed(false)
      console.log('[Push] Unsubscribed')
      return true
    } catch (error) {
      console.error('[Push] Unsubscribe failed:', error)
      return false
    } finally {
      setIsLoading(false)
    }
  }, [userId, supabase])

  // Initialize - check if already subscribed
  useEffect(() => {
    if (!enabled || !userId) return

    const init = async () => {
      const registration = await registerServiceWorker()
      if (!registration) return

      try {
        const subscription = await registration.pushManager.getSubscription()
        if (subscription) {
          subscriptionRef.current = subscription
          setIsSubscribed(true)
          console.log('[Push] Found existing subscription')
        }
      } catch (error) {
        console.error('[Push] Error checking subscription:', error)
      }
    }

    init()
  }, [enabled, userId, registerServiceWorker])

  return {
    permission,
    isSubscribed,
    isLoading,
    subscribe,
    unsubscribe,
  }
}

// Trigger a push notification (called from server/edge function)
export async function sendPushNotification(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  title: string,
  body: string,
  icon?: string,
  data?: Record<string, unknown>
): Promise<boolean> {
  try {
    // Get user's push subscription
    const { data: subscription, error } = await supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('user_id', userId)
      .single()

    if (error || !subscription) {
      console.log('[Push] No subscription found for user:', userId)
      return false
    }

    // For this to work, you need to set up a Supabase Edge Function
    // that uses the web-push library to send notifications
    // The Edge Function should be triggered via a database webhook
    // when a new message is inserted

    console.log('[Push] Would send notification to:', subscription.endpoint)
    // TODO: Call Supabase Edge Function to send push notification
    // await supabase.functions.invoke('send-push', {
    //   body: { subscription, title, body, icon, data }
    // })

    return true
  } catch (error) {
    console.error('[Push] Failed to send notification:', error)
    return false
  }
}
