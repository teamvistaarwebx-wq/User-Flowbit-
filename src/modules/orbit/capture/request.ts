import 'server-only'
import type { NextRequest } from 'next/server'

/** Reading a public lead post (form-encoded, multipart or JSON) into a flat object, capped in size. */

const MAX_BODY = 32 * 1024

export async function readBody(request: NextRequest): Promise<Record<string, unknown> | null> {
  const length = Number(request.headers.get('content-length') ?? 0)
  if (length > MAX_BODY) return null
  const type = request.headers.get('content-type') ?? ''
  try {
    if (type.includes('application/json')) {
      const raw = await request.text()
      if (raw.length > MAX_BODY) return null
      const json = JSON.parse(raw) as unknown
      return json && typeof json === 'object' && !Array.isArray(json) ? (json as Record<string, unknown>) : null
    }
    const form = await request.formData()
    const out: Record<string, unknown> = {}
    for (const [k, v] of form.entries()) if (typeof v === 'string' && k.length <= 60) out[k] = v.slice(0, 4000)
    return out
  } catch {
    return null
  }
}

/** The client IP as the right-most X-Forwarded-For hop (lib/request), for rate limits. */
export function ipOf(request: NextRequest): string {
  const hops = (request.headers.get('x-forwarded-for') ?? '').split(',').map((v) => v.trim()).filter(Boolean)
  return hops.at(-1) || request.headers.get('x-real-ip') || 'local'
}
