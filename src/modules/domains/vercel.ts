import 'server-only'
import { serverEnv } from '@/lib/env'

/**
 * Optional: adds a verified portal host to the Vercel project (VERCEL_DOMAINS_API=true
 * with VERCEL_API_TOKEN and VERCEL_PROJECT_ID). Without it the owner adds the
 * domain in Vercel → Project → Settings → Domains by hand (DEPLOY-VERCEL.md).
 */

export const vercelDomainsOn = (): boolean => {
  const env = serverEnv()
  return env.VERCEL_DOMAINS_API === 'true' && Boolean(env.VERCEL_API_TOKEN && env.VERCEL_PROJECT_ID)
}

export async function addVercelDomain(host: string, fetcher: typeof fetch = fetch): Promise<{ ok: boolean; error?: string }> {
  if (!vercelDomainsOn()) return { ok: false, error: 'off' }
  const env = serverEnv()
  const team = env.VERCEL_TEAM_ID ? `?teamId=${encodeURIComponent(env.VERCEL_TEAM_ID)}` : ''
  try {
    const res = await fetcher(`https://api.vercel.com/v10/projects/${encodeURIComponent(env.VERCEL_PROJECT_ID)}/domains${team}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.VERCEL_API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: host }),
      signal: AbortSignal.timeout(10_000),
    })
    if (res.ok || res.status === 409) return { ok: true }
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
    return { ok: false, error: body?.error?.message ?? `Vercel answered ${res.status}` }
  } catch (error) {
    return { ok: false, error: (error as Error).message.slice(0, 200) }
  }
}
