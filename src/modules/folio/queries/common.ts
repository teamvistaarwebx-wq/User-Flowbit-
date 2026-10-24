import 'server-only'
import { Types } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { maskAccount } from '@/lib/audit-diff'
import { Client } from '@/models/Client'
import { FolioBillingProfile } from '@/models/folio/BillingProfile'
import { FolioEntity } from '@/models/folio/Entity'
import { clientLabel, entityLabel } from '@/modules/folio/context'
import { pickFirm, type FirmOption } from '@/modules/folio/engine/firm'

export { clientLabel, entityLabel }

/** The slice of a Ctx that Folio's read queries need (the cron passes a system scope). */
export type FolioScope = Pick<Ctx, 'orgId' | 'db'>

/** Invoices that still have money owed on them. */
export const OPEN_INVOICE = { status: { $in: ['issued', 'part_paid'] }, balancePaise: { $gt: 0 } } as const
/** Invoices that count as billed (never drafts or voids). */
export const BILLED_STATUSES = ['issued', 'part_paid', 'paid'] as const

export type EntityInfo = {
  id: string
  code: string
  legalName: string
  tradeName: string | null
  kind: string
  gstin: string | null
  isDefault: boolean
  isActive: boolean
  receiptPrefix: string
  padding: number
  addressLines: string[]
  email: string | null
  phone: string | null
  signatoryName: string | null
  /** Bank accounts with the number masked (never send full numbers to pages). */
  banks: { id: string; label: string; bankName: string; masked: string; ifsc: string; upiId: string | null; isDefault: boolean; last4: string }[]
}

type EntityDoc = Awaited<ReturnType<typeof loadEntities>>[number]

async function loadEntities(scope: FolioScope) {
  return scope.db(FolioEntity).find({}).sort({ isDefault: -1, code: 1 }).lean()
}

function toEntityInfo(e: EntityDoc): EntityInfo {
  const a = e.address
  return {
    id: String(e._id),
    code: e.code,
    legalName: e.legalName,
    tradeName: e.tradeName ?? null,
    kind: e.kind,
    gstin: e.gstin ?? null,
    isDefault: Boolean(e.isDefault),
    isActive: e.isActive !== false,
    receiptPrefix: e.series?.receiptPrefix ?? `${e.code}-RC`,
    padding: e.series?.padding ?? 4,
    addressLines: [a?.line1, a?.line2, [a?.city, a?.pincode].filter(Boolean).join(' ')].filter((l): l is string => Boolean(l)),
    email: e.email ?? null,
    phone: e.phone ?? null,
    signatoryName: e.signatoryName ?? null,
    banks: (e.bankAccounts ?? []).map((b) => ({
      id: String(b._id),
      label: b.label,
      bankName: b.bankName,
      masked: maskAccount(b.accountNumber),
      ifsc: b.ifsc,
      upiId: b.upiId ?? null,
      isDefault: Boolean(b.isDefault),
      last4: b.accountNumber.slice(-4),
    })),
  }
}

export async function listEntities(scope: FolioScope): Promise<EntityInfo[]> {
  return (await loadEntities(scope)).map(toEntityInfo)
}

/** "Vistaar WebX — a brand of Sanskaar Webx Services LLP", or just the legal name. */
export const brandLine = (e: Pick<EntityInfo, 'tradeName' | 'legalName'>) => (e.tradeName && e.tradeName !== e.legalName ? `${e.tradeName} — a brand of ${e.legalName}` : e.legalName)

/** id -> display name for the given clients (org-scoped). */
export async function clientNameMap(scope: FolioScope, ids?: Array<Types.ObjectId | string>): Promise<Map<string, string>> {
  const filter = ids ? { _id: { $in: ids } } : {}
  const rows = await scope.db(Client).find(filter, { name: 1, displayName: 1 }).lean()
  return new Map(rows.map((c) => [String(c._id), clientLabel(c)]))
}

/** The entity that speaks for a client on statements: profile default, else org default, else the first active. */
export async function issuerForClient(scope: FolioScope, clientId: Types.ObjectId | string): Promise<EntityInfo | null> {
  const [entities, profile] = await Promise.all([listEntities(scope), scope.db(FolioBillingProfile).findOne({ clientId }, { defaultEntityId: 1 }).lean()])
  const preferred = profile?.defaultEntityId ? entities.find((e) => e.id === String(profile.defaultEntityId)) : undefined
  return preferred ?? entities.find((e) => e.isDefault && e.isActive) ?? entities.find((e) => e.isActive) ?? entities[0] ?? null
}

export type ProfileSummary = { termsDays: number | null; tds: { on: boolean; section: string | null; percent: number }; creditLimitPaise: number | null; defaultEntityId: string | null; remindersPaused: boolean }

export async function profileSummaries(scope: FolioScope, clientIds?: Array<Types.ObjectId | string>): Promise<Map<string, ProfileSummary>> {
  const rows = await scope.db(FolioBillingProfile).find(clientIds ? { clientId: { $in: clientIds } } : {}).lean()
  return new Map(
    rows.map((p) => [
      String(p.clientId),
      {
        termsDays: p.paymentTermsDays ?? null,
        tds: { on: Boolean(p.tds?.applicable), section: p.tds?.section ?? null, percent: p.tds?.percent ?? 0 },
        creditLimitPaise: p.creditLimitPaise ?? null,
        defaultEntityId: p.defaultEntityId ? String(p.defaultEntityId) : null,
        remindersPaused: Boolean(p.remindersPaused),
      },
    ]),
  )
}

/** `{ entityId }` for a firm-filtered query (aggregate does not cast), or {} for Combined. */
export const entityMatch = (entityId?: string | null): { entityId?: Types.ObjectId } => (entityId && Types.ObjectId.isValid(entityId) ? { entityId: new Types.ObjectId(entityId) } : {})

export type FirmContext = { firms: FirmOption[]; firm: FirmOption | null }

/** The org's firms (billing entities) and the one ?firm= names; firm is null for Combined. */
export async function firmContext(scope: FolioScope, raw: string | null | undefined): Promise<FirmContext> {
  const entities = await scope.db(FolioEntity).find({}, { code: 1, legalName: 1, tradeName: 1 }).sort({ isDefault: -1, code: 1 }).lean()
  const firms = entities.map((e) => ({ id: String(e._id), code: e.code, name: entityLabel(e) }))
  return { firms, firm: pickFirm(firms, raw) }
}
