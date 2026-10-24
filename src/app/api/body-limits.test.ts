import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BODY_LIMITS } from '@/lib/read-body'
import { MAX_SCENE_BYTES } from '@/modules/work/whiteboards/scene'

/**
 * Every route that reads a raw body streams it through readBodyLimited: one
 * byte over its cap answers 413 before the body reaches signature checks or
 * handlers, and a body exactly at the cap is read whole.
 */

const h = vi.hoisted(() => ({
  verifyLead: vi.fn(() => false),
  verifyRazorpay: vi.fn(() => false),
  verifyResend: vi.fn(() => false),
  verifyInterakt: vi.fn(() => false),
  razorpayHook: vi.fn(async () => ({ status: 400, body: { error: 'bad signature' } })),
  parseRegistration: vi.fn(() => ({ error: 'invalid_client_metadata' })),
  saveSchemaParse: vi.fn(() => ({ success: false })),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/env', () => ({ serverEnv: () => ({ RAZORPAY_WEBHOOK_SECRET: 's', RESEND_WEBHOOK_SECRET: 's', INTERAKT_WEBHOOK_SECRET: 's' }) }))
vi.mock('@/lib/db', () => ({ dbConnect: async () => undefined }))
vi.mock('@/lib/platform', () => ({ elevated: vi.fn() }))
vi.mock('@/lib/request', () => ({ requestIp: async () => '203.0.113.9' }))
vi.mock('@/lib/ctx', () => ({ getCtx: async () => ({ orgId: 'org1', readOnly: false, has: () => true, can: () => true }), routeRefused: () => false, blockedResponse: () => new Response(null, { status: 403 }) }))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: async () => ({ ok: true, retryAfterSeconds: 0 }), RATE_LIMITS: { leadHook: { limit: 60, windowMs: 60_000 } } }))
vi.mock('@/models/subscription/BillingEvent', () => ({ BillingEvent: {} }))
vi.mock('@/modules/subscription/signatures', () => ({ verifyWebhookSignature: h.verifyRazorpay }))
vi.mock('@/modules/subscription/webhook', () => ({ processRazorpayEvent: vi.fn() }))
vi.mock('@/modules/messaging/signatures', () => ({ verifyResendWebhook: h.verifyResend }))
vi.mock('@/modules/messaging/webhook', () => ({ applyResendEvent: vi.fn() }))
vi.mock('@/modules/features/flags', () => ({ whatsAppEnabled: async () => true }))
vi.mock('@/modules/whatsapp/inbox', () => ({ applyInteraktEvent: vi.fn() }))
vi.mock('@/modules/whatsapp/webhook-event', () => ({ parseInteraktEvent: vi.fn(), verifyInteraktWebhook: h.verifyInterakt }))
vi.mock('@/modules/whatsapp/connection', () => ({ connectionForHook: async () => ({ orgId: 'org1', webhookSecret: 's' }), touchConnection: vi.fn() }))
vi.mock('@/modules/whatsapp/workspace-webhook', () => ({ applyWorkspaceEvent: vi.fn() }))
vi.mock('@/modules/payments/webhook', () => ({ handleWorkspaceWebhook: h.razorpayHook }))
vi.mock('@/modules/orbit/capture/settings', () => ({ captureByHookKey: async () => ({ orgId: 'org1', token: 'tok' }) }))
vi.mock('@/modules/orbit/capture/create', () => ({ captureLead: vi.fn() }))
vi.mock('@/modules/orbit/capture/map', () => ({ draftFromWebhook: vi.fn() }))
vi.mock('@/modules/connectors/inbound-task', () => ({ createInboundTask: vi.fn() }))
vi.mock('@/modules/webhooks/sign', () => ({ verifySignature: h.verifyLead }))
vi.mock('@/modules/mcp/oauth/clients', () => ({ parseRegistration: h.parseRegistration, isRegistrationError: () => true }))
vi.mock('@/modules/mcp/oauth/core', () => ({ registerClient: vi.fn(), registrationResponse: vi.fn() }))
vi.mock('@/modules/mcp/oauth/store', () => ({ mongoOAuthStore: {} }))
vi.mock('@/modules/work/whiteboards/access', () => ({ loadBoard: vi.fn() }))
vi.mock('@/modules/work/whiteboards/save', () => ({ saveScene: vi.fn() }))
vi.mock('@/modules/work/whiteboards/scene', async (orig) => ({ ...(await orig<typeof import('@/modules/work/whiteboards/scene')>()), saveSchema: { safeParse: h.saveSchemaParse } }))

const CHUNK = 16 * 1024

/** A chunked body of `size` bytes with no Content-Length, like a streaming client would send; `sent()` counts bytes handed over. */
const streamOf = (size: number) => {
  let left = size
  let sent = 0
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (left <= 0) return controller.close()
      const n = Math.min(CHUNK, left)
      left -= n
      sent += n
      controller.enqueue(new Uint8Array(n).fill(0x61))
    },
  })
  return { body, sent: () => sent }
}

const request = (body: ReadableStream<Uint8Array>) => new NextRequest('https://flowbit.test/hook', { method: 'POST', body, duplex: 'half' } as ConstructorParameters<typeof NextRequest>[1])
const post = (size: number) => request(streamOf(size).body)

type Handler = (request: NextRequest) => Promise<Response>
const withParams = <P extends Record<string, string>>(params: P) => ({ params: Promise.resolve(params) })

/** Bodies the routes read as text and parse as JSON reach the parser as an `a…a` string, which then fails to parse. */
const jsonParse = vi.spyOn(JSON, 'parse')

/** Each route, its cap, and the first function that receives the raw body (which must not run when the body is refused). */
const ROUTES: { name: string; cap: number; load: () => Promise<Handler>; reader: () => ReturnType<typeof vi.fn> }[] = [
  { name: 'lead webhook', cap: BODY_LIMITS.leadHook, reader: () => h.verifyLead, load: async () => { const { POST } = await import('./webhooks/leads/[key]/route'); return (r) => POST(r, withParams({ key: 'k' })) } },
  { name: 'subscription Razorpay webhook', cap: BODY_LIMITS.razorpay, reader: () => h.verifyRazorpay, load: async () => (await import('./subscription/razorpay/webhook/route')).POST },
  { name: 'workspace Razorpay webhook', cap: BODY_LIMITS.razorpay, reader: () => h.razorpayHook, load: async () => { const { POST } = await import('./webhooks/razorpay/[hook]/route'); return (r) => POST(r, withParams({ hook: 'h' })) } },
  { name: 'Resend webhook', cap: BODY_LIMITS.resend, reader: () => h.verifyResend, load: async () => (await import('./webhooks/resend/route')).POST },
  { name: 'Interakt webhook', cap: BODY_LIMITS.interakt, reader: () => h.verifyInterakt, load: async () => (await import('./webhooks/interakt/route')).POST },
  { name: 'OAuth client registration', cap: BODY_LIMITS.oauthRegister, reader: () => jsonParse as unknown as ReturnType<typeof vi.fn>, load: async () => (await import('../oauth/register/route')).POST },
  { name: 'whiteboard autosave', cap: MAX_SCENE_BYTES, reader: () => jsonParse as unknown as ReturnType<typeof vi.fn>, load: async () => { const { PUT } = await import('./work/whiteboards/[id]/route'); return (r) => PUT(r, withParams({ id: 'aaaaaaaaaaaaaaaaaaaaaaaa' })) } },
  { name: 'workspace WhatsApp webhook', cap: BODY_LIMITS.interakt, reader: () => h.verifyInterakt, load: async () => { const { POST } = await import('./webhooks/whatsapp/[hook]/route'); return (r) => POST(r, withParams({ hook: 'h' })) } },
]

describe('raw-body routes refuse oversized bodies while streaming', () => {
  beforeEach(() => vi.clearAllMocks())

  it.each(ROUTES)('$name answers 413 one byte over its cap', async ({ cap, load, reader }) => {
    // Arrange
    const handler = await load()

    // Act
    const response = await handler(post(cap + 1))

    // Assert
    expect(response.status).toBe(413)
    expect(reader()).not.toHaveBeenCalled()
  })

  it.each(ROUTES)('$name stops reading a far larger body near its cap instead of buffering it', async ({ cap, load }) => {
    // Arrange
    const handler = await load()
    const stream = streamOf(cap * 8)

    // Act
    const response = await handler(request(stream.body))

    // Assert: at most the cap plus the chunk that crossed it and one the stream may prefetch.
    expect(response.status).toBe(413)
    expect(stream.sent()).toBeLessThanOrEqual(cap + 2 * CHUNK)
  })

  it.each(ROUTES)('$name reads a body exactly at its cap', async ({ cap, load, reader }) => {
    // Arrange
    const handler = await load()

    // Act
    const response = await handler(post(cap))

    // Assert: the body reached the signature check / handler whole (which then refuses the fake signature).
    expect(response.status).not.toBe(413)
    expect(reader()).toHaveBeenCalledTimes(1)
    const raw = JSON.stringify(reader().mock.calls[0])
    expect(raw).toContain('a'.repeat(cap))
  })
})
