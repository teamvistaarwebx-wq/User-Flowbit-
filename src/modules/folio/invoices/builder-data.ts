import 'server-only'
import type { Ctx } from '@/lib/ctx'
import { Client } from '@/models/Client'
import { FolioBillingProfile } from '@/models/folio/BillingProfile'
import { Invoice } from '@/models/folio/Invoice'
import { activeEntities, maskAccount, tdsPercentFor } from '../context'
import { clientIsRegistered, clientStateCode } from '../engine/gst'
import { getFolioSettings, listServiceItems, taxRatesOf } from '../settings/queries'
import { DEFAULT_TERMS_DAYS } from '../types'

/**
 * Everything the document builder needs to price live in the browser, as
 * plain JSON. Bank accounts go out masked.
 */

export type BuilderEntity = {
  id: string
  code: string
  name: string
  kind: 'gst' | 'non_gst'
  stateCode: string
  paymentTermsDays: number
  gstRatePercent: number
  notes: string
  terms: string
  isDefault: boolean
  banks: { id: string; label: string; isDefault: boolean }[]
}

export type BuilderClient = {
  id: string
  name: string
  stateCode: string | null
  registered: boolean
  isExport: boolean
  defaultEntityId: string | null
  paymentTermsDays: number | null
  gstRatePercent: number | null
  tdsPercent: number
  creditLimitPaise: number | null
  outstandingPaise: number
}

export type BuilderService = { id: string; code: string; name: string; description: string; hsnSac: string; unit: string; ratePaise: number; gstRatePercent: number }

export type BuilderOptions = { entities: BuilderEntity[]; clients: BuilderClient[]; services: BuilderService[]; taxRates: number[]; roundOffTotal: boolean; validityDays: number }

export async function builderOptions(ctx: Ctx, opts: { includeClientId?: string } = {}): Promise<BuilderOptions> {
  const [entities, clients, profiles, services, settings, balances] = await Promise.all([
    activeEntities(ctx),
    ctx.db(Client).find(opts.includeClientId ? { $or: [{ status: 'active' }, { _id: opts.includeClientId }] } : { status: 'active' }).sort({ name: 1 }).lean(),
    ctx.db(FolioBillingProfile).find({}).lean(),
    listServiceItems(ctx, { activeOnly: true }),
    getFolioSettings(ctx),
    ctx.db(Invoice).aggregate<{ _id: unknown; n: number }>([{ $match: { status: { $in: ['issued', 'part_paid'] } } }, { $group: { _id: '$clientId', n: { $sum: '$balancePaise' } } }]),
  ])
  const profileOf = new Map(profiles.map((p) => [String(p.clientId), p]))
  const owed = new Map(balances.map((b) => [String(b._id), b.n]))
  return {
    taxRates: taxRatesOf(settings),
    roundOffTotal: settings.invoicing?.roundOffTotal !== false,
    validityDays: settings.invoicing?.defaultValidityDays ?? 15,
    entities: entities.map((e) => ({
      id: String(e._id),
      code: e.code,
      name: e.tradeName || e.legalName,
      kind: e.kind,
      stateCode: e.address.stateCode,
      paymentTermsDays: e.defaults?.paymentTermsDays ?? DEFAULT_TERMS_DAYS,
      gstRatePercent: e.defaults?.gstRatePercent ?? 18,
      notes: e.defaults?.notes ?? '',
      terms: e.defaults?.terms ?? '',
      isDefault: e.isDefault,
      banks: e.bankAccounts.map((b) => ({ id: String(b._id), label: `${b.label} · ${b.bankName} ${maskAccount(b.accountNumber)}`, isDefault: b.isDefault })),
    })),
    clients: clients.map((c) => {
      const profile = profileOf.get(String(c._id)) ?? null
      return {
        id: String(c._id),
        name: c.name,
        stateCode: clientStateCode(c, profile),
        registered: clientIsRegistered(c),
        isExport: Boolean(profile?.isExportClient) || Boolean(c.billingAddress?.country && c.billingAddress.country.toLowerCase() !== 'india'),
        defaultEntityId: profile?.defaultEntityId ? String(profile.defaultEntityId) : null,
        paymentTermsDays: profile?.paymentTermsDays ?? null,
        gstRatePercent: profile?.defaultGstRatePercent ?? null,
        tdsPercent: tdsPercentFor(profile),
        creditLimitPaise: profile?.creditLimitPaise ?? null,
        outstandingPaise: owed.get(String(c._id)) ?? 0,
      }
    }),
    services: services.map((s) => ({ id: String(s._id), code: s.code, name: s.name, description: s.description ?? '', hsnSac: s.hsnSac ?? '', unit: s.unit ?? 'nos', ratePaise: s.defaultRatePaise, gstRatePercent: s.defaultGstRatePercent })),
  }
}
