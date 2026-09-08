'use client'

import { createContext, useContext } from 'react'

const CurrentUserIdContext = createContext<string | null>(null)

export function CurrentUserProvider({
  children,
  userId,
}: {
  children: React.ReactNode
  userId: string
}) {
  return <CurrentUserIdContext.Provider value={userId}>{children}</CurrentUserIdContext.Provider>
}

export function useCurrentUserId() {
  const userId = useContext(CurrentUserIdContext)
  if (!userId) throw new Error('useCurrentUserId must be used within CurrentUserProvider')
  return userId
}
