import { NextResponse, type NextRequest } from 'next/server'
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { captureLead } from '@/modules/orbit/capture/create'
import { honeypotTripped, normaliseOrigin, originAllowed } from '@/modules/orbit/capture/guard'
import { draftFromFields } from '@/modules/orbit/capture/map'
import { ipOf, readBody } from '@/modules/orbit/capture/request'
import { captureByFormKey } from '@/modules/orbit/capture/settings'

export const runtime = 'nodejs'

/**
 * A workspace's public website form (Orbit lead capture). The random key in
 * the path picks the workspace; posts are accepted only from the workspace's
 * own sites (Origin or Referer on its allow-list), rate-limited per IP and per
 * form, and a filled honeypot is thanked and dropped. Answers JSON to the
 * script embed, and a redirect or a short page to a plain HTML form.
 */

const cors = (origin: string | null): Record<string, string> => (origin ? { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type', vary: 'Origin' } : {})

const wantsJson = (request: NextRequest) => (request.headers.get('content-type') ?? '').includes('application/json') || (request.headers.get('accept') ?? '').includes('application/json')

function thanks(request: NextRequest, origin: string | null, thankYouUrl: string, allowed: readonly string[]) {
  if (wantsJson(request)) return NextResponse.json({ ok: true, message: 'Thank you. We will be in touch soon.' }, { headers: cors(origin) })
  if (thankYouUrl && originAllowed(normaliseOrigin(thankYouUrl), null, allowed)) return NextResponse.redirect(thankYouUrl, 303)
  return new NextResponse('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Thank you</title><body style="font-family:system-ui;padding:40px;text-align:center"><h1>Thank you</h1><p>We have your details and will be in touch soon.</p></body>', { headers: { 'content-type': 'text/html; charset=utf-8' } })
}

export async function OPTIONS(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params
  const capture = await captureByFormKey(key)
  const origin = request.headers.get('origin')
  if (!capture || !originAllowed(origin, null, capture.allowedOrigins ?? [])) return new NextResponse(null, { status: 403 })
  return new NextResponse(null, { status: 204, headers: { ...cors(normaliseOrigin(origin)), 'access-control-max-age': '600' } })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params
  const capture = await captureByFormKey(key)
  if (!capture) return NextResponse.json({ error: 'This form is not available.' }, { status: 404 })
  const allowed = capture.allowedOrigins ?? []
  const origin = normaliseOrigin(request.headers.get('origin'))
  if (!originAllowed(request.headers.get('origin'), request.headers.get('referer'), allowed)) return NextResponse.json({ error: 'This site may not post to this form.' }, { status: 403 })
  for (const [scope, id] of [['leadForm', ipOf(request)], ['leadFormKey', key]] as const) {
    const { limit, windowMs } = RATE_LIMITS[scope]
    const result = await rateLimit(`${scope}:${id}`, limit, windowMs)
    if (!result.ok) return NextResponse.json({ error: 'Too many submissions. Try again later.' }, { status: 429, headers: { ...cors(origin), 'retry-after': String(result.retryAfterSeconds) } })
  }
  const body = await readBody(request)
  if (!body) return NextResponse.json({ error: 'Send the form fields.' }, { status: 400, headers: cors(origin) })
  // A bot filled the hidden field: thank it like anyone else, keep nothing.
  if (honeypotTripped(body)) return thanks(request, origin, capture.thankYouUrl ?? '', allowed)
  const draft = draftFromFields(body, 'website_form', { extraTags: ['website'] })
  if (!draft) return NextResponse.json({ error: 'Enter an email address or a phone number.' }, { status: 400, headers: cors(origin) })
  try {
    const outcome = await captureLead(capture.orgId, draft)
    if (outcome.status === 'refused') return NextResponse.json({ error: 'This form cannot take enquiries right now.' }, { status: 503, headers: cors(origin) })
  } catch (error) {
    console.error('[lead form] capture failed', String(capture.orgId), error)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500, headers: cors(origin) })
  }
  return thanks(request, origin, capture.thankYouUrl ?? '', allowed)
}
