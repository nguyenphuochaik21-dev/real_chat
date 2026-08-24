export interface MockUser {
  id: string
  username: string
  display_name: string
  avatar_url: string | null
  bio?: string
  phone?: string
  email?: string
  status: 'online' | 'offline' | 'away' | 'busy'
  last_seen?: string
}

export interface MockConversation {
  id: string
  type: 'direct'
  participant: MockUser
  last_message: MockMessage
  unread_count: number
  is_pinned: boolean
  is_muted: boolean
  is_archived: boolean
}

export interface MockMessage {
  id: string
  conversation_id: string
  sender_id: string
  content: string
  created_at: string
  status: 'sending' | 'sent' | 'delivered' | 'read'
}

export interface MockCall {
  id: string
  participant: MockUser
  type: 'voice' | 'video'
  direction: 'incoming' | 'outgoing' | 'missed'
  started_at: string
  duration_seconds?: number
}

export interface MockStatus {
  id: string
  user: MockUser
  media_url: string
  caption?: string
  created_at: string
  viewed: boolean
  view_count: number
}
