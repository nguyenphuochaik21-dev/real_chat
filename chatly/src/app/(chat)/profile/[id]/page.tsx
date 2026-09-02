import { notFound, redirect } from 'next/navigation'
import { PublicProfileView } from '@/components/profile/public-profile-view'
import { createClient } from '@/lib/supabase/server'
import type { Tables } from '@/types'
import { getPublicProfile } from '@/lib/actions/profile'

export default async function PublicProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const [profile, { data: friendship }] = await Promise.all([
    getPublicProfile(id),
    supabase
      .from('friendships')
      .select('*')
      .or(
        `and(requester_id.eq.${user.id},addressee_id.eq.${id}),and(requester_id.eq.${id},addressee_id.eq.${user.id})`
      )
      .maybeSingle(),
  ])

  if (!profile) notFound()

  return (
    <PublicProfileView
      currentUserId={user.id}
      profile={profile}
      initialFriendship={(friendship as Tables<'friendships'> | null) ?? null}
    />
  )
}
