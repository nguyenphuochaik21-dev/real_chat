'use client'

import { createContext, useContext } from 'react'

const CurrentUserIdContext = createContext<string | null>(null)
const CurrentUserAdminContext = createContext(false)

export function CurrentUserProvider({
  children,
  userId,
  isAdmin = false,
}: {
  children: React.ReactNode
  userId: string
  isAdmin?: boolean
}) {
  return (
    <CurrentUserIdContext.Provider value={userId}>
      <CurrentUserAdminContext.Provider value={isAdmin}>
        {children}
      </CurrentUserAdminContext.Provider>
    </CurrentUserIdContext.Provider>
  )
}

export function useCurrentUserIsAdmin() {
  return useContext(CurrentUserAdminContext)
}

export function useCurrentUserId() {
  const userId = useContext(CurrentUserIdContext)
  if (!userId) throw new Error('useCurrentUserId must be used within CurrentUserProvider')
  return userId
}
