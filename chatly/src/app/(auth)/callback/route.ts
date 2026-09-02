import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const requestedPath = searchParams.get('next')
  const next =
    requestedPath?.startsWith('/') && !requestedPath.startsWith('//') ? requestedPath : '/chats'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (user?.app_metadata.provider === 'github') {
        await supabase.auth.signOut()
        return NextResponse.redirect(`${origin}/login?error=provider_not_supported`)
      }
      const oauthAvatar = user?.user_metadata.avatar_url ?? user?.user_metadata.picture
      let trustedGoogleAvatar: string | null = null
      if (typeof oauthAvatar === 'string') {
        try {
          const avatarUrl = new URL(oauthAvatar)
          if (
            avatarUrl.protocol === 'https:' &&
            avatarUrl.hostname === 'lh3.googleusercontent.com'
          ) {
            trustedGoogleAvatar = avatarUrl.toString()
          }
        } catch {}
      }
      if (user && trustedGoogleAvatar) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('avatar_url')
          .eq('id', user.id)
          .single()
        if (!profile?.avatar_url) {
          await supabase
            .from('profiles')
            .update({ avatar_url: trustedGoogleAvatar, updated_at: new Date().toISOString() })
            .eq('id', user.id)
        }
      }
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Return to login page with error
  return NextResponse.redirect(`${origin}/login?error=auth_callback_error`)
}
