'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, fail, ok } from '@/lib/actions'
import { audit } from '@/lib/audit'
import { checkbox, isoDate, objectId, optionalText, paise, requiredText } from '@/lib/validation'
import { FolioBillingProfile } from '@/models/folio/BillingProfile'
import { FolioEntity } from '@/models/folio/Entity'
import { FOLIO, loadClient } from '../context'
import { withTxn } from '../txn'
import { DEFAULT_TDS_SECTION } from '../types'
import { syncOpeningBalance } from './opening'
import { newNumbers } from '@/modules/messaging/number-consent'
import { recordNumberGiven } from '@/modules/messaging/number-consent-store'

const blank = (v: unknown) => (v === '' || v === null ? undefined : v)

const recipientSchema = z
  .object({
    id: z.preprocess(blank, objectId.optional()),
    name: requiredText('Name', 120),
    email: z.preprocess(blank, z.string().trim().toLowerCase().email('Enter a valid email address').optional()),
    phone: optionalText(20),
    whatsapp: optionalText(20),
    receivesInvoices: checkbox,
    receivesReminders: checkbox,
    isPrimary: checkbox,
  })
  .refine((r) => r.email || r.phone || r.whatsapp, { message: 'Give an email, a phone or a WhatsApp number', path: ['email'] })

const profileSchema = z
  .object({
    clientId: objectId,
    defaultEntityId: z.preprocess(blank, objectId.optional()),
    paymentTermsDays: z.preprocess(blank, z.coerce.number().int('Use whole days').min(0).max(365, 'At most 365 days').optional()),
    placeOfSupplyStateCode: z.preprocess(blank, z.string().regex(/^\d{2}$/, 'Choose a state').optional()),
    isExportClient: checkbox,
    defaultGstRatePercent: z.preprocess(blank, z.coerce.number().min(0).max(100).optional()),
    creditLimit: z.preprocess(blank, paise.optional()),
    tdsApplicable: checkbox,
    tdsSection: optionalText(10),
    tdsPercent: z.preprocess(blank, z.coerce.number().min(0).max(100).optional()),
    remindersPaused: checkbox,
    recipients: z.preprocess((v) => v ?? [], z.array(recipientSchema).max(20)),
    openingBalance: z.preprocess(blank, paise.optional()),
    openingBalanceOn: z.preprocess(blank, isoDate.optional()),
    notes: optionalText(2000),
  })
  .superRefine((v, ctx) => {
    if (v.tdsApplicable && !(v.tdsPercent && v.tdsPercent > 0)) ctx.addIssue({ code: 'custom', path: ['tdsPercent'], message: 'Enter the TDS rate, or turn TDS off.' })
    if (v.recipients.filter((r) => r.isPrimary).length > 1) ctx.addIssue({ code: 'custom', path: ['recipients'], message: 'Only one recipient can be primary.' })
    if (v.openingBalance && !v.openingBalanceOn) ctx.addIssue({ code: 'custom', path: ['openingBalanceOn'], message: 'Give the date the balance is as on' })
  })

/** Saves a client's billing terms; the opening balance (issue permission only) syncs its invoice row. */
export const saveBillingProfile = action(
  profileSchema,
  async (input, ctx) => {
    const client = await loadClient(ctx, input.clientId)
    if (input.defaultEntityId && !(await ctx.db(FolioEntity).exists({ _id: input.defaultEntityId }))) return fail('Some fields need attention.', { defaultEntityId: 'Pick an entity from this workspace' })
    const before = await ctx.db(FolioBillingProfile).findOne({ clientId: client._id }).lean()
    const canOpening = ctx.can('invoices.issue')
    const opening = canOpening ? { openingBalancePaise: input.openingBalance ?? 0, openingBalanceOn: input.openingBalance ? (input.openingBalanceOn ?? null) : null } : {}
    const fields = {
      defaultEntityId: input.defaultEntityId ?? null,
      paymentTermsDays: input.paymentTermsDays ?? null,
      placeOfSupplyStateCode: input.placeOfSupplyStateCode ?? null,
      isExportClient: input.isExportClient,
      defaultGstRatePercent: input.defaultGstRatePercent ?? null,
      creditLimitPaise: input.creditLimit ?? null,
      tds: { applicable: input.tdsApplicable, section: input.tdsApplicable ? (input.tdsSection ?? DEFAULT_TDS_SECTION) : input.tdsSection, percent: input.tdsPercent ?? 0 },
      remindersPaused: input.remindersPaused,
      recipients: input.recipients.map(({ id, ...r }) => ({ ...(id ? { _id: id } : {}), ...r })),
      notes: input.notes,
      ...opening,
    }
    const result = await withTxn(async (session) => {
      await ctx.db(FolioBillingProfile).updateOne({ clientId: client._id }, { $set: fields }, { upsert: true, session })
      return canOpening ? syncOpeningBalance(ctx, client, { amountPaise: input.openingBalance ?? 0, on: input.openingBalanceOn ?? null, defaultEntityId: input.defaultEntityId ?? null }, session) : 'unchanged'
    })
    const beforeNumbers = (before?.recipients ?? []).flatMap((r) => [r.whatsapp, r.phone])
    for (const phone of newNumbers(beforeNumbers, input.recipients.flatMap((r) => [r.whatsapp, r.phone]))) await recordNumberGiven(ctx, { phone, source: 'admin', where: 'billing recipient' })
    await audit(ctx, { action: 'billing_profile.updated', entity: 'FolioBillingProfile', entityId: client._id, summary: `Billing settings saved for ${client.name}${result === 'saved' ? ' (opening balance updated)' : result === 'removed' ? ' (opening balance removed)' : ''}`, product: 'folio', changes: { before: before ?? {}, after: fields } })
    revalidatePath(`/app/clients/${client._id}`)
    revalidatePath(`/app/folio/ledger/${client._id}`)
    revalidatePath('/app/folio')
    return ok(`Billing settings saved for ${client.name}`)
  },
  { ...FOLIO, perm: 'invoices.write' },
)
