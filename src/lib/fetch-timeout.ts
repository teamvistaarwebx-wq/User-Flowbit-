/**
 * Timeouts for calls to outside providers (Razorpay, Recall, Sarvam, Resend,
 * Google, IndiaMART). undici's own timeouts are about 300 s, as long as a cron
 * function may run, so one hung call would hold its lease for the full run.
 */

/** Default for a provider API call (JSON in, JSON out). */
export const PROVIDER_TIMEOUT_MS = 10_000
/** Uploading or downloading audio (meeting recordings, up to 200 MB). */
export const MEDIA_TIMEOUT_MS = 120_000

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

/**
 * fetch with an AbortSignal timeout. A caller's own signal still works: the
 * call stops at whichever fires first. Throws a TimeoutError on timeout.
 */
export function fetchWithTimeout(input: string, init: RequestInit = {}, timeoutMs: number = PROVIDER_TIMEOUT_MS, fetchImpl: FetchLike = fetch): Promise<Response> {
  const timeout = AbortSignal.timeout(timeoutMs)
  const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout
  return fetchImpl(input, { ...init, signal })
}

/** Wraps a fetch so every call through it has a timeout (for clients that take a fetch to call). */
export const withTimeout = (fetchImpl: FetchLike, timeoutMs: number = PROVIDER_TIMEOUT_MS): FetchLike =>
  (input, init) => fetchWithTimeout(input, init, timeoutMs, fetchImpl)

/** Thrown by readBodyCapped when a body is larger than allowed. */
export class BodyTooLargeError extends Error {
  constructor(readonly maxBytes: number) {
    super(`The response is larger than ${maxBytes} bytes.`)
    this.name = 'BodyTooLargeError'
  }
}

/**
 * Reads a response body into memory, refusing (before reading) a declared
 * Content-Length over `maxBytes`, and stopping as soon as the bytes read pass it.
 */
export async function readBodyCapped(res: Response, maxBytes: number): Promise<Buffer> {
  const declared = Number(res.headers.get('content-length') ?? NaN)
  if (Number.isFinite(declared) && declared > maxBytes) {
    await res.body?.cancel().catch(() => undefined)
    throw new BodyTooLargeError(maxBytes)
  }
  if (!res.body) return Buffer.alloc(0)
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined)
      throw new BodyTooLargeError(maxBytes)
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks)
}
