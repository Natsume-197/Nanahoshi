import { NextResponse } from 'next/server'
// The client you created from the Server-Side Auth instructions
import { createClient } from '@/lib/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // if "next" is in param, use it as the redirect URL
  const next = searchParams.get('next') ?? '/'

  if (code) {
    const supabase = await createClient()
    const { data: { session }, error: authError } = await supabase.auth.exchangeCodeForSession(code)

    if (authError || !session?.provider_token) {
      throw new Error('Failed to authenticate with Discord')
    }

    if (!authError) {
      // Check Discord Identity
      const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID
      const REQUIRED_ROLE_IDS = process.env.DISCORD_REQUIRED_ROLE_ID?.split(',') || []
      const accessToken = session.provider_token

      if (!DISCORD_GUILD_ID || REQUIRED_ROLE_IDS.length === 0) {
        throw new Error('Env Discord variables configuration error')
      }

      const memberResponse = await fetch(
        `https://discord.com/api/users/@me/guilds/${DISCORD_GUILD_ID}/member`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        }
      )
      
      if (!memberResponse.ok) {
        return NextResponse.redirect(`${origin}/auth/error?error=Failed-Answer-Discord`)
      }

      
      const memberData = await memberResponse.json()

      const hasRequiredRole = REQUIRED_ROLE_IDS.some(roleId => 
        memberData.roles.includes(roleId)
      )

      if (!hasRequiredRole) {
        await supabase.auth.signOut()
        return NextResponse.redirect(`${origin}/auth/error?error=No-Authorization`)
      }

      const forwardedHost = request.headers.get('x-forwarded-host') // original origin before load balancer
      const isLocalEnv = process.env.NODE_ENV === 'development'
      if (isLocalEnv) {
        // we can be sure that there is no load balancer in between, so no need to watch for X-Forwarded-Host
        return NextResponse.redirect(`${origin}${next}`)
      } else if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`)
      } else {
        return NextResponse.redirect(`${origin}${next}`)
      }
    }
  }

  // return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/auth/error`)
}
