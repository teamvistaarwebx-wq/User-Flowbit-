import 'server-only'
import { appUrl } from '@/lib/env'
import { CORS_HEADERS } from './oauth/metadata'

/** Small helpers for the MCP and OAuth route handlers: the public origin and JSON with CORS and no caching. */

export const publicOrigin = () => appUrl('')

export function corsJson(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Pragma: 'no-cache', ...CORS_HEADERS, ...extra } })
}

export const preflight = () => new Response(null, { status: 204, headers: CORS_HEADERS })

/** application/x-www-form-urlencoded or JSON body → string map (OAuth endpoints accept both). Bodies over 16 KB are refused. */
export async function formParams(request: Request): Promise<Record<string, string> | null> {
  const raw = await request.text()
  if (raw.length > 16 * 1024) return null
  const type = request.headers.get('content-type') ?? ''
  if (type.includes('application/json')) {
    try {
      const body = JSON.parse(raw) as Record<string, unknown>
      return Object.fromEntries(Object.entries(body).filter(([, v]) => typeof v === 'string' || typeof v === 'number').map(([k, v]) => [k, String(v)]))
    } catch {
      return null
    }
  }
  return Object.fromEntries(new URLSearchParams(raw))
}
