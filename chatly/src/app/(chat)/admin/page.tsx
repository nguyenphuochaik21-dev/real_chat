import { redirect } from 'next/navigation'
import { AdminDashboard } from '@/components/admin/admin-dashboard'
import { getAdminDashboard } from '@/lib/actions/admin'

export default async function AdminPage() {
  let data
  try {
    data = await getAdminDashboard()
  } catch {
    redirect('/chats')
  }

  return <AdminDashboard data={data} />
}
