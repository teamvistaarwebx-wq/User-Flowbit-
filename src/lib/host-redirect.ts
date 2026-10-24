/**
 * On a Vercel production deployment with its own domain (APP_URL), page
 * visits on any *.vercel.app address are sent to APP_URL. Sessions, the
 * Google sign-in state cookie and email links all belong to APP_URL's host,
 * so a second address would sign people out, break Google sign-in and mix
 * hosts. /api stays reachable on both (cron, webhooks, health checks).
 * Read by next.config.ts at build time; Vercel provides VERCEL_ENV then.
 */

type Env = Record<string, string | undefined>

export type HostRedirect = {
  source: string
  has: { type: 'host'; value: string }[]
  destination: string
  permanent: boolean
}

/** Any path except /api/…, captured as :path. */
export const NON_API_PATHS = '/:path((?!api/).*)'
export const VERCEL_APP_HOST = '(?<vercelHost>.+)\\.vercel\\.app'

function hostOf(url: string): string | null {
  try {
    return new URL(url).host
  } catch {
    return null
  }
}

export function vercelHostRedirects(env: Env): HostRedirect[] {
  if (env.VERCEL !== '1' || env.VERCEL_ENV !== 'production') return []
  const appUrl = env.APP_URL?.trim().replace(/\/$/, '') ?? ''
  const host = hostOf(appUrl)
  // Without a custom domain the vercel.app address is APP_URL itself.
  if (!host || !appUrl.startsWith('https://') || host.endsWith('.vercel.app')) return []
  return [{ source: NON_API_PATHS, has: [{ type: 'host', value: VERCEL_APP_HOST }], destination: `${appUrl}/:path`, permanent: false }]
}
