import type { Types } from 'mongoose'
import { addDays, istInstant, todayIST } from '@/lib/dates'
import type { SeedCtx } from '@/lib/seed-types'
import { Client } from '@/models/Client'
import { FolioBillingProfile } from '@/models/folio/BillingProfile'
import { FolioEntity } from '@/models/folio/Entity'
import { FolioFollowup } from '@/models/folio/Followup'
import { FolioMessage } from '@/models/folio/MessageLog'
import { FolioReceipt } from '@/models/folio/Receipt'
import { Invoice } from '@/models/folio/Invoice'
import { composeReminderEmail } from '@/modules/folio/collections/compose'
import { toneFor } from '@/modules/folio/collections/schedule'
import { takeNumber } from '@/modules/folio/counter'
import { daysOverdue } from '@/modules/folio/engine/aging'
import { recalcInvoiceSettlement } from '@/modules/folio/settlement'
import type { ReceiptMode } from './rules'

/**
 * Money in for the demo workspace (folio.md 10, items 7–9, 12, 13): receipts
 * that settle the seeded invoices (TDS as allocation TDS, never a credit
 * note), an unapplied advance, a bounced cheque, follow-ups on everything
 * overdue and a little chase history. Called by modules/folio/seed.ts after
 * the invoices exist. Idempotent: it does nothing when receipts already exist.
 */

type InvoiceDoc = Awaited<ReturnType<typeof loadInvoices>>[number]
type EntityDoc = Awaited<ReturnType<typeof loadEntities>>[number]

type ReceiptSpec = {
  entity: EntityDoc
  clientId: Types.ObjectId
  receivedOn: string
  amountPaise: number
  mode: ReceiptMode
  reference: string
  status?: 'recorded' | 'bounced'
  bounceReason?: string
  notes?: string
  allocations: { invoice: InvoiceDoc; amountPaise: number; tdsPaise: number }[]
}

const loadInvoices = (ctx: SeedCtx) => ctx.db(Invoice).find({ status: { $in: ['issued', 'part_paid', 'paid'] }, billingType: { $ne: 'opening' } }).sort({ issueDate: 1, seq: 1 }).lean()
const loadEntities = (ctx: SeedCtx) => ctx.db(FolioEntity).find({}).lean()

const rupees = (n: number) => Math.round(n * 100)

function paidOn(inv: InvoiceDoc, asOf: string): string {
  const day = addDays(inv.issueDate, 12)
  return day > asOf ? asOf : day
}

function ref(mode: ReceiptMode, i: number): string {
  if (mode === 'upi') return `UPI/62${String(41870 + i * 37).padStart(7, '0')}`
  if (mode === 'cash') return `Cash memo ${100 + i}`
  if (mode === 'cheque') return `Cheque ${483210 + i}`
  return `HDFCR5${String(2026100 + i * 13).padStart(9, '0')}`
}

/** Full settlement: cash plus the expected TDS when the client deducts it. */
function settleFull(entity: EntityDoc, inv: InvoiceDoc, mode: ReceiptMode, withTds: boolean, asOf: string, i: number): ReceiptSpec {
  const tds = withTds ? Math.min(inv.tdsPaise ?? 0, inv.balancePaise) : 0
  return { entity, clientId: inv.clientId, receivedOn: paidOn(inv, asOf), amountPaise: inv.balancePaise - tds, mode, reference: ref(mode, i), allocations: [{ invoice: inv, amountPaise: inv.balancePaise - tds, tdsPaise: tds }] }
}

function planFor(name: string, list: InvoiceDoc[], entityOf: (inv: InvoiceDoc) => EntityDoc | undefined, tdsOn: boolean, asOf: string): ReceiptSpec[] {
  const key = name.toLowerCase()
  const full = (invs: InvoiceDoc[], mode: ReceiptMode) =>
    invs.flatMap((inv, i) => {
      const e = entityOf(inv)
      return e && inv.balancePaise > 0 ? [settleFull(e, inv, mode, tdsOn, asOf, i)] : []
    })
  if (key.startsWith('aarav')) return full(list.slice(0, 4), 'bank_transfer')
  if (key.startsWith('kabir')) return full(list.slice(0, 2), 'bank_transfer')
  if (key.startsWith('orbit interiors')) return full(list.slice(0, 2), 'upi')
  if (key.startsWith('nirvana')) return full(list.filter((i) => i.billingType === 'milestone').slice(0, 1), 'bank_transfer')
  if (key.startsWith('meera')) {
    const festive = list.find((i) => /festive/i.test(i.subject ?? '')) ?? list[0]
    return full(festive ? [festive] : [], 'cash')
  }
  if (!key.startsWith('zenith')) return []
  const specs = full(list.slice(0, 2), 'bank_transfer')
  const part = list[2]
  const partEntity = part ? entityOf(part) : undefined
  if (part && partEntity && part.balancePaise > rupees(50_000)) {
    specs.push({ entity: partEntity, clientId: part.clientId, receivedOn: paidOn(part, asOf), amountPaise: rupees(50_000), mode: 'bank_transfer', reference: ref('bank_transfer', 9), allocations: [{ invoice: part, amountPaise: rupees(50_000), tdsPaise: 0 }] })
  }
  const bounced = list[3]
  const bouncedEntity = bounced ? entityOf(bounced) : undefined
  if (bounced && bouncedEntity && bounced.balancePaise > rupees(50_000)) {
    specs.push({ entity: bouncedEntity, clientId: bounced.clientId, receivedOn: paidOn(bounced, asOf), amountPaise: rupees(50_000), mode: 'cheque', reference: ref('cheque', 3), status: 'bounced', bounceReason: 'Insufficient funds', allocations: [{ invoice: bounced, amountPaise: rupees(50_000), tdsPaise: 0 }] })
  }
  return specs
}

async function createReceipts(ctx: SeedCtx, specs: ReceiptSpec[]): Promise<Types.ObjectId[]> {
  const touched: Types.ObjectId[] = []
  const recorder = ctx.members.finance?._id ?? ctx.members.owner._id
  for (const s of [...specs].sort((a, b) => a.receivedOn.localeCompare(b.receivedOn))) {
    const taken = await takeNumber(ctx.orgId, s.entity, 'receipt', s.receivedOn)
    await ctx.db(FolioReceipt).create({
      ...taken,
      entityId: s.entity._id,
      clientId: s.clientId,
      receivedOn: s.receivedOn,
      amountPaise: s.amountPaise,
      mode: s.mode,
      reference: s.reference,
      instrumentDate: s.mode === 'cheque' ? s.receivedOn : undefined,
      bankAccountId: (s.entity.bankAccounts ?? []).find((b) => b.isDefault)?._id ?? s.entity.bankAccounts?.[0]?._id,
      status: s.status ?? 'recorded',
      bouncedOn: s.status === 'bounced' ? addDays(s.receivedOn, 3) : undefined,
      bounceReason: s.bounceReason,
      notes: s.notes,
      allocations: s.allocations.map((a) => ({ invoiceId: a.invoice._id, amountPaise: a.amountPaise, tdsPaise: a.tdsPaise, allocatedOn: s.receivedOn, allocatedBy: recorder })),
      recordedBy: recorder,
    })
    touched.push(...s.allocations.map((a) => a.invoice._id))
  }
  return touched
}

async function seedFollowups(ctx: SeedCtx, asOf: string): Promise<InvoiceDoc[]> {
  const overdue = (await loadInvoices(ctx)).filter((i) => (i.status === 'issued' || i.status === 'part_paid') && i.balancePaise > 0 && i.dueDate < asOf)
  const finance = ctx.members.finance?._id ?? ctx.members.owner._id
  await ctx.db(FolioFollowup).insertMany(
    overdue.map((inv) => {
      const late = daysOverdue(inv.dueDate, asOf) > 45
      return {
        clientId: inv.clientId,
        invoiceId: inv._id,
        dueOn: late ? addDays(asOf, -2) : asOf,
        channel: late ? 'call' : 'email',
        subject: `Chase ${inv.number}`,
        notes: late ? 'Third attempt. Escalate to the founder if there is no commitment this week.' : 'Standard chase against the outstanding balance.',
        status: 'open',
        assignedTo: finance,
        createdBy: finance,
      }
    }),
  )
  return overdue
}

async function seedChaseHistory(ctx: SeedCtx, overdue: InvoiceDoc[], entities: EntityDoc[], asOf: string): Promise<number> {
  const profiles = await ctx.db(FolioBillingProfile).find({ clientId: { $in: overdue.map((i) => i.clientId) } }, { clientId: 1, recipients: 1 }).lean()
  const clients = await ctx.db(Client).find({ _id: { $in: overdue.map((i) => i.clientId) } }, { email: 1, name: 1 }).lean()
  const rows = overdue.flatMap((inv) => {
    const days = daysOverdue(inv.dueDate, asOf)
    const offset = [30, 15, 7, 0].find((o) => o <= days)
    if (offset === undefined) return []
    const recipient = profiles.find((p) => String(p.clientId) === String(inv.clientId))?.recipients?.find((r) => r.email && r.receivesReminders !== false)
    const client = clients.find((c) => String(c._id) === String(inv.clientId))
    const to = recipient?.email ?? client?.email
    if (!to) return []
    const entity = entities.find((e) => String(e._id) === String(inv.entityId))
    const sentOn = addDays(inv.dueDate, offset)
    const email = composeReminderEmail({ tone: toneFor(offset), daysOverdue: offset, invoiceNumber: inv.number ?? '', issueDate: inv.issueDate, dueDate: inv.dueDate, balancePaise: inv.balancePaise, recipientName: recipient?.name ?? null, sender: entity?.signatoryName || ctx.org.name, company: entity?.tradeName || entity?.legalName || ctx.org.name, supportEmail: entity?.email ?? null })
    return [{ kind: 'reminder' as const, clientId: inv.clientId, invoiceId: inv._id, channel: 'email' as const, status: 'logged' as const, offsetDays: offset, toAddress: to, subject: email.subject, body: email.text, sentAt: istInstant(sentOn, '10:00') }]
  })
  if (rows.length) await ctx.db(FolioMessage).insertMany(rows)
  return rows.length
}

export async function seedMoneyIn(ctx: SeedCtx, refs?: unknown): Promise<void> {
  const asOf = (refs as { asOf?: string } | null | undefined)?.asOf ?? todayIST()
  if (await ctx.db(FolioReceipt).exists({})) {
    ctx.log('folio money-in: receipts already exist, skipped')
    return
  }
  const [entities, invoices, clients, profiles] = await Promise.all([loadEntities(ctx), loadInvoices(ctx), ctx.db(Client).find({}, { name: 1 }).lean(), ctx.db(FolioBillingProfile).find({}, { clientId: 1, tds: 1, defaultEntityId: 1 }).lean()])
  if (!entities.length || !invoices.length) {
    ctx.log('folio money-in: no entities or issued invoices yet, skipped')
    return
  }
  const entityOf = (inv: InvoiceDoc) => entities.find((e) => String(e._id) === String(inv.entityId))
  const specs = clients.flatMap((c) => {
    const list = invoices.filter((i) => String(i.clientId) === String(c._id))
    const tdsOn = Boolean(profiles.find((p) => String(p.clientId) === String(c._id))?.tds?.applicable)
    return list.length ? planFor(c.name, list, entityOf, tdsOn, asOf) : []
  })

  const aarav = clients.find((c) => c.name.toLowerCase().startsWith('aarav'))
  const aaravEntity = aarav ? entities.find((e) => String(e._id) === String(profiles.find((p) => String(p.clientId) === String(aarav._id))?.defaultEntityId)) ?? entities.find((e) => e.kind === 'gst') : undefined
  if (aarav && aaravEntity) {
    specs.push({ entity: aaravEntity, clientId: aarav._id, receivedOn: addDays(asOf, -5), amountPaise: rupees(1_50_000), mode: 'bank_transfer', reference: ref('bank_transfer', 21), notes: 'Advance against next quarter, to be applied when invoiced', allocations: [] })
  }

  const touched = await createReceipts(ctx, specs)
  for (const id of new Set(touched.map(String))) await recalcInvoiceSettlement(ctx, id)
  const overdue = await seedFollowups(ctx, asOf)
  const reminders = await seedChaseHistory(ctx, overdue, entities, asOf)
  ctx.log(`folio money-in: ${specs.length} receipts (1 advance, 1 bounced), ${overdue.length} follow-ups, ${reminders} reminders`)
}
