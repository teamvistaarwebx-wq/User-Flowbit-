import { destroySession } from '@/lib/auth/session'

/**
 * POST /api/auth/signout: ends the session and sends the browser to /login.
 * The Location is relative so it lands on the host the person is using, never
 * on a stale APP_URL. Plain forms post here; client code uses lib/sign-out.
 */
export async function POST() {
  await destroySession()
  return new Response(null, { status: 303, headers: { Location: '/login', 'Cache-Control': 'no-store' } })
}
