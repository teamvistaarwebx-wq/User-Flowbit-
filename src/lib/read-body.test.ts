import { describe, expect, it } from 'vitest'
import { readBodyLimited } from './read-body'

const streamOf = (chunks: string[], onPull?: () => void) =>
  new ReadableStream<Uint8Array>({
    start() {},
    pull(controller) {
      onPull?.()
      const next = chunks.shift()
      if (next === undefined) controller.close()
      else controller.enqueue(new TextEncoder().encode(next))
    },
  })

const post = (body: ReadableStream<Uint8Array> | string, headers: Record<string, string> = {}) => new Request('https://x.test/hook', { method: 'POST', body, headers, duplex: 'half' } as RequestInit)

describe('readBodyLimited (L13)', () => {
  it('reads a body under the cap', async () => {
    expect(await readBodyLimited(post('{"ok":true}'), 100)).toBe('{"ok":true}')
    expect(await readBodyLimited(post(streamOf(['ab', 'cd'])), 4)).toBe('abcd')
  })

  it('refuses a declared Content-Length over the cap without reading', async () => {
    let pulls = 0
    expect(await readBodyLimited(post(streamOf(['x'], () => (pulls += 1)), { 'content-length': '5000' }), 100)).toBeNull()
    expect(pulls).toBeLessThanOrEqual(1) // the stream may prefetch one chunk on its own; nothing more is read
  })

  it('stops reading a chunked body as soon as it passes the cap', async () => {
    let pulls = 0
    const chunks = Array.from({ length: 1000 }, () => 'x'.repeat(1024))
    expect(await readBodyLimited(post(streamOf(chunks, () => (pulls += 1))), 4096)).toBeNull()
    expect(pulls).toBeLessThan(10)
  })
})
