import { redirect } from 'next/navigation'
import { ChatShell } from '@/components/layout/chat-shell'
import { getServerAuth } from '@/lib/supabase/auth'

export default async function ChatLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user } = await getServerAuth()

  if (!user) redirect('/login')

  const { data: profileData } = await supabase.rpc('get_my_profile')
  const profileRecord =
    profileData && typeof profileData === 'object' && !Array.isArray(profileData)
      ? profileData
      : null
  const profile = profileRecord
    ? {
        id: user.id,
        username: typeof profileRecord.username === 'string' ? profileRecord.username : '',
        display_name:
          typeof profileRecord.display_name === 'string' ? profileRecord.display_name : '',
        avatar_url: typeof profileRecord.avatar_url === 'string' ? profileRecord.avatar_url : null,
        status:
          profileRecord.status === 'online' ||
          profileRecord.status === 'away' ||
          profileRecord.status === 'busy' ||
          profileRecord.status === 'offline'
            ? (profileRecord.status as 'online' | 'away' | 'busy' | 'offline')
            : null,
        role: typeof profileRecord.role === 'string' ? profileRecord.role : undefined,
      }
    : null

  return (
    <ChatShell userId={user.id} profile={profile}>
      {children}
    </ChatShell>
  )
}
