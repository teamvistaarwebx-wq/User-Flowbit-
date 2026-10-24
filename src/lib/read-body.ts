/**
 * Reads a request body as text, refusing it once it passes `maxBytes`: a
 * declared Content-Length over the cap is refused before reading, and a
 * chunked or lying body is cut off while streaming, so an oversized webhook
 * is never buffered whole. Null when too large or unreadable.
 */
export async function readBodyLimited(request: Request, maxBytes: number): Promise<string | null> {
  const declared = Number(request.headers.get('content-length') ?? '')
  if (Number.isFinite(declared) && declared > maxBytes) return null
  if (!request.body) return ''
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBytes) {
        await reader.cancel().catch(() => undefined)
        return null
      }
      chunks.push(value)
    }
  } catch {
    return null
  }
  return Buffer.concat(chunks).toString('utf8')
}

const KB = 1024

/**
 * Per-route body caps. None of these providers publishes a maximum; their
 * events are small JSON envelopes (a payment, a delivery tick, a message with
 * media as URLs), so each cap leaves wide headroom over a real event.
 */
export const BODY_LIMITS = {
  /** Zapier / Make / Meta lead ads / JustDial lead pushes. */
  leadHook: 64 * KB,
  /** Razorpay events: payment, order, subscription and invoice entities. */
  razorpay: 256 * KB,
  /** Resend (Svix) delivery events: email metadata, no message bodies. */
  resend: 256 * KB,
  /** Interakt delivery ticks and inbound messages (media arrives as URLs). */
  interakt: 256 * KB,
  /** RFC 7591 client metadata: a name, a few redirect URIs, scopes. */
  oauthRegister: 16 * KB,
} as const
