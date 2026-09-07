import { notFound } from 'next/navigation'
import { GroupJoinCard } from '@/components/groups/group-join-card'
import { getGroupShareInfo } from '@/lib/actions/groups'

export default async function JoinGroupPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  let group = null
  try {
    group = await getGroupShareInfo(token)
  } catch {
    notFound()
  }
  if (!group) notFound()
  return <GroupJoinCard token={token} group={group} />
}
