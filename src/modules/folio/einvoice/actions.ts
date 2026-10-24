'use server'

import { revalidatePath } from 'next/cache'
import { endpointSecretsRefusal, gspEndpointChanged } from './settings-rules'
import { z } from 'zod'
import { action, fail, ok } from '@/lib/actions'
import { audit } from '@/lib/audit'
import { encryptionKey } from '@/lib/env'
import { sealSecret } from '@/lib/secret-box'
import { checkbox, isoDate, objectId, optionalText } from '@/lib/validation'
import { EInvoice } from '@/models/folio/EInvoice'
import { EInvoiceSettings } from '@/models/folio/EInvoiceSettings'
import { FolioEntity } from '@/models/folio/Entity'
import { Invoice } from '@/models/folio/Invoice'
import { webhookUrlProblem } from '@/modules/webhooks/ssrf'
import { DUPLICATE_IRN, GspError } from './gsp'
import { buildCancelPayload, buildEwbPayload, buildIrnPayload, CANCEL_REASONS, cancelWindowOpen, ineligibleReason, irnPayloadProblems, TRANS_MODES, transportProblems, type CancelReason, type TransMode } from './payload'
import { activeEinvoice, einvoiceSettingsFor, providerFor } from './service'

const ISSUE = { product: 'folio', perm: 'invoices.issue' } as const
/** Cancelling an IRN is its own permission (night check L13): issuing does not imply the right to cancel. */
const CANCEL_IRN = { product: 'folio', perm: 'einvoice.cancel' } as const
const SETTINGS = { product: 'folio', perm: 'folio.settings' } as const

const refresh = (invoiceId: string) => revalidatePath(`/app/folio/invoices/${invoiceId}`)

/** A GSP refusal as the message the person sees; anything else is rethrown (logged by the action wrapper). */
function gspFailure(error: unknown) {
  if (error instanceof GspError) {
    return fail(error.code === DUPLICATE_IRN ? 'The IRP already has an IRN for this invoice number. Fetch it from your GSP portal, or cancel it there first.' : `The GSP said: ${error.message}`)
  }
  throw error
}

async function loadInvoice(ctx: Parameters<Parameters<typeof action>[1]>[1], id: string) {
  return ctx.db(Invoice).findById(id).lean()
}

/** Registers the invoice on the IRP and stores the IRN, acknowledgement and signed QR. */
export const generateIrn = action(
  z.object({ id: objectId }),
  async ({ id }, ctx) => {
    const invoice = await loadInvoice(ctx, id)
    if (!invoice) return fail('That invoice was not found.')
    const settings = await einvoiceSettingsFor(ctx, invoice.entityId)
    const why = ineligibleReason(invoice, settings)
    if (why) return fail(why)
    if (await activeEinvoice(ctx, invoice._id)) return fail('This invoice already has an IRN.')
    const payload = buildIrnPayload(invoice)
    const problems = irnPayloadProblems(payload)
    if (problems.length) return fail(`Fix these first: ${problems.join(' ')}`)
    if (!settings) return fail('E-invoicing is off for this entity.')
    try {
      const result = await providerFor(settings, payload.SellerDtls.Gstin).generateIrn(payload)
      await ctx.db(EInvoice).create({
        invoiceId: invoice._id, entityId: invoice.entityId, environment: settings.environment, irn: result.irn, ackNo: result.ackNo, ackDate: result.ackDate, signedQr: result.signedQr, signedInvoice: result.signedInvoice ?? undefined,
        ...(result.ewbNo ? { ewb: { ewbNo: result.ewbNo, ewbDate: result.ewbDate ?? undefined, validTill: result.ewbValidTill ?? undefined, generatedAt: new Date(), generatedBy: ctx.userId } } : {}),
        createdBy: ctx.userId,
      })
      await audit(ctx, { action: 'einvoice.irn_generated', entity: 'Invoice', entityId: invoice._id, summary: `Registered ${invoice.number} on the IRP (Ack ${result.ackNo})`, product: 'folio', meta: { environment: settings.environment, ackNo: result.ackNo } })
      refresh(id)
      return ok(`IRN generated (Ack ${result.ackNo}). The invoice PDF now carries the signed QR.`)
    } catch (error) {
      return gspFailure(error)
    }
  },
  ISSUE,
)

/** Cancels the IRN within 24 hours of acknowledgement. The invoice itself is voided separately. */
export const cancelIrn = action(
  z.object({ id: objectId, reason: z.enum(Object.keys(CANCEL_REASONS) as [CancelReason, ...CancelReason[]]), remark: optionalText(100) }),
  async ({ id, reason, remark }, ctx) => {
    const invoice = await loadInvoice(ctx, id)
    if (!invoice) return fail('That invoice was not found.')
    const einv = await activeEinvoice(ctx, invoice._id)
    if (!einv) return fail('This invoice has no active IRN.')
    if (!cancelWindowOpen(einv.ackDate, new Date())) return fail('An IRN can be cancelled only within 24 hours. Issue a credit note instead.')
    if (einv.ewb?.ewbNo) return fail('Cancel the e-way bill on the e-way bill portal first, then cancel the IRN.')
    const settings = await einvoiceSettingsFor(ctx, invoice.entityId)
    if (!settings) return fail('E-invoicing is off for this entity.')
    try {
      await providerFor(settings, invoice.entityGstin ?? '').cancelIrn(buildCancelPayload(einv.irn, reason, remark ?? ''))
      await ctx.db(EInvoice).updateOne({ _id: einv._id }, { $set: { status: 'cancelled', cancelledAt: new Date(), cancelReason: reason, cancelRemark: remark } })
      await audit(ctx, { action: 'einvoice.irn_cancelled', entity: 'Invoice', entityId: invoice._id, summary: `Cancelled the IRN of ${invoice.number}`, product: 'folio', meta: { reason, remark } })
      refresh(id)
      return ok('IRN cancelled on the IRP. Void the invoice too if it should not stand.')
    } catch (error) {
      return gspFailure(error)
    }
  },
  CANCEL_IRN,
)

/** E-way bill by IRN from the transport details. */
export const generateEwb = action(
  z.object({
    id: objectId,
    mode: z.enum(Object.keys(TRANS_MODES) as [TransMode, ...TransMode[]]),
    distanceKm: z.coerce.number().min(0).max(4000),
    vehicleNo: optionalText(15),
    transporterId: optionalText(15),
    transporterName: optionalText(100),
    transDocNo: optionalText(15),
    transDocDate: isoDate.optional().or(z.literal('').transform(() => undefined)),
  }),
  async ({ id, ...transport }, ctx) => {
    const invoice = await loadInvoice(ctx, id)
    if (!invoice) return fail('That invoice was not found.')
    const einv = await activeEinvoice(ctx, invoice._id)
    if (!einv) return fail('Generate the IRN first; the e-way bill is made from it.')
    if (einv.ewb?.ewbNo) return fail(`This invoice already has e-way bill ${einv.ewb.ewbNo}.`)
    const problems = transportProblems(transport)
    if (problems.length) return fail(problems.join(' '))
    const settings = await einvoiceSettingsFor(ctx, invoice.entityId)
    if (!settings) return fail('E-invoicing is off for this entity.')
    try {
      const result = await providerFor(settings, invoice.entityGstin ?? '').generateEwb(buildEwbPayload(einv.irn, transport))
      await ctx.db(EInvoice).updateOne(
        { _id: einv._id },
        { $set: { ewb: { ewbNo: result.ewbNo, ewbDate: result.ewbDate, validTill: result.validTill, transMode: transport.mode, distanceKm: transport.distanceKm, vehicleNo: transport.vehicleNo, transporterId: transport.transporterId, transporterName: transport.transporterName, transDocNo: transport.transDocNo, transDocDate: transport.transDocDate, generatedAt: new Date(), generatedBy: ctx.userId } } },
      )
      await audit(ctx, { action: 'einvoice.ewb_generated', entity: 'Invoice', entityId: invoice._id, summary: `E-way bill ${result.ewbNo} for ${invoice.number}`, product: 'folio', meta: { mode: transport.mode, distanceKm: transport.distanceKm } })
      refresh(id)
      return ok(`E-way bill ${result.ewbNo} generated${result.validTill ? `, valid till ${result.validTill}` : ''}.`)
    } catch (error) {
      return gspFailure(error)
    }
  },
  ISSUE,
)

/** Folio settings → E-invoice for one GST entity. Blank secrets keep the stored ones. */
export const saveEinvoiceSettings = action(
  z.object({
    entityId: objectId,
    enabled: checkbox,
    turnoverAboveThreshold: checkbox,
    environment: z.enum(['sandbox', 'production']),
    baseUrl: optionalText(200),
    clientId: optionalText(120),
    clientSecret: optionalText(300),
    username: optionalText(120),
    password: optionalText(300),
  }),
  async (input, ctx) => {
    const entity = await ctx.db(FolioEntity).findById(input.entityId, { kind: 1, code: 1 }).lean()
    if (!entity) return fail('That firm was not found.')
    if (entity.kind !== 'gst') return fail('Only GST-registered entities issue e-invoices.')
    if (input.baseUrl && (!input.baseUrl.startsWith('https://') || webhookUrlProblem(input.baseUrl))) return fail('Some fields need attention.', { baseUrl: 'Use the https:// address your GSP gave you' })
    const key = encryptionKey()
    if ((input.clientSecret || input.password) && !key) return fail('Saving GSP secrets needs APP_ENCRYPTION_KEY on the server. Ask the Flowbit admin to set it.')
    const sealed = {
      ...(input.clientSecret && key ? { clientSecretSealed: sealSecret(input.clientSecret, key) } : {}),
      ...(input.password && key ? { passwordSealed: sealSecret(input.password, key) } : {}),
    }
    const current = await einvoiceSettingsFor(ctx, entity._id)
    const endpointRefusal = endpointSecretsRefusal(current, input)
    if (endpointRefusal) return fail('Some fields need attention.', { clientSecret: endpointRefusal, password: endpointRefusal })
    const endpointChanged = gspEndpointChanged(current, input)
    const hasSecrets = Boolean((sealed.clientSecretSealed ?? current?.clientSecretSealed) && (sealed.passwordSealed ?? current?.passwordSealed))
    if (input.enabled && (!input.clientId || !input.username || !hasSecrets)) return fail('Add the GSP client ID, secret, username and password before turning e-invoicing on.')
    await ctx.db(EInvoiceSettings).updateOne(
      { entityId: entity._id },
      { $set: { enabled: input.enabled, turnoverAboveThreshold: input.turnoverAboveThreshold, environment: input.environment, baseUrl: input.baseUrl, clientId: input.clientId, username: input.username, ...sealed, updatedBy: ctx.userId } },
      { upsert: true },
    )
    await audit(ctx, { action: 'einvoice.settings_saved', entity: 'FolioEntity', entityId: entity._id, summary: `Saved e-invoice settings for ${entity.code} (${input.enabled ? 'on' : 'off'}, ${input.environment})`, product: 'folio', meta: { enabled: input.enabled, environment: input.environment, baseUrl: input.baseUrl ?? null, endpointChanged, secretsChanged: Object.keys(sealed).length > 0 } })
    revalidatePath('/app/folio/settings')
    return ok(input.enabled ? 'E-invoicing is on for this entity.' : 'E-invoice settings saved.')
  },
  SETTINGS,
)
