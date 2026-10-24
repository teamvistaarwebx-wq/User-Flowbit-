import 'server-only'
import https from 'node:https'
import { guardedLookup } from '@/modules/webhooks/http'
import { webhookUrlProblem } from '@/modules/webhooks/ssrf'
import type { JsonPost } from './gsp'
import { GspError } from './gsp'

/**
 * The real HTTP call for the GSP adapter: https only, the SSRF guard on the
 * socket's DNS lookup (no private addresses), no redirects, a 20-second
 * idle timeout, a 30-second absolute deadline (a slow-drip reply cannot hold
 * the request) and a 1 MB reply cap. Tests inject their own JsonPost instead.
 */

const TIMEOUT_MS = 20_000
export const DEADLINE_MS = 30_000
const MAX_REPLY_BYTES = 1024 * 1024

export const gspPost: JsonPost = (url, body, headers) => gspPostWithin(url, body, headers, DEADLINE_MS)

/** gspPost with an explicit absolute deadline (tests use a short one). */
export const gspPostWithin = (url: string, body: unknown, headers: Record<string, string>, deadlineMs: number): ReturnType<JsonPost> =>
  new Promise((resolve, reject) => {
    const problem = webhookUrlProblem(url)
    if (problem || !url.startsWith('https://')) return reject(new GspError(problem ?? 'The GSP address must start with https://'))
    const payload = JSON.stringify(body)
    const req = https.request(
      new URL(url),
      { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'Flowbit-Folio/1.0', 'Content-Length': Buffer.byteLength(payload), ...headers }, lookup: guardedLookup, timeout: TIMEOUT_MS },
      (res) => {
        const chunks: Buffer[] = []
        let size = 0
        res.on('data', (chunk: Buffer) => {
          size += chunk.length
          if (size > MAX_REPLY_BYTES) return res.destroy(new Error('Reply too large'))
          chunks.push(chunk)
        })
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          try {
            resolve({ status: res.statusCode ?? 0, json: text ? JSON.parse(text) : null })
          } catch {
            reject(new GspError(`The GSP answered with HTTP ${res.statusCode ?? 0} and a reply Flowbit could not read.`))
          }
        })
        res.on('error', (error) => reject(new GspError(error.message.slice(0, 200))))
      },
    )
    const deadline = setTimeout(() => req.destroy(new Error(`The GSP did not finish answering within ${Math.round(deadlineMs / 1000)} seconds.`)), deadlineMs)
    req.on('close', () => clearTimeout(deadline))
    req.on('timeout', () => req.destroy(new Error('The GSP did not answer within 20 seconds.')))
    req.on('error', (error: NodeJS.ErrnoException) => reject(new GspError(error.code === 'EBLOCKED' ? 'The GSP address points to a private network.' : error.message.slice(0, 200))))
    req.end(payload)
  })
