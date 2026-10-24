import 'server-only'
import type { Types } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { encryptionKey } from '@/lib/env'
import { UserError } from '@/lib/errors'
import { openSecret } from '@/lib/secret-box'
import { EInvoice } from '@/models/folio/EInvoice'
import { EInvoiceSettings } from '@/models/folio/EInvoiceSettings'
import { createGenericGsp, DEFAULT_BASE_URL, type GspProvider, type JsonPost } from './gsp'
import { gspPost } from './http'

type DbCtx = Pick<Ctx, 'db'>

export async function einvoiceSettingsFor(ctx: DbCtx, entityId: Types.ObjectId | string) {
  return ctx.db(EInvoiceSettings).findOne({ entityId }).lean()
}

export type EInvoiceSettingsRecord = NonNullable<Awaited<ReturnType<typeof einvoiceSettingsFor>>>

/** The active (not cancelled) IRN of an invoice, or null. */
export async function activeEinvoice(ctx: DbCtx, invoiceId: Types.ObjectId | string) {
  return ctx.db(EInvoice).findOne({ invoiceId, status: 'active' }).lean()
}

/** The entity's GSP, with its secrets opened for this one call. */
export function providerFor(settings: EInvoiceSettingsRecord, gstin: string, post: JsonPost = gspPost): GspProvider {
  const key = encryptionKey()
  if (!key) throw new UserError('E-invoicing needs APP_ENCRYPTION_KEY on the server. Ask the Flowbit admin to set it.')
  const clientSecret = openSecret(settings.clientSecretSealed, key)
  const password = openSecret(settings.passwordSealed, key)
  if (!settings.clientId || !settings.username || !clientSecret || !password) throw new UserError('Add the GSP login (client ID, secret, username and password) in Folio settings → E-invoice.')
  const baseUrl = settings.baseUrl || DEFAULT_BASE_URL[settings.environment === 'production' ? 'production' : 'sandbox']
  return createGenericGsp({ baseUrl, clientId: settings.clientId, clientSecret, username: settings.username, password, gstin }, post)
}
