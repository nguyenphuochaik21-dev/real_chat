import { redirect } from 'next/navigation'
import { AdminDashboard } from '@/components/admin/admin-dashboard'
import { getServerAuth } from '@/lib/supabase/auth'

export default async function AdminPage() {
  const { supabase, user } = await getServerAuth()
  if (!user) redirect('/login')

  const { data: isAdmin } = await supabase.rpc('is_chatly_admin', { p_user_id: user.id })
  if (!isAdmin) redirect('/chats')

  return <AdminDashboard currentUserId={user.id} />
}
