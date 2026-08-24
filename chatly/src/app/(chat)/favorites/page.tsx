'use client'

import Link from 'next/link'
import { Star, Phone, MessageSquare } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { mockUsers } from '@/lib/mock/users'

export default function FavoritesPage() {
  // Mock favorites (first 3 users)
  const favorites = mockUsers.slice(0, 3)

  return (
    <div className="flex h-full flex-1 flex-col bg-[var(--bg-app)]">
      {/* Header */}
      <div className="border-b border-[var(--border-default)] bg-[var(--bg-panel)] p-4">
        <h1 className="text-xl font-semibold text-[var(--text-primary)]">Favorites</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">Your starred contacts</p>
      </div>

      {/* Favorites list */}
      <ScrollArea className="flex-1">
        <div className="p-4">
          {favorites.length > 0 ? (
            favorites.map((user, index) => (
              <div key={user.id}>
                <div className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-[var(--bg-hover)]">
                  <Avatar user={user} size="lg" showStatus />

                  <div className="flex-1">
                    <p className="font-medium text-[var(--text-primary)]">{user.display_name}</p>
                    {user.bio && (
                      <p className="truncate text-xs text-[var(--text-muted)]">{user.bio}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <Link href={`/chats/conv-1`}>
                      <Button variant="ghost" size="icon">
                        <MessageSquare className="h-5 w-5" />
                      </Button>
                    </Link>
                    <Button variant="ghost" size="icon">
                      <Phone className="h-5 w-5" />
                    </Button>
                    <Button variant="ghost" size="icon">
                      <Star className="h-5 w-5 fill-yellow-400 text-yellow-400" />
                    </Button>
                  </div>
                </div>
                {index < favorites.length - 1 && <Separator className="my-2" />}
              </div>
            ))
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-[var(--text-muted)]">
              <Star className="mb-3 h-12 w-12 opacity-50" />
              <p className="text-sm">No favorites yet</p>
              <p className="mt-1 text-xs">Star contacts to add them here</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
