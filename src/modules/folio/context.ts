import type { Types } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { NotFoundError, UserError } from '@/lib/errors'
import { Client } from '@/models/Client'
import { FolioBillingProfile } from '@/models/folio/BillingProfile'
import { FolioEntity } from '@/models/folio/Entity'
import { DEFAULT_TERMS_DAYS } from './types'

/**
 * Loading the records every Folio flow needs, always through the org-scoped
 * `db` (so a forged id from another workspace is refused). Takes the parts of
 * the ctx it needs, so seed code can call it with a SeedCtx.
 */

export type FolioDb = Pick<Ctx, 'db' | 'orgId'>

export const FOLIO = { product: 'folio' } as const

const findEntity = (ctx: FolioDb, id: unknown) => ctx.db(FolioEntity).findById(id).lean()
const findClient = (ctx: FolioDb, id: unknown) => ctx.db(Client).findById(id).lean()
const findProfile = (ctx: FolioDb, clientId: unknown) => ctx.db(FolioBillingProfile).findOne({ clientId }).lean()

export type EntityDoc = NonNullable<Awaited<ReturnType<typeof findEntity>>>
export type ClientDoc = NonNullable<Awaited<ReturnType<typeof findClient>>>
export type ProfileDoc = NonNullable<Awaited<ReturnType<typeof findProfile>>>

/** An entity of this org; `active` refuses a deactivated one. */
export async function loadEntity(ctx: FolioDb, id: unknown, opts: { active?: boolean } = {}): Promise<EntityDoc> {
  const entity = await findEntity(ctx, id)
  if (!entity) throw new NotFoundError('That firm')
  if (opts.active && !entity.isActive) throw new UserError(`${entity.code} is switched off. Turn it back on in Folio settings, or bill from another entity.`)
  return entity
}

/** A client of this org; `active` refuses leads and inactive clients. */
export async function loadClient(ctx: FolioDb, id: unknown, opts: { active?: boolean } = {}): Promise<ClientDoc> {
  const client = await findClient(ctx, id)
  if (!client) throw new NotFoundError('That client')
  if (opts.active && client.status !== 'active') throw new UserError(`${client.name} is not an active client. Mark them active on the client page first.`)
  return client
}

export const loadProfile = (ctx: FolioDb, clientId: unknown): Promise<ProfileDoc | null> => findProfile(ctx, clientId)

export const activeEntities = (ctx: FolioDb) => ctx.db(FolioEntity).find({ isActive: true }).sort({ isDefault: -1, kind: 1, code: 1 }).lean()

/** The entity a client's documents default to: profile default, org default, first active. */
export async function defaultEntityId(ctx: FolioDb, profile?: { defaultEntityId?: Types.ObjectId | string | null } | null): Promise<Types.ObjectId | null> {
  if (profile?.defaultEntityId) {
    const own = await ctx.db(FolioEntity).findOne({ _id: profile.defaultEntityId, isActive: true }, { _id: 1 }).lean()
    if (own) return own._id
  }
  const fallback = await ctx.db(FolioEntity).findOne({ isActive: true }, { _id: 1 }).sort({ isDefault: -1, kind: 1, code: 1 }).lean()
  return fallback?._id ?? null
}

/** Payment terms: the document's own, else the profile's, else the entity default. */
export const termsFor = (own: number | null | undefined, profile: ProfileDoc | null, entity: Pick<EntityDoc, 'defaults'>): number =>
  own ?? profile?.paymentTermsDays ?? entity.defaults?.paymentTermsDays ?? DEFAULT_TERMS_DAYS

/** TDS % the client deducts (0 when the profile has TDS off). */
export const tdsPercentFor = (profile: ProfileDoc | null): number => (profile?.tds?.applicable ? (profile.tds.percent ?? 0) : 0)

/** Bank account number shown anywhere but Settings and the PDF: XXXXXXXX5432. */
export function maskAccount(value: string | null | undefined): string {
  const digits = (value ?? '').replace(/\s+/g, '')
  if (digits.length <= 4) return digits
  return `${'X'.repeat(Math.min(digits.length - 4, 8))}${digits.slice(-4)}`
}

export const entityLabel = (entity: Pick<EntityDoc, 'tradeName' | 'legalName'>): string => entity.tradeName || entity.legalName
export const clientLabel = (client: Pick<ClientDoc, 'displayName' | 'name'>): string => client.displayName || client.name
