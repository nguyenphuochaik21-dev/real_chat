import { redirect } from 'next/navigation'
import { getServerAuth } from '@/lib/supabase/auth'
import { AssistantSettings } from '@/components/admin/assistant-settings'

export default async function AssistantAdminPage() {
  const { supabase, user } = await getServerAuth()
  if (!user) redirect('/login')
  const { data } = await supabase
    .from('profiles')
    .select('role, is_suspended')
    .eq('id', user.id)
    .single()
  if (data?.role !== 'admin' || data.is_suspended) redirect('/chats')
  return <AssistantSettings />
}
