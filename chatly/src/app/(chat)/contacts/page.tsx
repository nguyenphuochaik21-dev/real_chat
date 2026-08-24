'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Phone, MessageSquare, UserPlus } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { createClient } from '@/lib/supabase/client'
import type { Tables } from '@/types'

type Profile = Tables<'profiles'>

function groupByLetter(users: Profile[]) {
  const grouped: Record<string, Profile[]> = {}
  users.forEach((user) => {
    const letter = user.display_name[0].toUpperCase()
    if (!grouped[letter]) {
      grouped[letter] = []
    }
    grouped[letter].push(user)
  })
  return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b))
}

export default function ContactsPage() {
  const router = useRouter()
  const supabase = createClient()
  const [search, setSearch] = useState('')
  const [contacts, setContacts] = useState<Profile[]>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [startingChat, setStartingChat] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    setCurrentUserId(user?.id || null)

    if (user) {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .neq('id', user.id)
        .order('display_name', { ascending: true })

      if (!error && data) {
        setContacts(data)
      }
    }
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const startConversation = useCallback(async (contactId: string) => {
    if (!currentUserId || startingChat) return

    setStartingChat(contactId)

    try {
      // Check if conversation already exists
      const { data: existingConvs } = await supabase
        .from('conversation_participants')
        .select('conversation_id')
        .eq('user_id', currentUserId)

      let conversationId: string | null = null

      for (const part of existingConvs || []) {
        const { data: otherParts } = await supabase
          .from('conversation_participants')
          .select('user_id')
          .eq('conversation_id', part.conversation_id)
          .eq('user_id', contactId)

        if (otherParts && otherParts.length > 0) {
          conversationId = part.conversation_id
          break
        }
      }

      // Create new conversation if not found
      if (!conversationId) {
        const { data: newConv, error: createError } = await supabase
          .from('conversations')
          .insert({ created_by: currentUserId, type: 'direct' })
          .select()
          .single()

        if (createError) {
          console.error('Create conversation error:', createError)
          throw new Error(`Failed to create conversation: ${createError.message}`)
        }
        if (!newConv) throw new Error('Failed to create conversation: no data returned')

        conversationId = newConv.id

        // Add current user first (RLS allows this)
        const { error: addSelfError } = await supabase
          .from('conversation_participants')
          .insert({
            conversation_id: conversationId,
            user_id: currentUserId,
          })

        if (addSelfError) {
          console.error('Add self error:', addSelfError)
          throw new Error(`Failed to add self: ${addSelfError.message}`)
        }

        // Add the other participant using a server action workaround
        const { error: addOtherError } = await supabase.rpc('add_conversation_participant', {
          p_conversation_id: conversationId,
          p_user_id: contactId,
        })

        if (addOtherError) {
          console.error('Add other error:', addOtherError)
          throw new Error(`Failed to add other: ${addOtherError.message}`)
        }
      }

      router.push(`/chats/${conversationId}`)
    } catch (err) {
      console.error('Failed to start conversation:', err)
    } finally {
      setStartingChat(null)
    }
  }, [currentUserId, startingChat, router, supabase])

  const filteredUsers = contacts.filter((user) =>
    user.display_name.toLowerCase().includes(search.toLowerCase())
  )

  const groupedUsers = groupByLetter(filteredUsers)

  if (loading) {
    return (
      <div className="flex h-full flex-1 items-center justify-center bg-[var(--bg-app)]">
        <div className="h-8 w-8 animate-spin rounded-full border-3 border-primary-500 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-1 flex-col bg-[var(--bg-app)]">
      {/* Header */}
      <div className="border-b border-[var(--border-default)] bg-[var(--bg-panel)] p-4">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">Contacts</h1>
          <Button variant="outline" size="sm">
            <UserPlus className="mr-2 h-4 w-4" />
            Add Contact
          </Button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
          <Input
            type="search"
            placeholder="Search contacts"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Contacts list */}
      <ScrollArea className="flex-1">
        <div className="p-4">
          {groupedUsers.length > 0 ? (
            groupedUsers.map(([letter, users]) => (
              <div key={letter}>
                <div className="sticky top-0 z-10 bg-[var(--bg-app)] py-2">
                  <h2 className="text-sm font-semibold text-[var(--text-muted)]">{letter}</h2>
                </div>
                <div className="space-y-1">
                  {users.map((user) => (
                    <div
                      key={user.id}
                      className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-[var(--bg-hover)]"
                    >
                      <Avatar user={user} size="md" showStatus />
                      <div className="flex-1">
                        <p className="font-medium text-[var(--text-primary)]">
                          {user.display_name}
                        </p>
                        {user.bio && (
                          <p className="truncate text-xs text-[var(--text-muted)]">{user.bio}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => startConversation(user.id)}
                          disabled={startingChat === user.id}
                        >
                          {startingChat === user.id ? (
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
                          ) : (
                            <MessageSquare className="h-4 w-4" />
                          )}
                        </Button>
                        <Button variant="ghost" size="icon-sm">
                          <Phone className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                <Separator className="my-2" />
              </div>
            ))
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-[var(--text-muted)]">
              <p className="text-sm">No contacts found</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
