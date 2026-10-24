'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, fail, ok } from '@/lib/actions'
import { audit } from '@/lib/audit'
import { objectId } from '@/lib/validation'
import { FolioServiceItem } from '@/models/folio/ServiceItem'
import { FolioSettings } from '@/models/folio/FolioSettings'
import { FOLIO } from '../context'
import { getFolioSettings } from './queries'
import { remindersSchema, serviceItemSchema, tallySettingsSchema, taxSettingsSchema } from './schemas'

/** Workspace-level Folio settings: tax rates, the service catalogue, reminder cadence. */

const S = { ...FOLIO, perm: 'folio.settings' } as const
const refresh = () => revalidatePath('/app/folio/settings')

export const saveTaxSettings = action(
  taxSettingsSchema,
  async (input, ctx) => {
    const before = await getFolioSettings(ctx)
    const taxRates = [...new Set(input.taxRates)].sort((a, b) => a - b)
    const invoicing = { taxRates, roundOffTotal: input.roundOffTotal, showTdsOnInvoice: input.showTdsOnInvoice, defaultValidityDays: input.defaultValidityDays }
    await ctx.db(FolioSettings).updateOne({ _id: before._id }, { $set: { invoicing } })
    await audit(ctx, { action: 'folio_settings.tax_changed', entity: 'FolioSettings', entityId: before._id, summary: `Folio tax settings changed (rates ${taxRates.join(', ')}%)`, product: 'folio', changes: { before: before.invoicing, after: invoicing } })
    refresh()
    return ok('Tax settings saved')
  },
  S,
)

export const saveReminderSettings = action(
  remindersSchema,
  async (input, ctx) => {
    const before = await getFolioSettings(ctx)
    const reminders = { enabled: input.enabled, offsetDays: input.cadence, channels: input.channels, autoRetainerDrafts: input.autoRetainerDrafts }
    await ctx.db(FolioSettings).updateOne({ _id: before._id }, { $set: { reminders } })
    await audit(ctx, { action: 'folio_settings.reminders_changed', entity: 'FolioSettings', entityId: before._id, summary: `Reminder cadence set to ${input.cadence.join(', ')} days`, product: 'folio', changes: { before: before.reminders, after: reminders } })
    refresh()
    return ok(input.enabled ? `Reminders on: ${input.cadence.join(', ')} days from the due date` : 'Automatic reminders are off')
  },
  S,
)

export const saveServiceItem = action(
  serviceItemSchema,
  async ({ id, rate, gstRatePercent, ...rest }, ctx) => {
    const clash = await ctx.db(FolioServiceItem).exists({ code: rest.code, ...(id ? { _id: { $ne: id } } : {}) })
    if (clash) return fail('Some fields need attention.', { code: 'That code is already in use.' })
    const fields = { ...rest, defaultRatePaise: rate, defaultGstRatePercent: gstRatePercent }
    if (id) {
      const res = await ctx.db(FolioServiceItem).updateOne({ _id: id }, { $set: fields })
      if (!res.matchedCount) return fail('That service was not found. It may have been removed.')
    } else {
      await ctx.db(FolioServiceItem).create({ ...fields, isActive: true })
    }
    await audit(ctx, { action: id ? 'folio_service.updated' : 'folio_service.created', entity: 'FolioServiceItem', entityId: id, summary: `${id ? 'Updated' : 'Added'} service ${rest.code} ${rest.name}`, product: 'folio' })
    refresh()
    return ok(`Service "${rest.name}" saved`)
  },
  S,
)

export const setServiceItemActive = action(
  z.object({ id: objectId, active: z.boolean() }),
  async ({ id, active }, ctx) => {
    const item = await ctx.db(FolioServiceItem).findOneAndUpdate({ _id: id }, { $set: { isActive: active } }).lean()
    if (!item) return fail('That service was not found. It may have been removed.')
    await audit(ctx, { action: active ? 'folio_service.restored' : 'folio_service.archived', entity: 'FolioServiceItem', entityId: id, summary: `${active ? 'Restored' : 'Archived'} service ${item.code}`, product: 'folio' })
    refresh()
    return ok(active ? `"${item.name}" is back in the picker` : `"${item.name}" archived. Past invoice lines keep it.`)
  },
  S,
)

export const saveTallySettings = action(
  tallySettingsSchema,
  async (input, ctx) => {
    const before = await getFolioSettings(ctx)
    // Blank fields are left out so they keep following the defaults.
    const tally = Object.fromEntries(Object.entries(input).filter(([, v]) => typeof v === 'string' && v.length > 0))
    await ctx.db(FolioSettings).updateOne({ _id: before._id }, { $set: { tally } })
    await audit(ctx, { action: 'folio_settings.tally_changed', entity: 'FolioSettings', entityId: before._id, summary: 'Tally ledger names changed', product: 'folio', changes: { before: before.tally ?? {}, after: tally } })
    revalidatePath('/app/folio/export')
    return ok('Tally ledger names saved')
  },
  S,
)
