import { FolioEntity } from '@/models/folio/Entity'
import { FolioServiceItem } from '@/models/folio/ServiceItem'
import { FolioSettings } from '@/models/folio/FolioSettings'
import type { FolioDb } from '../context'

const readSettings = (ctx: FolioDb) => ctx.db(FolioSettings).findOne({}).lean()
export type FolioSettingsDoc = NonNullable<Awaited<ReturnType<typeof readSettings>>>

const isDuplicate = (error: unknown) => typeof error === 'object' && error !== null && (error as { code?: number }).code === 11000

/** The org's Folio settings, created with defaults on first read. */
export async function getFolioSettings(ctx: FolioDb): Promise<FolioSettingsDoc> {
  const existing = await readSettings(ctx)
  if (existing) return existing
  try {
    await ctx.db(FolioSettings).create({})
  } catch (error) {
    if (!isDuplicate(error)) throw error
  }
  const created = await readSettings(ctx)
  if (!created) throw new Error('Folio settings could not be created')
  return created
}

/** Allowed GST rates, sorted. */
export const taxRatesOf = (settings: FolioSettingsDoc): number[] => [...(settings.invoicing?.taxRates ?? [0, 5, 12, 18, 28])].sort((a, b) => a - b)

export const listEntities = (ctx: FolioDb) => ctx.db(FolioEntity).find({}).sort({ isDefault: -1, isActive: -1, code: 1 }).lean()

export const listServiceItems = (ctx: FolioDb, opts: { activeOnly?: boolean } = {}) =>
  ctx.db(FolioServiceItem).find(opts.activeOnly ? { isActive: true } : {}).sort({ isActive: -1, name: 1 }).lean()

export const hasAnyEntity = async (ctx: FolioDb): Promise<boolean> => Boolean(await ctx.db(FolioEntity).exists({}))
