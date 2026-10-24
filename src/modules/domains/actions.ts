'use server'

import { promises as dns } from 'node:dns'
import { revalidatePath } from 'next/cache'
import type { Types } from 'mongoose'
import { z } from 'zod'
import { action, fail, ok } from '@/lib/actions'
import { audit } from '@/lib/audit'
import { appUrl, serverEnv } from '@/lib/env'
import { CustomDomain } from '@/models/integrations/CustomDomain'
import { checkCname } from './dns-check'
import { DomainProviderError } from './resend-domains'
import { isFlowbitDomain, isSubdomain, normalizeDomain, type DomainKind } from './rules'
import { forgetPortalHost } from './portal-host'
import { liveDomainsProvider } from './store'
import { addVercelDomain, vercelDomainsOn } from './vercel'

const OPTS = { perm: 'org.manage', feature: 'domains' } as const
const PAGE = '/app/settings/domains'

const domainField = z.string().trim().min(3, 'Enter a domain').max(253)
const isDuplicate = (error: unknown) => (error as { code?: number } | null)?.code === 11000

/** Another workspace already verified this host (pending rows elsewhere never block: they claim nothing). Cross-workspace by design. */
const hostVerifiedElsewhere = async (orgId: Types.ObjectId, kind: DomainKind, domain: string) =>
  Boolean(await CustomDomain.exists({ kind, domain, status: 'verified', orgId: { $ne: orgId } }))

/** Flowbit's own hosts: the app, the Console and the portal CNAME target. */
function ownDomains(): string[] {
  const env = serverEnv()
  const host = (value: string) => normalizeDomain(value) ?? ''
  const app = host(appUrl('/'))
  const apex = app.split('.').slice(-2).join('.')
  return [app, apex, host(env.CONSOLE_HOST ?? ''), host(env.PORTAL_CNAME_TARGET)].filter(Boolean)
}

function parseDomain(raw: string): { domain: string } | { error: string } {
  const domain = normalizeDomain(raw)
  if (!domain) return { error: 'Enter a domain like brightfoods.in, without https:// or a path.' }
  if (isFlowbitDomain(domain, ownDomains())) return { error: 'That is a Flowbit domain. Use one your business owns.' }
  return { domain }
}

const providerError = (error: unknown) => {
  if (error instanceof DomainProviderError) return fail(`Resend said: ${error.message}`)
  throw error
}

/** Adds the sending domain at Resend and stores the DNS records to publish. */
export const addSendingDomain = action(
  z.object({ domain: domainField }),
  async (input, ctx) => {
    const parsed = parseDomain(input.domain)
    if ('error' in parsed) return fail(parsed.error, { domain: parsed.error })
    if (await ctx.db(CustomDomain).exists({ kind: 'sending' })) return fail('This workspace already has a sending domain. Remove it first to use another.')
    if (await hostVerifiedElsewhere(ctx.orgId, 'sending', parsed.domain)) return fail('That domain is already used by a workspace.')
    const provider = liveDomainsProvider()
    if (!provider) return fail('Email is not set up on this Flowbit server (RESEND_API_KEY), so a sending domain cannot be added yet.')
    try {
      const created = await provider.create(parsed.domain)
      await ctx.db(CustomDomain).create({ kind: 'sending', domain: parsed.domain, providerId: created.id, records: created.records, status: created.status === 'verified' ? 'verified' : 'pending', createdBy: ctx.userId, ...(created.status === 'verified' ? { verifiedAt: new Date() } : {}) })
    } catch (error) {
      if (isDuplicate(error)) return fail('That domain is already used by a workspace.')
      return providerError(error)
    }
    await audit(ctx, { action: 'domains.sending_added', entity: 'Org', entityId: ctx.orgId, summary: `Added sending domain ${parsed.domain}`, product: 'settings', meta: { domain: parsed.domain } })
    revalidatePath(PAGE)
    return ok(`Added. Publish the DNS records below at your domain registrar, then press Verify.`)
  },
  OPTS,
)

/** Asks Resend to check the records and stores the result. */
export const verifySendingDomain = action(
  z.object({}),
  async (_input, ctx) => {
    const row = await ctx.db(CustomDomain).findOne({ kind: 'sending' }).lean()
    if (!row?.providerId) return fail('Add a sending domain first.')
    const provider = liveDomainsProvider()
    if (!provider) return fail('Email is not set up on this Flowbit server (RESEND_API_KEY).')
    try {
      await provider.verify(row.providerId)
      const latest = await provider.get(row.providerId)
      const verified = latest.status === 'verified'
      if (verified && (await hostVerifiedElsewhere(ctx.orgId, 'sending', row.domain))) return fail('That domain is already used by another workspace.')
      await ctx.db(CustomDomain).updateOne({ _id: row._id }, { $set: { status: verified ? 'verified' : latest.status === 'failed' ? 'failed' : 'pending', records: latest.records, lastCheckedAt: new Date(), ...(verified && !row.verifiedAt ? { verifiedAt: new Date() } : {}) } })
      if (verified && row.status !== 'verified') await audit(ctx, { action: 'domains.sending_verified', entity: 'Org', entityId: ctx.orgId, summary: `Sending domain ${row.domain} verified`, product: 'settings' })
      revalidatePath(PAGE)
      return verified ? ok(`${row.domain} is verified. Invoices, quotes, statements, reminders and portal mail now go from billing@${row.domain}.`) : ok('Not verified yet. DNS changes can take up to an hour; Resend keeps checking, so press Verify again later.')
    } catch (error) {
      return providerError(error)
    }
  },
  OPTS,
)

/** Records the portal host (a subdomain) the workspace will CNAME to Flowbit. */
export const setPortalDomain = action(
  z.object({ domain: domainField }),
  async (input, ctx) => {
    const parsed = parseDomain(input.domain)
    if ('error' in parsed) return fail(parsed.error, { domain: parsed.error })
    if (!isSubdomain(parsed.domain)) return fail('Use a subdomain such as portal.brightfoods.in: a bare domain cannot be a CNAME.', { domain: 'Use a subdomain' })
    if (await hostVerifiedElsewhere(ctx.orgId, 'portal', parsed.domain)) return fail('That host is already used by another workspace.')
    const current = await ctx.db(CustomDomain).findOne({ kind: 'portal' }).lean()
    try {
      if (current) {
        await ctx.db(CustomDomain).updateOne({ _id: current._id }, { $set: { domain: parsed.domain, status: 'pending', lastError: null, vercelAdded: false }, $unset: { verifiedAt: 1 } })
        forgetPortalHost(current.domain)
      } else {
        await ctx.db(CustomDomain).create({ kind: 'portal', domain: parsed.domain, status: 'pending', createdBy: ctx.userId })
      }
    } catch (error) {
      if (isDuplicate(error)) return fail('That host is already used by another workspace.')
      throw error
    }
    await audit(ctx, { action: 'domains.portal_set', entity: 'Org', entityId: ctx.orgId, summary: `Portal domain set to ${parsed.domain}`, product: 'settings', meta: { domain: parsed.domain } })
    revalidatePath(PAGE)
    return ok(`Saved. Add a CNAME for ${parsed.domain} pointing to ${serverEnv().PORTAL_CNAME_TARGET}, then press Verify.`)
  },
  OPTS,
)

/** Looks up the CNAME; on a match the host starts serving this workspace's portal (and is added to Vercel when that is switched on). */
export const verifyPortalDomain = action(
  z.object({}),
  async (_input, ctx) => {
    const row = await ctx.db(CustomDomain).findOne({ kind: 'portal' }).lean()
    if (!row) return fail('Set a portal domain first.')
    const target = serverEnv().PORTAL_CNAME_TARGET
    const check = await checkCname(row.domain, target, (host) => dns.resolveCname(host))
    if (!check.ok) {
      await ctx.db(CustomDomain).updateOne({ _id: row._id }, { $set: { status: 'failed', lastError: check.reason, lastCheckedAt: new Date() } })
      revalidatePath(PAGE)
      return fail(check.reason)
    }
    if (await hostVerifiedElsewhere(ctx.orgId, 'portal', row.domain)) return fail('That host is already used by another workspace.')
    try {
      await ctx.db(CustomDomain).updateOne({ _id: row._id }, { $set: { status: 'verified', lastError: null, lastCheckedAt: new Date(), verifiedAt: row.verifiedAt ?? new Date() } })
    } catch (error) {
      // Two workspaces verifying one host at once: the unique index on verified hosts lets one win.
      if (isDuplicate(error)) return fail('That host is already used by another workspace.')
      throw error
    }
    const vercel = vercelDomainsOn() && !row.vercelAdded ? await addVercelDomain(row.domain) : null
    if (vercel) await ctx.db(CustomDomain).updateOne({ _id: row._id }, { $set: { lastError: vercel.ok ? null : `Vercel: ${vercel.error}`, ...(vercel.ok ? { vercelAdded: true } : {}) } })
    forgetPortalHost(row.domain)
    await audit(ctx, { action: 'domains.portal_verified', entity: 'Org', entityId: ctx.orgId, summary: `Portal domain ${row.domain} verified`, product: 'settings' })
    revalidatePath(PAGE)
    return ok(`${row.domain} points to Flowbit.${vercelDomainsOn() ? '' : ' Flowbit support adds it to the hosting project to issue the HTTPS certificate; until then it may show a certificate warning.'}`)
  },
  OPTS,
)

/** Removes a domain; client mail and the portal fall back to Flowbit's defaults at once. */
export const removeDomain = action(
  z.object({ kind: z.enum(['sending', 'portal']) }),
  async ({ kind }, ctx) => {
    const row = await ctx.db(CustomDomain).findOne({ kind }).lean()
    if (!row) return fail('There is nothing to remove.')
    if (kind === 'sending' && row.providerId) {
      try {
        await liveDomainsProvider()?.remove(row.providerId)
      } catch (error) {
        console.error('[domains] Resend domain removal failed; removing locally', error)
      }
    }
    await ctx.db(CustomDomain).deleteOne({ _id: row._id })
    if (kind === 'portal') forgetPortalHost(row.domain)
    await audit(ctx, { action: `domains.${kind as DomainKind}_removed`, entity: 'Org', entityId: ctx.orgId, summary: `Removed ${kind} domain ${row.domain}`, product: 'settings' })
    revalidatePath(PAGE)
    return ok(kind === 'sending' ? 'Removed. Client mail goes from Flowbit\'s address again.' : 'Removed. The portal is served from Flowbit\'s address again.')
  },
  OPTS,
)
