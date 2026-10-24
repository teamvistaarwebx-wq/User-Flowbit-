import { createHash, createHmac } from 'node:crypto'
import { safeKey } from './types'
import type { S3Config } from './s3'

/**
 * Presigned S3 URLs (AWS Signature V4, query auth, UNSIGNED-PAYLOAD) for
 * direct browser uploads to the private bucket: large meeting recordings
 * skip the app server and Vercel's 4 MB body limit. Pure node:crypto, works
 * with AWS S3 and Cloudflare R2 (path style on a custom endpoint).
 */

const encode = (value: string) => encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')
const hmac = (key: Buffer | string, value: string) => createHmac('sha256', key).update(value).digest()

export type PresignInput = Readonly<{ method: 'GET' | 'PUT'; key: string; expiresSeconds: number; now?: Date }>

/** Host and path of an object: virtual-hosted on AWS, path style on a custom endpoint (R2) or when forced. */
export function objectLocation(config: S3Config, key: string): { origin: string; host: string; path: string } {
  const objectPath = safeKey(key).split('/').map(encode).join('/')
  if (config.endpoint || config.forcePathStyle) {
    const url = new URL(config.endpoint || `https://s3.${config.region}.amazonaws.com`)
    return { origin: `${url.protocol}//${url.host}`, host: url.host, path: `/${encode(config.bucket)}/${objectPath}` }
  }
  // us-east-1 answers on the global host (AWS's own SigV4 examples use it).
  const host = config.region === 'us-east-1' ? `${config.bucket}.s3.amazonaws.com` : `${config.bucket}.s3.${config.region}.amazonaws.com`
  return { origin: `https://${host}`, host, path: `/${objectPath}` }
}

export function presignUrl(config: S3Config, input: PresignInput): string {
  const now = input.now ?? new Date()
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const day = amzDate.slice(0, 8)
  const scope = `${day}/${config.region}/s3/aws4_request`
  const { origin, host, path } = objectLocation(config, input.key)
  const query: [string, string][] = [
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', `${config.accessKeyId}/${scope}`],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', String(Math.max(1, Math.min(604_800, Math.round(input.expiresSeconds))))],
    ['X-Amz-SignedHeaders', 'host'],
  ]
  const canonicalQuery = query.map(([k, v]) => `${encode(k)}=${encode(v)}`).sort().join('&')
  const canonicalRequest = [input.method, path, canonicalQuery, `host:${host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n')
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonicalRequest)].join('\n')
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${config.secretAccessKey}`, day), config.region), 's3'), 'aws4_request')
  const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex')
  return `${origin}${path}?${canonicalQuery}&X-Amz-Signature=${signature}`
}
