import { UserError } from '@/lib/errors'
import { FolioServiceItem } from '@/models/folio/ServiceItem'
import { loadClient, loadEntity, loadProfile, tdsPercentFor, type ClientDoc, type EntityDoc, type FolioDb, type ProfileDoc } from '../context'
import { clientStateCode } from '../engine/gst'
import { toPaise } from '../engine/money'
import { getFolioSettings, taxRatesOf, type FolioSettingsDoc } from '../settings/queries'
import type { SupplyMode } from '../types'
import { priceDocument, type DraftLine, type PricedDocument } from './pricing'
import type { LineInputRaw } from './schemas'

/**
 * Loads everything a document needs (entity, client, profile, settings),
 * validates the lines against this org, and prices it on the server.
 */

export type DocumentFormBase = {
  entityId: string
  clientId: string
  placeOfSupplyStateCode?: string
  supplyMode: SupplyMode
  lines: LineInputRaw[]
  discountType: 'none' | 'percent' | 'amount'
  discountValue: number
}

export type BuiltDocument = { entity: EntityDoc; client: ClientDoc; profile: ProfileDoc | null; settings: FolioSettingsDoc; priced: PricedDocument }

async function assertServiceItems(ctx: FolioDb, lines: LineInputRaw[]): Promise<void> {
  const ids = [...new Set(lines.map((l) => l.serviceItemId).filter((id): id is string => Boolean(id)))]
  if (!ids.length) return
  const found = await ctx.db(FolioServiceItem).countDocuments({ _id: { $in: ids } })
  if (found !== ids.length) throw new UserError('One of the service items is not in this workspace. Pick it again.')
}

function assertRates(lines: LineInputRaw[], allowed: number[], isTax: boolean): void {
  if (!isTax) return
  const fieldErrors: Record<string, string> = {}
  lines.forEach((l, i) => {
    if (!allowed.includes(l.gstRatePercent)) fieldErrors[`lines.${i}.gstRatePercent`] = `Use one of ${allowed.join(', ')}%`
  })
  if (Object.keys(fieldErrors).length) throw new UserError('Some fields need attention.', fieldErrors)
}

export const toDraftLines = (lines: LineInputRaw[], isTax: boolean): DraftLine[] =>
  lines.map((l) => ({ serviceItemId: l.serviceItemId ?? null, description: l.description, hsnSac: l.hsnSac ?? null, quantity: l.quantity, unit: l.unit, ratePaise: toPaise(l.rate), discountPercent: l.discountPercent, gstRatePercent: isTax ? l.gstRatePercent : 0 }))

export async function buildDocument(ctx: FolioDb, input: DocumentFormBase, opts: { tdsPercent?: number; activeClient?: boolean; reverseCharge?: boolean } = {}): Promise<BuiltDocument> {
  const entity = await loadEntity(ctx, input.entityId, { active: true })
  const client = await loadClient(ctx, input.clientId, { active: opts.activeClient ?? true })
  const [profile, settings] = await Promise.all([loadProfile(ctx, client._id), getFolioSettings(ctx)])
  const isTax = entity.kind === 'gst'
  assertRates(input.lines, taxRatesOf(settings), isTax)
  await assertServiceItems(ctx, input.lines)
  const discountType = input.discountType === 'none' ? null : input.discountType
  const priced = priceDocument({
    entityKind: entity.kind,
    entityStateCode: entity.address.stateCode,
    clientStateCode: clientStateCode(client, profile),
    placeOfSupplyStateCode: isTax ? input.placeOfSupplyStateCode : null,
    supplyMode: isTax ? input.supplyMode : 'auto',
    lines: toDraftLines(input.lines, isTax),
    discountType,
    discountValue: discountType === 'amount' ? toPaise(input.discountValue) : input.discountValue,
    tdsPercent: opts.tdsPercent ?? tdsPercentFor(profile),
    roundOffTotal: settings.invoicing?.roundOffTotal !== false,
    reverseCharge: isTax && Boolean(opts.reverseCharge),
  })
  return { entity, client, profile, settings, priced }
}

type StoredLine = { serviceItemId?: unknown; description: string; hsnSac?: string | null; quantity: number; unit?: string | null; ratePaise: number; discountPercent: number; gstRatePercent: number }
type StoredPricing = { supplyType: string; discountType?: 'percent' | 'amount' | null; discountValue: number; lines: StoredLine[]; placeOfSupplyStateCode?: string | null }

/** The form-shaped content of a stored invoice or quote (rates back in rupees), for duplicate, convert and edit. */
export function formContentOf(doc: StoredPricing): Pick<DocumentFormBase, 'lines' | 'discountType' | 'discountValue' | 'supplyMode' | 'placeOfSupplyStateCode'> {
  return {
    placeOfSupplyStateCode: doc.placeOfSupplyStateCode ?? undefined,
    supplyMode: doc.supplyType === 'export' ? 'export' : doc.supplyType === 'sez' ? 'sez' : 'auto',
    lines: doc.lines.map((l) => ({ serviceItemId: l.serviceItemId ? String(l.serviceItemId) : undefined, description: l.description, hsnSac: l.hsnSac ?? undefined, quantity: l.quantity, unit: l.unit ?? 'nos', rate: l.ratePaise / 100, discountPercent: l.discountPercent, gstRatePercent: l.gstRatePercent })),
    discountType: doc.discountType ?? 'none',
    discountValue: doc.discountType === 'amount' ? doc.discountValue / 100 : doc.discountValue,
  }
}
