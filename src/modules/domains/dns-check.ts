import { cnameMatches, normalizeDomain } from './rules'

/**
 * Checks a portal host's CNAME (node:dns, injected for tests). Only a
 * validated public domain name is ever looked up, with a time limit; the
 * answer is compared, never followed or fetched.
 */

export type CnameResolver = (host: string) => Promise<string[]>

const TIMEOUT_MS = 5000

export type CnameCheck = { ok: true } | { ok: false; reason: string }

export async function checkCname(host: string, target: string, resolve: CnameResolver): Promise<CnameCheck> {
  const domain = normalizeDomain(host)
  if (!domain) return { ok: false, reason: 'That is not a valid domain name.' }
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const records = await Promise.race([
      resolve(domain),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS)
      }),
    ])
    return cnameMatches(records, target) ? { ok: true } : { ok: false, reason: `${domain} points to ${records.join(', ') || 'nothing'}, not ${target}. Update the CNAME and check again.` }
  } catch (error) {
    const code = (error as { code?: string }).code
    if (code === 'ENODATA' || code === 'ENOTFOUND') return { ok: false, reason: `No CNAME record found for ${domain} yet. DNS changes can take up to an hour.` }
    return { ok: false, reason: (error as Error).message === 'timeout' ? 'The DNS lookup timed out. Try again in a minute.' : `The DNS lookup failed (${code ?? 'error'}). Try again in a minute.` }
  } finally {
    if (timer) clearTimeout(timer)
  }
}
