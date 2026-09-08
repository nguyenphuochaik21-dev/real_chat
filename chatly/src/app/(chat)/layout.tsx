import { redirect } from 'next/navigation'
import { ChatShell } from '@/components/layout/chat-shell'
import { getServerAuth } from '@/lib/supabase/auth'

export default async function ChatLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user } = await getServerAuth()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url, status, role')
    .eq('id', user.id)
    .maybeSingle()

  return (
    <ChatShell userId={user.id} profile={profile}>
      {children}
    </ChatShell>
  )
}
