import { describe, expect, it, vi } from 'vitest'
import { downloadGif, gifFileName, isKlipyMediaUrl, klipyUrl, parseGifResults, searchGifs, type Fetch } from './gifs'

const reply = { results: [
  { id: 'g1', content_description: 'Thank you dance', media_formats: { gif: { url: 'https://static.klipy.com/g1.gif', dims: [480, 360] }, tinygif: { url: 'https://static.klipy.com/g1-tiny.gif', dims: [220, 165] } } },
  { id: 'evil', media_formats: { gif: { url: 'https://evil.example/x.gif' }, tinygif: { url: 'https://static.klipy.com/x.gif' } } },
  { id: 'g2', title: 'Party', media_formats: { gif: { url: 'https://media.klipycdn.com/g2.gif' } } },
] }

describe('GIF search through Klipy (mocked, no network)', () => {
  it('builds search and featured URLs with the key server-side and a capped query', () => {
    const search = new URL(klipyUrl('k1', '  thank you  ', { customerId: 'c' }))
    expect(search.pathname).toBe('/v2/search')
    expect(search.searchParams.get('q')).toBe('thank you')
    expect(search.searchParams.get('key')).toBe('k1')
    expect(search.searchParams.get('contentfilter')).toBe('medium')
    expect(new URL(klipyUrl('k1', '')).pathname).toBe('/v2/featured')
    expect(new URL(klipyUrl('k1', 'x'.repeat(200))).searchParams.get('q')).toHaveLength(50)
  })

  it('keeps only results whose media is on Klipy hosts', () => {
    expect(parseGifResults(reply)).toEqual([
      { id: 'g1', title: 'Thank you dance', previewUrl: 'https://static.klipy.com/g1-tiny.gif', url: 'https://static.klipy.com/g1.gif', width: 220, height: 165 },
      { id: 'g2', title: 'Party', previewUrl: 'https://media.klipycdn.com/g2.gif', url: 'https://media.klipycdn.com/g2.gif', width: 0, height: 0 },
    ])
    expect(parseGifResults({ results: 'nope' })).toEqual([])
    expect(isKlipyMediaUrl('http://static.klipy.com/a.gif')).toBe(false)
    expect(isKlipyMediaUrl('https://klipy.com.evil.example/a.gif')).toBe(false)
    expect(isKlipyMediaUrl('https://user:pw@static.klipy.com/a.gif')).toBe(false)
  })

  it('searches with the injected fetch and reads failures as no results', async () => {
    const ok = vi.fn(async () => new Response(JSON.stringify(reply), { status: 200 })) as unknown as Fetch
    expect(await searchGifs('k1', 'thanks', { fetchImpl: ok })).toHaveLength(2)
    expect(await searchGifs('', 'thanks', { fetchImpl: ok })).toEqual([])
    const down = vi.fn(async () => new Response('x', { status: 500 })) as unknown as Fetch
    expect(await searchGifs('k1', 'thanks', { fetchImpl: down })).toEqual([])
    const throws = vi.fn(async () => Promise.reject(new Error('net'))) as unknown as Fetch
    expect(await searchGifs('k1', 'thanks', { fetchImpl: throws })).toEqual([])
  })

  it('copies a picked GIF only from Klipy, only a GIF, and only up to the size cap', async () => {
    const gif = (body: string, type = 'image/gif') => vi.fn(async () => new Response(body, { status: 200, headers: { 'content-type': type } })) as unknown as Fetch
    expect((await downloadGif('https://static.klipy.com/g1.gif', 100, gif('GIF89a'))).toString()).toBe('GIF89a')
    await expect(downloadGif('https://evil.example/g.gif', 100, gif('GIF89a'))).rejects.toThrow(/not from the GIF library/)
    await expect(downloadGif('https://static.klipy.com/g1.gif', 100, gif('<html>', 'text/html'))).rejects.toThrow(/not a GIF/)
    await expect(downloadGif('https://static.klipy.com/g1.gif', 4, gif('GIF89a-long'))).rejects.toThrow(/too large/)
    expect(gifFileName('Thank You! 🎉')).toBe('thank-you.gif')
    expect(gifFileName('')).toBe('gif.gif')
  })
})
