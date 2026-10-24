'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, fail, ok } from '@/lib/actions'
import { audit } from '@/lib/audit'
import type { Ctx } from '@/lib/ctx'
import { objectId } from '@/lib/validation'
import { DOC_KINDS, DOC_KIND_LABELS, type DocKind } from '@/modules/doclinks/token'
import { DOC_PERMS, docWhatsAppDraft, sendDocOnWhatsApp, type DocWhatsAppDraft } from './doc-send'
import { assertWhatsAppOn } from '@/modules/features/flags'

/** "Send on WhatsApp" next to Email on Folio documents: the draft for the dialog, and the send. */

const docSchema = z.object({ kind: z.enum(DOC_KINDS), id: objectId })
const FOLIO = { product: 'folio' as const, allowReadOnly: false }

const allowed = (ctx: Ctx, kind: DocKind) => ctx.canAny(...DOC_PERMS[kind])
const DENIED = "You don't have permission to send this document. Ask a workspace admin for access."

const PAGE: Readonly<Record<DocKind, (id: string) => string>> = {
  invoice: (id) => `/app/folio/invoices/${id}`,
  quote: (id) => `/app/folio/quotes/${id}`,
  credit_note: (id) => `/app/folio/credit-notes/${id}`,
  receipt: (id) => `/app/folio/receipts/${id}`,
  statement: (id) => `/app/folio/ledger/${id}`,
}

export const previewDocWhatsAppAction = action(
  docSchema,
  async (input, ctx) => {
    await assertWhatsAppOn()
    if (!allowed(ctx, input.kind)) return fail(DENIED)
    return ok<DocWhatsAppDraft>(undefined, await docWhatsAppDraft(ctx, input.kind, input.id))
  },
  { ...FOLIO, allowReadOnly: true },
)

export const sendDocWhatsAppAction = action(
  docSchema.extend({ to: z.string().trim().min(6, 'Enter the WhatsApp number').max(24) }),
  async (input, ctx) => {
    await assertWhatsAppOn()
    if (!allowed(ctx, input.kind)) return fail(DENIED)
    const result = await sendDocOnWhatsApp(ctx, input)
    const label = DOC_KIND_LABELS[input.kind]
    await audit(ctx, { action: `${input.kind}.whatsapp_sent`, entity: label.replace(/\s+/g, ''), entityId: input.id, product: 'folio', summary: `${label} ${result.number} sent on WhatsApp to ${result.to}${result.ok ? '' : ` (failed: ${result.error})`}` })
    revalidatePath(PAGE[input.kind](input.id))
    if (!result.ok) return fail(`WhatsApp did not take it: ${result.error ?? 'unknown error'}`)
    return ok(result.status === 'sent' ? `${label} ${result.number} sent on WhatsApp to ${result.to}.` : `${label} ${result.number} is queued for WhatsApp (see the Messages log for its status).`)
  },
  FOLIO,
)
