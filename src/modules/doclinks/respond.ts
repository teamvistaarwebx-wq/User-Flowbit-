import 'server-only'
import { formatDate, todayIST } from '@/lib/dates'
import { scoped } from '@/lib/db/scoped'
import { formatINR } from '@/lib/money'
import { Client } from '@/models/Client'
import { DocEvent } from '@/models/folio/DocEvent'
import { FolioEntity } from '@/models/folio/Entity'
import { Invoice } from '@/models/folio/Invoice'
import { Quote } from '@/models/folio/Quote'
import { emitQuoteAccepted, emitUtrShared } from '@/modules/automations/folio-events'
import { clientLabel, entityLabel } from '@/modules/folio/context'
import { isPayable, normalizeUtr, quoteDecision, UTR_PATTERN } from './access'
import { ensureDocLink, resolveDocLink, type LinkDoc } from './links'

/**
 * What a client does on a public page. Each call re-resolves the token (a
 * revoked or expired link refuses), touches only the link's own document in
 * the link's workspace, and records a DocEvent for the timeline.
 */

type Meta = Readonly<{ ip: string; userAgent: string }>
export type RespondResult = 'ok' | 'missing' | Readonly<{ error: string; field?: string }>

async function activeLink(token: string, kind: LinkDoc['kind']): Promise<LinkDoc | null> {
  const resolved = await resolveDocLink(token)
  return resolved.state === 'active' && resolved.link.kind === kind ? resolved.link : null
}

export async function respondToQuote(token: string, input: Meta & { decision: 'accept' | 'decline'; name: string; comment: string }): Promise<RespondResult> {
  const link = await activeLink(token, 'quote')
  if (!link) return 'missing'
  const db = <M extends Parameters<typeof scoped>[0]>(model: M) => scoped(model, link.orgId)
  const quote = await db(Quote).findById(link.docId).lean()
  if (!quote) return 'missing'
  const decision = quoteDecision(quote, todayIST())
  if (!decision.open) return { error: decision.reason }
  const now = new Date()
  const accepted = input.decision === 'accept'
  const set = accepted
    ? { status: 'accepted', acceptedAt: now }
    : { status: 'declined', declinedAt: now, declineReason: input.comment ? `${input.comment} (${input.name}, online)` : `Declined online by ${input.name}` }
  // Guarded on the status it was read with: a double click or a parallel answer changes nothing twice.
  const res = await db(Quote).updateOne({ _id: quote._id, status: quote.status }, { $set: { ...set, respondedName: input.name, respondedComment: input.comment || undefined, respondedIp: input.ip, respondedOnline: true } })
  if (!res.modifiedCount) return { error: 'This quote was just answered. Refresh the page.' }
  await DocEvent.create({ orgId: link.orgId, kind: 'quote', docId: quote._id, linkId: link._id, type: accepted ? 'accepted' : 'declined', at: now, name: input.name, comment: input.comment || undefined, ip: input.ip, userAgent: input.userAgent })
  if (accepted) {
    const [client, entity] = await Promise.all([db(Client).findById(quote.clientId, { name: 1, displayName: 1 }).lean(), db(FolioEntity).findById(quote.entityId, { legalName: 1, tradeName: 1 }).lean()])
    const documentLink = await ensureDocLink(link.orgId, { kind: 'quote', docId: quote._id, clientId: quote.clientId })
    await emitQuoteAccepted(link.orgId, {
      quoteId: String(quote._id),
      clientId: String(quote.clientId),
      vars: {
        client_name: client ? clientLabel(client) : 'The client',
        business_name: entity ? entityLabel(entity) : '',
        quote_number: quote.number,
        quote_total: formatINR(quote.totalPaise),
        valid_until: formatDate(quote.validUntil),
        document_link: documentLink.url,
        accepted_by: input.name,
        comment: input.comment,
      },
    })
  }
  return 'ok'
}

export async function shareUtr(token: string, input: Meta & { utr: string; amountPaise: number | null; note: string }): Promise<RespondResult> {
  const link = await activeLink(token, 'invoice')
  if (!link) return 'missing'
  const utr = normalizeUtr(input.utr)
  if (!UTR_PATTERN.test(utr)) return { error: 'A UTR or UPI reference is 6 to 30 letters and digits.', field: 'utr' }
  const invoice = await scoped(Invoice, link.orgId).findById(link.docId, { status: 1, balancePaise: 1 }).lean()
  if (!invoice) return 'missing'
  if (!isPayable(invoice)) return { error: 'This invoice has nothing left to pay.' }
  if (input.amountPaise !== null && input.amountPaise > invoice.balancePaise) return { error: `That is more than the ${formatINR(invoice.balancePaise)} due.`, field: 'amount' }
  // The same UTR shared twice for one invoice is one claim.
  const existing = await DocEvent.findOne({ orgId: link.orgId, kind: 'invoice', docId: link.docId, type: 'utr_shared', utr }, { _id: 1 }).lean()
  if (existing) return 'ok'
  const event = await DocEvent.create({ orgId: link.orgId, kind: 'invoice', docId: link.docId, linkId: link._id, type: 'utr_shared', at: new Date(), utr, amountPaise: input.amountPaise ?? undefined, comment: input.note || undefined, ip: input.ip, userAgent: input.userAgent })
  await emitUtrShared(link.orgId, link.docId, { utr, amountPaise: input.amountPaise, eventId: String(event._id) })
  return 'ok'
}
