import { lookup } from 'node:dns'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { postWith } from './http'

/** A server that keeps the response alive by sending one byte every 40 ms, forever. */
let server: Server
let url = ''
beforeAll(async () => {
  server = createServer((_req, res) => {
    res.writeHead(200)
    const tick = setInterval(() => res.write('.'), 40)
    res.on('close', () => clearInterval(tick))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`
})
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))

describe('outbound webhook deadline', () => {
  it('stops a slow-drip response at the absolute deadline, not only after an idle gap', async () => {
    const started = Date.now()
    const result = await postWith(url, '{}', {}, { lookup, timeoutMs: 300, checkUrl: false })
    expect(result.error).toMatch(/Timed out/)
    expect(Date.now() - started).toBeLessThan(2_000)
  })
})
