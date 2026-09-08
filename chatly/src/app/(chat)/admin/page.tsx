import { redirect } from 'next/navigation'
import { AdminDashboard } from '@/components/admin/admin-dashboard'
import { getAdminDashboard } from '@/lib/actions/admin'

export default async function AdminPage() {
  let data
  try {
    data = await getAdminDashboard()
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === 'Authentication required' ||
        error.message === 'Administrator access required')
    ) {
      redirect('/chats')
    }
    throw error
  }

  return <AdminDashboard data={data} />
}
