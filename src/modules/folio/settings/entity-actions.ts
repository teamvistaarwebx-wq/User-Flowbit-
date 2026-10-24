'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, fail, ok } from '@/lib/actions'
import { audit } from '@/lib/audit'
import { maskAccount as maskForAudit } from '@/lib/audit-diff'
import type { Ctx } from '@/lib/ctx'
import { NotFoundError } from '@/lib/errors'
import { objectId } from '@/lib/validation'
import { assertFirmCapacity } from '@/modules/subscription/firms'
import { FolioEntity } from '@/models/folio/Entity'
import { Invoice } from '@/models/folio/Invoice'
import { FOLIO, loadEntity } from '../context'
import { defaultSeries } from '../counter'
import { saveEntityImage } from './entity-image'
import { bankAccountSchema, entitySchema, seriesSchema, signatorySchema, termsSchema } from './schemas'

/** Entities, their bank accounts, number series, default terms and signatory. */

const S = { ...FOLIO, perm: 'folio.settings' } as const
const SIGNATURE_MAX_BYTES = 2 * 1024 * 1024
const refresh = () => {
  revalidatePath('/app/folio/settings')
  revalidatePath('/app/folio')
}

/** The hydrated entity (saving it runs the model's GSTIN and bank checks). */
async function entityDoc(ctx: Ctx, id: string) {
  const doc = await ctx.db(FolioEntity).findOne({ _id: id })
  if (!doc) throw new NotFoundError('That firm')
  return doc
}

const hasIssued = async (ctx: Ctx, entityId: unknown) => Boolean(await ctx.db(Invoice).exists({ entityId, status: { $ne: 'draft' } }))

export const saveEntity = action(
  entitySchema,
  async (input, ctx) => {
    const clash = await ctx.db(FolioEntity).findOne({ code: input.code, ...(input.id ? { _id: { $ne: input.id } } : {}) }, { _id: 1 }).lean()
    if (clash) return fail('Some fields need attention.', { code: 'That code is already in use.' })
    const existing = input.id ? await loadEntity(ctx, input.id) : null
    if (!existing) {
      // A new firm's series starts from its code: refuse it when another firm's (custom) series already uses one of those prefixes.
      const d = defaultSeries(input.code)
      const prefixes: string[] = [d.invoicePrefix, d.creditNotePrefix, d.receiptPrefix, d.quotePrefix, d.proformaPrefix]
      const others = await ctx.db(FolioEntity).find({}, { code: 1, series: 1 }).lean()
      const taken = others.find((o) => Object.values(o.series ?? {}).some((p) => typeof p === 'string' && prefixes.includes(p)))
      if (taken) return fail('Some fields need attention.', { code: `${taken.code}'s number series already uses this prefix. Pick another code.` })
    }
    if (existing && existing.kind !== input.kind && (await hasIssued(ctx, existing._id))) return fail('Some fields need attention.', { kind: 'This decides Tax Invoice vs Sale Invoice and cannot change once documents exist.' })
    // A new firm, or reactivating one, counts against the plan's firm limit.
    const isActivating = !existing || (!existing.isActive && input.isActive)
    if (isActivating) await assertFirmCapacity(ctx)
    const logo = await saveEntityImage(ctx, input.logo, { kind: 'folio_logo', entityId: existing?._id, field: 'logo', label: 'The logo' })
    const fields = {
      code: input.code, legalName: input.legalName, tradeName: input.tradeName, kind: input.kind, gstin: input.kind === 'gst' ? input.gstin : undefined, pan: input.pan, cinLlpin: input.cinLlpin,
      address: { ...input.address, country: 'India' }, email: input.email, phone: input.phone, website: input.website, isActive: input.isActive || !existing, isDefault: input.isDefault,
      ...(logo ? { logoFileId: logo._id } : input.removeLogo ? { logoFileId: null } : {}),
    }
    const count = await ctx.db(FolioEntity).countDocuments({})
    const makeDefault = input.isDefault || count === 0 || (existing?.isDefault ?? false)
    let id = existing?._id
    if (existing) {
      const doc = await entityDoc(ctx, String(existing._id))
      doc.set({ ...fields, isDefault: makeDefault, ...(input.kind === 'gst' ? {} : { gstin: undefined }) })
      await doc.save()
    } else {
      const created = await ctx.db(FolioEntity).create({ ...fields, isDefault: makeDefault, series: defaultSeries(input.code), defaults: { paymentTermsDays: 15, gstRatePercent: input.kind === 'gst' ? 18 : 0 }, bankAccounts: [] })
      id = created._id
    }
    if (makeDefault) await ctx.db(FolioEntity).updateMany({ _id: { $ne: id } }, { $set: { isDefault: false } })
    await audit(ctx, { action: existing ? 'folio_entity.updated' : 'folio_entity.created', entity: 'FolioEntity', entityId: id, summary: `${existing ? 'Updated' : 'Added'} firm ${input.code} ${input.legalName}`, product: 'folio', changes: existing ? { before: existing, after: { ...existing, ...fields } } : undefined })
    refresh()
    return ok(existing ? `${input.code} saved` : `${input.code} added. Add a bank account next, so invoices say where to pay.`, { id: String(id) })
  },
  S,
)

export const saveBankAccount = action(
  bankAccountSchema,
  async (input, ctx) => {
    const { entityId, id, ...account } = input
    const entity = await loadEntity(ctx, entityId)
    const doc = await entityDoc(ctx, String(entity._id))
    const before = id ? doc.bankAccounts.find((b) => String(b._id) === id) : undefined
    if (id && !before) return fail('That bank account was not found.')
    const makeDefault = account.isDefault || doc.bankAccounts.length === 0
    const next = doc.bankAccounts.map((b) => (String(b._id) === id ? { ...b.toObject(), ...account, isDefault: makeDefault } : { ...b.toObject(), isDefault: makeDefault ? false : b.isDefault }))
    doc.set('bankAccounts', id ? next : [...next, { ...account, isDefault: makeDefault }])
    await doc.save()
    await audit(ctx, {
      action: 'folio_entity.bank_changed', entity: 'FolioEntity', entityId: entity._id, product: 'folio',
      summary: `Bank details changed on ${entity.code}: ${account.label} (${account.bankName} ${maskForAudit(account.accountNumber)})`,
      meta: { before: before ? { label: before.label, accountNumber: maskForAudit(before.accountNumber), ifsc: before.ifsc } : null, after: { label: account.label, accountNumber: maskForAudit(account.accountNumber), ifsc: account.ifsc } },
    })
    refresh()
    return ok(`Bank account "${account.label}" saved on ${entity.code}`)
  },
  S,
)

export const deleteBankAccount = action(
  z.object({ entityId: objectId, id: objectId }),
  async ({ entityId, id }, ctx) => {
    const entity = await loadEntity(ctx, entityId)
    const doc = await entityDoc(ctx, String(entity._id))
    const gone = doc.bankAccounts.find((b) => String(b._id) === id)
    if (!gone) return fail('That bank account was not found.')
    const rest = doc.bankAccounts.filter((b) => String(b._id) !== id).map((b, i) => ({ ...b.toObject(), isDefault: b.isDefault || (gone.isDefault && i === 0) }))
    doc.set('bankAccounts', rest)
    await doc.save()
    await audit(ctx, { action: 'folio_entity.bank_removed', entity: 'FolioEntity', entityId: entity._id, summary: `Removed bank account ${gone.label} (${maskForAudit(gone.accountNumber)}) from ${entity.code}`, product: 'folio' })
    refresh()
    return ok(`Bank account "${gone.label}" removed. Issued invoices keep the details they printed.`)
  },
  S,
)

export const saveSeries = action(
  seriesSchema,
  async ({ entityId, ...series }, ctx) => {
    const entity = await loadEntity(ctx, entityId)
    const prefixes = [series.invoicePrefix, series.creditNotePrefix, series.receiptPrefix, series.quotePrefix, series.proformaPrefix]
    if (new Set(prefixes).size !== prefixes.length) return fail('Each series needs its own prefix.')
    const others = await ctx.db(FolioEntity).find({ _id: { $ne: entity._id } }, { code: 1, series: 1 }).lean()
    const taken = others.find((o) => Object.values(o.series ?? {}).some((p) => typeof p === 'string' && prefixes.includes(p)))
    if (taken) return fail(`${taken.code} already uses one of these prefixes. Keep prefixes unique so numbers never look alike.`)
    await ctx.db(FolioEntity).updateOne({ _id: entity._id }, { $set: { series } })
    await audit(ctx, { action: 'folio_entity.series_changed', entity: 'FolioEntity', entityId: entity._id, summary: `Changed number series on ${entity.code}`, product: 'folio', changes: { before: entity.series, after: series } })
    refresh()
    return ok(`Series saved for ${entity.code}. Only future numbers change; the sequence continues.`)
  },
  S,
)

export const saveEntityTerms = action(
  termsSchema,
  async ({ entityId, ...defaults }, ctx) => {
    const entity = await loadEntity(ctx, entityId)
    const gstRatePercent = entity.kind === 'gst' ? defaults.gstRatePercent : 0
    await ctx.db(FolioEntity).updateOne({ _id: entity._id }, { $set: { defaults: { ...defaults, gstRatePercent } } })
    await audit(ctx, { action: 'folio_entity.terms_changed', entity: 'FolioEntity', entityId: entity._id, summary: `Changed default terms on ${entity.code}`, product: 'folio' })
    refresh()
    return ok(`Defaults saved for ${entity.code}`)
  },
  S,
)

export const saveSignatory = action(
  signatorySchema,
  async (input, ctx) => {
    const entity = await loadEntity(ctx, input.entityId)
    const file = await saveEntityImage(ctx, input.signature, { kind: 'folio_signature', entityId: entity._id, field: 'signature', label: 'The signature', maxBytes: SIGNATURE_MAX_BYTES })
    const set = { signatoryName: input.signatoryName ?? null, signatoryTitle: input.signatoryTitle ?? null, ...(file ? { signatureFileId: file._id } : input.removeSignature ? { signatureFileId: null } : {}) }
    await ctx.db(FolioEntity).updateOne({ _id: entity._id }, { $set: set })
    await audit(ctx, { action: 'folio_entity.signatory_changed', entity: 'FolioEntity', entityId: entity._id, summary: `Changed the signatory on ${entity.code}`, product: 'folio' })
    refresh()
    return ok(`Signatory saved for ${entity.code}`)
  },
  S,
)
