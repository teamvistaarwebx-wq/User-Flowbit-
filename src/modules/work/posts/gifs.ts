/**
 * GIF search for Posts through Klipy's Tenor-compatible API (v2 shape:
 * results[].media_formats.{gif,tinygif}). Pure apart from the injected fetch.
 * The browser never talks to Klipy: searches go through /api/work/gifs, and
 * a picked GIF is copied into the workspace's files (only from Klipy's own
 * hosts), so posts never hotlink.
 */

export const KLIPY_API_BASE = 'https://api.klipy.com/v2'
export const GIF_PAGE_SIZE = 24
export const MAX_GIF_QUERY = 50
/** Klipy serves media from these hosts (and their subdomains); nothing else is fetched. */
const MEDIA_HOSTS = ['klipy.com', 'klipycdn.com']

export type GifResult = Readonly<{ id: string; title: string; previewUrl: string; url: string; width: number; height: number }>

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>

/** The search (or, without a query, featured) URL. The key goes in the query, as Tenor's API expects; it never reaches the browser. */
export function klipyUrl(key: string, query: string, opts: { limit?: number; customerId?: string; base?: string } = {}): string {
  const q = query.trim().slice(0, MAX_GIF_QUERY)
  const url = new URL(`${opts.base ?? KLIPY_API_BASE}/${q ? 'search' : 'featured'}`)
  if (q) url.searchParams.set('q', q)
  url.searchParams.set('key', key)
  url.searchParams.set('limit', String(opts.limit ?? GIF_PAGE_SIZE))
  url.searchParams.set('media_filter', 'gif,tinygif')
  url.searchParams.set('contentfilter', 'medium')
  url.searchParams.set('locale', 'en_IN')
  if (opts.customerId) url.searchParams.set('customer_id', opts.customerId)
  return url.toString()
}

/** True for an https URL on Klipy's media hosts. */
export function isKlipyMediaUrl(raw: string): boolean {
  try {
    const url = new URL(raw)
    const host = url.hostname.toLowerCase()
    return url.protocol === 'https:' && !url.username && !url.password && MEDIA_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))
  } catch {
    return false
  }
}

type Format = { url?: unknown; dims?: unknown }
const formatOf = (v: unknown): Format => (v && typeof v === 'object' ? (v as Format) : {})
const str = (v: unknown) => (typeof v === 'string' ? v : '')

/** The usable results of a Tenor-shaped reply: both sizes present and on Klipy's hosts. */
export function parseGifResults(body: unknown): GifResult[] {
  const results = (body && typeof body === 'object' ? (body as { results?: unknown }).results : null) ?? []
  if (!Array.isArray(results)) return []
  return results.flatMap((r): GifResult[] => {
    const row = (r ?? {}) as Record<string, unknown>
    const formats = (row.media_formats ?? {}) as Record<string, unknown>
    const gif = formatOf(formats.gif)
    const tiny = formatOf(formats.tinygif)
    const url = str(gif.url)
    const previewUrl = str(tiny.url) || url
    if (!url || !isKlipyMediaUrl(url) || !isKlipyMediaUrl(previewUrl)) return []
    const dims = Array.isArray(tiny.dims) ? tiny.dims : Array.isArray(gif.dims) ? gif.dims : []
    return [{ id: str(row.id), title: (str(row.content_description) || str(row.title) || 'GIF').slice(0, 120), previewUrl, url, width: Number(dims[0]) || 0, height: Number(dims[1]) || 0 }]
  })
}

/** Searches Klipy (featured without a query). Errors and timeouts read as no results. */
export async function searchGifs(key: string, query: string, opts: { customerId?: string; fetchImpl?: Fetch; timeoutMs?: number } = {}): Promise<GifResult[]> {
  if (!key) return []
  const fetchImpl = opts.fetchImpl ?? fetch
  try {
    const res = await fetchImpl(klipyUrl(key, query, { customerId: opts.customerId }), { signal: AbortSignal.timeout(opts.timeoutMs ?? 5000), headers: { accept: 'application/json' } })
    if (!res.ok) return []
    return parseGifResults(await res.json())
  } catch {
    return []
  }
}

/** A filename for the copied GIF: its title, made safe, ending in .gif. */
export const gifFileName = (title: string) => `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'gif'}.gif`

/**
 * Copies a picked GIF from Klipy: https on Klipy's hosts only, no redirects,
 * a GIF content type and at most `maxBytes`, read while streaming.
 */
export async function downloadGif(url: string, maxBytes: number, fetchImpl: Fetch = fetch): Promise<Buffer> {
  if (!isKlipyMediaUrl(url)) throw new Error('That GIF is not from the GIF library.')
  const res = await fetchImpl(url, { redirect: 'error', signal: AbortSignal.timeout(10_000) })
  if (!res.ok || !res.body) throw new Error('The GIF could not be fetched. Try another one.')
  if (!/^image\/gif\b/i.test(res.headers.get('content-type') ?? '')) throw new Error('That file is not a GIF.')
  const declared = Number(res.headers.get('content-length') ?? '')
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error('That GIF is too large. Pick a smaller one.')
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > maxBytes) {
      await reader.cancel().catch(() => undefined)
      throw new Error('That GIF is too large. Pick a smaller one.')
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks)
}
