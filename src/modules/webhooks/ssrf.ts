import { isIP } from 'node:net'

/**
 * SSRF guard for outbound webhooks: http(s) only, no credentials in the URL,
 * and never a private, loopback, link-local, CGNAT, multicast or reserved
 * address, nor an IPv6 form that wraps or translates IPv4 (mapped,
 * translated, NAT64 and Teredo), whether written as an IP or reached
 * through DNS. The delivery
 * checks the address it actually connects to (http.ts), so a DNS answer that
 * changes after saving cannot reach the internal network. Pure.
 */

const V4_BLOCKS: readonly [string, number][] = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4], ['255.255.255.255', 32],
]

const v4ToInt = (ip: string) => ip.split('.').reduce((n, part) => (n << 8) + Number(part), 0) >>> 0

function inV4Block(ip: string, [base, bits]: [string, number]): boolean {
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0
  return (v4ToInt(ip) & mask) === (v4ToInt(base) & mask)
}

/** Expands "::" and returns the 8 hextets of an IPv6 address. */
function hextets(ip: string): number[] {
  const [head, tail] = ip.split('::')
  const parse = (s: string) => (s ? s.split(':') : [])
  let parts = [...parse(head)]
  const back = parse(tail ?? '')
  const last = back.length ? back[back.length - 1] : parts[parts.length - 1]
  // An embedded IPv4 tail (::ffff:10.0.0.1) counts as two hextets.
  const embedded = last && last.includes('.') ? last : null
  const v4Words = embedded ? [v4ToInt(embedded) >>> 16, v4ToInt(embedded) & 0xffff].map((n) => n.toString(16)) : []
  if (embedded) {
    if (back.length) back.splice(back.length - 1, 1, ...v4Words)
    else parts = [...parts.slice(0, -1), ...v4Words]
  }
  const fill = tail !== undefined ? new Array(8 - parts.length - back.length).fill('0') : []
  return [...parts, ...fill, ...back].map((h) => parseInt(h || '0', 16))
}

export function isBlockedAddress(ip: string): boolean {
  const kind = isIP(ip)
  if (kind === 4) return V4_BLOCKS.some((b) => inV4Block(ip, b))
  if (kind !== 6) return true
  const h = hextets(ip.toLowerCase().replace(/%.*$/, ''))
  if (h.length !== 8) return true
  if (h.every((x) => x === 0)) return true // ::
  if (h.slice(0, 7).every((x) => x === 0) && h[7] === 1) return true // ::1
  // Every IPv6 form that carries or translates to an IPv4 address is refused outright: a webhook
  // or GSP endpoint never needs one, and NAT64 or a mapped socket could reach the private network.
  if (h.slice(0, 5).every((x) => x === 0) && h[5] === 0xffff) return true // ::ffff:0:0/96 IPv4-mapped
  if (h.slice(0, 4).every((x) => x === 0) && h[4] === 0xffff && h[5] === 0) return true // ::ffff:0:0:0/96 IPv4-translated
  if (h.slice(0, 6).every((x) => x === 0)) return true // ::a.b.c.d (deprecated)
  if (h[0] === 0x64 && h[1] === 0xff9b && h.slice(2, 6).every((x) => x === 0)) return true // 64:ff9b::/96 NAT64
  if (h[0] === 0x64 && h[1] === 0xff9b && h[2] === 0x0001) return true // 64:ff9b:1::/48 local-use NAT64
  if (h[0] === 0x2001 && h[1] === 0x0000) return true // 2001::/32 Teredo
  if ((h[0] & 0xfe00) === 0xfc00) return true // fc00::/7 unique local
  if ((h[0] & 0xffc0) === 0xfe80) return true // fe80::/10 link-local
  if ((h[0] & 0xffc0) === 0xfec0) return true // fec0::/10 site-local
  if ((h[0] & 0xff00) === 0xff00) return true // multicast
  if (h[0] === 0x2001 && h[1] === 0x0db8) return true // documentation
  if (h[0] === 0x2002) return isBlockedAddress(`${h[1] >> 8}.${h[1] & 0xff}.${h[2] >> 8}.${h[2] & 0xff}`) // 6to4
  return false
}

const BLOCKED_HOSTS = /(^|\.)(localhost|local|internal|intranet|lan|home\.arpa|localdomain)$/i

/** Why this URL may not receive webhooks (before DNS), or null. */
export function webhookUrlProblem(raw: string): string | null {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return 'Enter a full URL starting with https://'
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return 'Only http and https URLs can receive webhooks.'
  if (url.username || url.password) return 'Put credentials in the secret, not in the URL.'
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (!host) return 'The URL has no host.'
  if (isIP(host)) return isBlockedAddress(host) ? 'That address is private or reserved. Use a public URL.' : null
  if (BLOCKED_HOSTS.test(host) || !host.includes('.')) return 'That host is not public. Use a public URL.'
  return null
}

export type Resolver = (host: string) => Promise<readonly string[]>

/** Resolves the host and refuses when any address is private (null = safe). */
export async function resolvedProblem(raw: string, resolve: Resolver): Promise<string | null> {
  const first = webhookUrlProblem(raw)
  if (first) return first
  const host = new URL(raw.trim()).hostname.replace(/^\[|\]$/g, '')
  if (isIP(host)) return null
  let addresses: readonly string[]
  try {
    addresses = await resolve(host)
  } catch {
    return 'That host does not resolve. Check the URL.'
  }
  if (!addresses.length) return 'That host does not resolve. Check the URL.'
  return addresses.some(isBlockedAddress) ? 'That host points to a private or reserved address. Use a public URL.' : null
}
