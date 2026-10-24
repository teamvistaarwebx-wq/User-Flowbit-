import { lookup as dnsLookup, type LookupAddress } from 'node:dns'
import http from 'node:http'
import https from 'node:https'
import type { LookupFunction } from 'node:net'
import { isBlockedAddress, webhookUrlProblem } from './ssrf'

/**
 * POST for outbound webhooks with the SSRF guard on the connection itself:
 * the socket's DNS lookup refuses private addresses (no rebinding window),
 * redirects are not followed, and each try stops after 10 seconds.
 */

export const TIMEOUT_MS = 10_000
const MAX_RESPONSE_BYTES = 2048

export type PostResult = Readonly<{ status: number | null; error: string | null }>
export type Poster = (url: string, body: string, headers: Record<string, string>) => Promise<PostResult>

/** A lookup that refuses blocked addresses, for http(s).request. */
export const guardedLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error, '', 0)
    const list = (Array.isArray(addresses) ? addresses : [addresses]) as LookupAddress[]
    const blocked = list.find((a) => isBlockedAddress(a.address))
    if (blocked || !list.length) return callback(Object.assign(new Error('Blocked address'), { code: 'EBLOCKED' }), '', 0)
    if ((options as { all?: boolean }).all) return (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, list)
    callback(null, list[0].address, list[0].family)
  })
}

export type PostOptions = Readonly<{ lookup: LookupFunction; timeoutMs: number; checkUrl: boolean }>

/**
 * One POST with an absolute deadline: the socket's idle timeout alone lets a
 * server that sends a byte every few seconds hold the delivery (and the
 * shared retry queue) until the cron is killed.
 */
export const postWith = (url: string, body: string, headers: Record<string, string>, opts: PostOptions): Promise<PostResult> =>
  new Promise((resolve) => {
    const problem = opts.checkUrl ? webhookUrlProblem(url) : null
    if (problem) return resolve({ status: null, error: problem })
    let settled = false
    const finish = (result: PostResult) => {
      if (settled) return
      settled = true
      clearTimeout(deadline)
      resolve(result)
    }
    const target = new URL(url)
    const client = target.protocol === 'https:' ? https : http
    const req = client.request(
      target,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'Flowbit-Webhooks/1.0', 'Content-Length': Buffer.byteLength(body), ...headers }, lookup: opts.lookup, timeout: opts.timeoutMs },
      (res) => {
        let read = 0
        res.on('data', (chunk: Buffer) => {
          read += chunk.length
          if (read > MAX_RESPONSE_BYTES) res.destroy()
        })
        res.on('end', () => finish({ status: res.statusCode ?? null, error: null }))
        res.on('close', () => finish({ status: res.statusCode ?? null, error: null }))
        res.on('error', () => finish({ status: res.statusCode ?? null, error: null }))
      },
    )
    const timedOut = () => {
      req.destroy()
      finish({ status: null, error: `Timed out after ${Math.round(opts.timeoutMs / 1000)} seconds` })
    }
    const deadline = setTimeout(timedOut, opts.timeoutMs)
    req.on('timeout', timedOut)
    req.on('error', (error: NodeJS.ErrnoException) => finish({ status: null, error: error.code === 'EBLOCKED' ? 'The URL points to a private address' : error.message.slice(0, 200) }))
    req.end(body)
  })

export const postGuarded: Poster = (url, body, headers) => postWith(url, body, headers, { lookup: guardedLookup, timeoutMs: TIMEOUT_MS, checkUrl: true })
