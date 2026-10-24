import 'server-only'
import type { Types } from 'mongoose'
import { Resend } from 'resend'
import { hasAddOn } from '@/lib/addons'
import { dbConnect } from '@/lib/db'
import { serverEnv } from '@/lib/env'
import { CustomDomain } from '@/models/integrations/CustomDomain'
import { Org } from '@/models/Org'
import { resendDomains, type DomainsProvider, type ResendDomainsLike } from './resend-domains'
import { CLIENT_MAIL_KINDS, sendingFrom } from './rules'

/** Resend's Domains API with the server key, or null when RESEND_API_KEY is unset. */
export function liveDomainsProvider(): DomainsProvider | null {
  const key = serverEnv().RESEND_API_KEY
  return key ? resendDomains(new Resend(key) as unknown as ResendDomainsLike) : null
}

/**
 * The From line for a workspace's client-facing mail: billing@<their verified
 * sending domain> while the add-on is on, else null (Flowbit's default From).
 * Never throws: a lookup problem falls back to the default sender.
 */
export async function clientMailFrom(orgId: Types.ObjectId | string | undefined, kind: string): Promise<string | null> {
  if (!orgId || !CLIENT_MAIL_KINDS.has(kind)) return null
  try {
    await dbConnect()
    const domain = await CustomDomain.findOne({ orgId, kind: 'sending', status: 'verified' }, { domain: 1 }).lean()
    if (!domain) return null
    const org = await Org.findById(orgId).lean()
    return org && hasAddOn(org, 'domains') ? sendingFrom(org.name, domain.domain) : null
  } catch (error) {
    console.error('[domains] sending domain lookup failed; using the default sender', error)
    return null
  }
}
