/**
 * Folio demo data (folio.md section 10): settings, two entities (GST and
 * non-GST), the service catalogue, seven billing clients with profiles,
 * four retainers, a billing plan, issued invoices numbered through the
 * counter in date order and priced by the engine, an opening balance, two
 * drafts, a credit note and two quotes. Then hands over to folio-b's
 * seedMoneyIn for receipts, follow-ups and chase history.
 * Models and pure helpers only (no server-only modules).
 */
import type { Types } from 'mongoose'
import { addDays, formatDate, monthOf, shiftMonth, todayIST } from '@/lib/dates'
import type { SeedCtx } from '@/lib/seed-types'
import { Client } from '@/models/Client'
import { FolioBillingPlan } from '@/models/folio/BillingPlan'
import { FolioBillingProfile } from '@/models/folio/BillingProfile'
import { CreditNote } from '@/models/folio/CreditNote'
import { FolioEntity } from '@/models/folio/Entity'
import { FolioSettings } from '@/models/folio/FolioSettings'
import { Invoice } from '@/models/folio/Invoice'
import { Quote } from '@/models/folio/Quote'
import { FolioRetainer } from '@/models/folio/Retainer'
import { FolioServiceItem } from '@/models/folio/ServiceItem'
import { syncOpeningBalance } from './billing-profile/opening'
import { loadClient, loadEntity, type ClientDoc, type EntityDoc } from './context'
import { defaultSeries, takeNumber } from './counter'
import { clientStateCode } from './engine/gst'
import { dueDateFor, servicePeriodFor } from './engine/numbering'
import { computeInvoice } from './engine/totals'
import { priceDocument, storedPricing, type DraftLine } from './invoices/pricing'
import { bankOf, billToOf, issuerOf } from './invoices/snapshots'
import { seedExpenses } from './expenses/seed'
import { recalcInvoiceSettlement } from './settlement'

const r = (rupees: number) => Math.round(rupees * 100)
const monthStart = (today: string, back: number, day = 1) => `${shiftMonth(monthOf(today), -back)}-${String(day).padStart(2, '0')}`

const VWX_TERMS = 'Payment due within 15 days of the invoice date. Interest at 1.5% per month applies on overdue amounts.'
const ADDRESS = { line1: '4th Floor, Vijay Nagar', city: 'Indore', stateCode: '23', pincode: '452010', country: 'India' }

const SERVICES = [
  ['SVC-RET', 'Growth Retainer', 'month', 75_000, '998365'],
  ['SVC-WEB', 'Website Development', 'project', 2_50_000, '998314'],
  ['SVC-ADS', 'Paid Media Management', 'month', 45_000, '998365'],
  ['SVC-SEO', 'SEO Programme', 'month', 35_000, '998365'],
  ['SVC-CRO', 'CRO Audit', 'nos', 60_000, '998314'],
  ['SVC-SHOOT', 'Content Production', 'day', 40_000, '998386'],
  ['SVC-CONS', 'Advisory', 'hour', 5_000, '998311'],
] as const

type ClientSeed = { name: string; gstin?: string; state: string; city: string; pincode: string; entity: 'VWX' | 'VSL'; terms: number; tds?: { section: string; percent: number }; status?: 'active' | 'inactive'; contacts: [string, string, string][] }

const CLIENTS: ClientSeed[] = [
  { name: 'Aarav Retail Pvt Ltd', gstin: '27AABCA1234B1Z9', state: 'MH', city: 'Mumbai', pincode: '400013', entity: 'VWX', terms: 30, tds: { section: '194J', percent: 10 }, contacts: [['Priya Nair', 'Finance', 'priya@aavretail.example'], ['Rohit Shah', 'Marketing', 'rohit@aavretail.example']] },
  { name: 'Nirvana Wellness LLP', gstin: '23AABCN5678C1Z3', state: 'MP', city: 'Bhopal', pincode: '462011', entity: 'VWX', terms: 15, contacts: [['Kavita Joshi', 'Founder', 'kavita@nirvanawellness.example']] },
  { name: 'Kabir Foods Pvt Ltd', gstin: '29AABCK9012D1Z7', state: 'KA', city: 'Bengaluru', pincode: '560038', entity: 'VWX', terms: 30, tds: { section: '194C', percent: 2 }, contacts: [['Arjun Menon', 'Accounts', 'accounts@kabirfoods.example']] },
  { name: 'Meera Jewellers', state: 'MP', city: 'Indore', pincode: '452001', entity: 'VSL', terms: 15, contacts: [['Meera Agrawal', 'Owner', 'meera@meerajewellers.example']] },
  { name: 'Orbit Interiors', state: 'MP', city: 'Indore', pincode: '452003', entity: 'VSL', terms: 15, contacts: [['Sameer Khan', 'Partner', 'sameer@orbitinteriors.example']] },
  { name: 'Zenith Motors Pvt Ltd', gstin: '07AABCZ2345F1Z1', state: 'DL', city: 'New Delhi', pincode: '110020', entity: 'VWX', terms: 45, contacts: [['Neha Kapoor', 'Finance Controller', 'ap@zenithmotors.example']] },
  { name: 'Saanvi Ceramics', gstin: '24AABCS6789G1Z8', state: 'GJ', city: 'Morbi', pincode: '363641', entity: 'VWX', terms: 30, status: 'inactive', contacts: [['Hardik Patel', 'Director', 'hardik@saanviceramics.example']] },
]

async function seedEntities(ctx: SeedCtx) {
  const bank = (accountName: string, accountNumber: string, upiId: string) => ({ label: 'Current account', accountName, accountNumber, ifsc: 'HDFC0001234', bankName: 'HDFC Bank', branch: 'Vijay Nagar, Indore', upiId, isDefault: true })
  const [vwx, vsl] = await ctx.db(FolioEntity).insertMany([
    {
      code: 'VWX', legalName: 'Sanskaar Webx Services LLP', tradeName: 'Vistaar WebX', kind: 'gst', gstin: '23AAXFS1234A1Z5', pan: 'AAXFS1234A', address: ADDRESS, email: 'accounts@vistaarwebx.com', phone: '+91 731 400 2200',
      website: 'https://vistaarwebx.com', signatoryName: 'Sanskaar Singh', signatoryTitle: 'Designated Partner', bankAccounts: [bank('Sanskaar Webx Services LLP', '50200098765432', 'vistaarwebx@hdfcbank')],
      series: defaultSeries('VWX'), defaults: { paymentTermsDays: 15, terms: VWX_TERMS, notes: 'Thank you for your business.', gstRatePercent: 18 }, isActive: true, isDefault: true,
    },
    {
      code: 'VSL', legalName: 'Vistaar Solutions', kind: 'non_gst', pan: 'BBXPS5678B', address: ADDRESS, email: 'accounts@vistaarwebx.com', signatoryName: 'Sanskaar Singh', signatoryTitle: 'Proprietor',
      bankAccounts: [bank('Vistaar Solutions', '50200011223344', 'vistaarsolutions@hdfcbank')], series: defaultSeries('VSL'), defaults: { paymentTermsDays: 15, terms: 'Payment due within 15 days of the invoice date.', gstRatePercent: 0 }, isActive: true, isDefault: false,
    },
  ])
  return { VWX: await loadEntity(ctx, vwx._id), VSL: await loadEntity(ctx, vsl._id) }
}

async function seedClients(ctx: SeedCtx, entities: Record<'VWX' | 'VSL', EntityDoc>, today: string) {
  const out = new Map<string, ClientDoc>()
  for (const [i, c] of CLIENTS.entries()) {
    const existing = await ctx.db(Client).findOne({ name: c.name }, { _id: 1 }).lean()
    const id =
      existing?._id ??
      (
        await ctx.db(Client).create({
          name: c.name, kind: 'company', email: c.contacts[0][2], phone: `+91 98${String(26_410_000 + i * 7_717).slice(0, 8)}`, gstin: c.gstin, pan: c.gstin?.slice(2, 12), state: c.state,
          billingAddress: { line1: `${21 + i * 6}, ${['Lower Parel', 'Arera Colony', 'Indiranagar', 'MG Road', 'Palasia', 'Okhla Phase II', 'Lalpar Industrial Area'][i]}`, city: c.city, state: c.state, pincode: c.pincode, country: 'India' },
          contacts: c.contacts.map(([name, role, email], j) => ({ name, role, email, phone: `+91 97${String(53_120_000 + i * 911 + j).slice(0, 8)}`, primary: j === 0 })),
          tags: ['Folio'], source: 'referral', status: c.status ?? 'active', notes: '',
        })
      )._id
    const client = await loadClient(ctx, id)
    out.set(c.name, client)
    await ctx.db(FolioBillingProfile).create({
      clientId: client._id, defaultEntityId: entities[c.entity]._id, paymentTermsDays: c.terms,
      tds: c.tds ? { applicable: true, section: c.tds.section, percent: c.tds.percent } : { applicable: false, percent: 0 },
      recipients: c.contacts.map(([name, , email], j) => ({ name, email, receivesInvoices: true, receivesReminders: j === 0, isPrimary: j === 0 })),
    })
  }
  const nirvana = out.get('Nirvana Wellness LLP')
  if (nirvana) {
    const on = addDays(today, -200)
    await ctx.db(FolioBillingProfile).updateOne({ clientId: nirvana._id }, { $set: { openingBalancePaise: r(1_25_000), openingBalanceOn: on } })
    await syncOpeningBalance(ctx, nirvana, { amountPaise: r(1_25_000), on, defaultEntityId: entities.VWX._id })
  }
  return out
}

type IssueSpec = { client: ClientDoc; entity: EntityDoc; issueDate: string; terms: number; tdsPercent: number; lines: DraftLine[]; subject: string; billingType: 'one_time' | 'retainer' | 'milestone'; extra?: Record<string, unknown> }

const line = (description: string, rupees: number, unit: string, gst: number, hsnSac?: string, quantity = 1): DraftLine => ({ description, quantity, unit, ratePaise: r(rupees), discountPercent: 0, gstRatePercent: gst, hsnSac })

/** The stored fields of a seeded document, priced by the engine. */
function documentFields(spec: IssueSpec) {
  const priced = priceDocument({ entityKind: spec.entity.kind, entityStateCode: spec.entity.address.stateCode, clientStateCode: clientStateCode(spec.client), supplyMode: 'auto', lines: spec.lines, discountType: null, discountValue: 0, tdsPercent: spec.tdsPercent, roundOffTotal: true })
  const isTax = priced.documentType === 'tax_invoice'
  const bank = bankOf(spec.entity)
  return {
    clientId: spec.client._id, entityId: spec.entity._id, ...storedPricing(priced), issueDate: spec.issueDate, dueDate: dueDateFor(spec.issueDate, spec.terms), paymentTermsDays: spec.terms,
    billingType: spec.billingType, clientGstin: isTax ? (spec.client.gstin ?? null) : null, entityGstin: isTax ? (spec.entity.gstin ?? null) : null, billTo: billToOf(spec.client),
    bankAccountId: bank.bankAccountId, tdsPercent: priced.tdsPercent, tdsPaise: priced.tdsPaise, subject: spec.subject, notes: spec.entity.defaults?.notes ?? undefined, terms: spec.entity.defaults?.terms ?? undefined,
    ...spec.extra,
  }
}

async function issueAll(ctx: SeedCtx, specs: IssueSpec[]): Promise<Map<string, Types.ObjectId>> {
  const ids = new Map<string, Types.ObjectId>()
  const finance = ctx.members.finance?._id ?? ctx.members.owner._id
  for (const spec of [...specs].sort((a, b) => a.issueDate.localeCompare(b.issueDate))) {
    const taken = await takeNumber(ctx.orgId, spec.entity, 'invoice', spec.issueDate)
    const fields = documentFields(spec)
    const bank = bankOf(spec.entity)
    const doc = await ctx.db(Invoice).create({ ...fields, ...taken, status: 'issued', balancePaise: fields.totalPaise, from: issuerOf(spec.entity), bank: bank.bank, issuedAt: new Date(`${spec.issueDate}T05:30:00Z`), issuedBy: finance, createdBy: finance })
    ids.set(`${spec.client.name}|${spec.issueDate}|${spec.subject}`, doc._id)
  }
  return ids
}

export async function seed(ctx: SeedCtx): Promise<void> {
  if (await ctx.db(FolioEntity).exists({})) {
    ctx.log('folio: entities already exist, skipped (expenses added if missing)')
    await seedExpenses(ctx)
    return
  }
  const today = todayIST()
  const finance = ctx.members.finance?._id ?? ctx.members.owner._id
  await ctx.db(FolioSettings).create({})
  const entities = await seedEntities(ctx)
  await ctx.db(FolioServiceItem).insertMany(SERVICES.map(([code, name, unit, rate, hsnSac]) => ({ code, name, unit, defaultRatePaise: r(rate), hsnSac, defaultGstRatePercent: 18, isActive: true })))
  const clients = await seedClients(ctx, entities, today)
  const c = (name: string) => clients.get(name) as ClientDoc

  // Retainers: billed periods are issued below; Kabir and Orbit Interiors are left due for the current month.
  const retainerSpecs = [
    { client: 'Aarav Retail Pvt Ltd', name: 'Growth Retainer', amount: 1_25_000, day: 1, back: 6, entity: entities.VWX, gst: 18, issued: 6, hsnSac: '998365' },
    { client: 'Kabir Foods Pvt Ltd', name: 'Paid Media Retainer', amount: 65_000, day: 1, back: 4, entity: entities.VWX, gst: 18, issued: 4, hsnSac: '998365' },
    { client: 'Zenith Motors Pvt Ltd', name: 'SEO & Content Retainer', amount: 85_000, day: 5, back: 5, entity: entities.VWX, gst: 18, issued: 5, hsnSac: '998365' },
    { client: 'Orbit Interiors', name: 'Social Media Retainer', amount: 25_000, day: 1, back: 3, entity: entities.VSL, gst: 0, issued: 3, hsnSac: undefined },
  ]
  const specs: IssueSpec[] = []
  const retainerIds = new Map<string, Types.ObjectId>()
  for (const rs of retainerSpecs) {
    const client = c(rs.client)
    const startDate = monthStart(today, rs.back, rs.day)
    const retainer = await ctx.db(FolioRetainer).create({ clientId: client._id, entityId: rs.entity._id, name: rs.name, hsnSac: rs.hsnSac, amountPaise: r(rs.amount), gstRatePercent: rs.gst, frequency: 'monthly', startDate, billingDay: rs.day, billInAdvance: true, status: 'active', autoGenerate: true, createdBy: finance })
    retainerIds.set(rs.client, retainer._id)
    const profile = CLIENTS.find((x) => x.name === rs.client)
    for (let k = 0; k < rs.issued; k += 1) {
      const date = monthStart(today, rs.back - k, rs.day)
      if (date > today) continue
      const period = servicePeriodFor(date, 'monthly', rs.day, true)
      specs.push({ client, entity: rs.entity, issueDate: date, terms: profile?.terms ?? 15, tdsPercent: profile?.tds?.percent ?? 0, lines: [line(rs.name, rs.amount, 'month', rs.gst, rs.hsnSac)], subject: `${rs.name} · ${formatDate(period.start)} to ${formatDate(period.end)}`, billingType: 'retainer', extra: { retainerId: retainer._id, retainerBillingDate: date, periodStart: period.start, periodEnd: period.end } })
    }
  }

  // Nirvana's billing plan: phase 1 invoiced (paid by money-in), phase 2 invoiced and open.
  const nirvana = c('Nirvana Wellness LLP')
  const plan = await ctx.db(FolioBillingPlan).create({
    clientId: nirvana._id, entityId: entities.VWX._id, code: 'PLN-0001', name: 'Shopify Replatform', hsnSac: '998314', totalValuePaise: r(8_00_000), gstRatePercent: 18, startDate: addDays(today, -75), status: 'active', createdBy: finance,
    milestones: [
      { position: 1, name: 'Discovery & design sign-off', percentOfTotal: 25, dueOn: addDays(today, -60), status: 'invoiced' },
      { position: 2, name: 'Build & migration', percentOfTotal: 40, dueOn: addDays(today, -10), status: 'invoiced' },
      { position: 3, name: 'UAT & launch', percentOfTotal: 25, dueOn: addDays(today, 20), status: 'pending' },
      { position: 4, name: 'Post-launch stabilisation', percentOfTotal: 10, dueOn: addDays(today, 50), status: 'pending' },
    ],
  })
  const phases = [...plan.milestones]
  for (const [k, days] of [[0, -58], [1, -10]] as const) {
    const phase = phases[k]
    specs.push({ client: nirvana, entity: entities.VWX, issueDate: addDays(today, days), terms: 15, tdsPercent: 0, lines: [line(`Shopify Replatform — ${phase.name}`, k === 0 ? 2_00_000 : 3_20_000, 'phase', 18, '998314')], subject: `Shopify Replatform · ${phase.name}`, billingType: 'milestone', extra: { planId: plan._id, milestoneId: phase._id } })
  }

  const meera = c('Meera Jewellers')
  specs.push({ client: meera, entity: entities.VSL, issueDate: addDays(today, -40), terms: 15, tdsPercent: 0, lines: [line('Festive campaign creative and production', 85_000, 'project', 0)], subject: 'Festive campaign creative and production', billingType: 'one_time' })
  specs.push({ client: meera, entity: entities.VSL, issueDate: addDays(today, -20), terms: 15, tdsPercent: 0, lines: [line('Product photography — two days', 30_000, 'day', 0, undefined, 2)], subject: 'Product photography — two days', billingType: 'one_time' })

  const ids = await issueAll(ctx, specs)
  for (const [key, id] of ids) {
    if (!key.startsWith('Nirvana Wellness LLP|')) continue
    const phase = phases.find((p) => key.endsWith(p.name))
    if (phase) await ctx.db(FolioBillingPlan).updateOne({ _id: plan._id, 'milestones._id': phase._id }, { $set: { 'milestones.$.invoiceId': id } })
  }

  // Two drafts: this month's Aarav retainer (generated) and a hand-built one for Meera.
  const aarav = c('Aarav Retail Pvt Ltd')
  const octDate = monthStart(today, 0, 1)
  const octPeriod = servicePeriodFor(octDate, 'monthly', 1, true)
  const drafts: IssueSpec[] = [
    { client: aarav, entity: entities.VWX, issueDate: octDate, terms: 30, tdsPercent: 10, lines: [line('Growth Retainer', 1_25_000, 'month', 18, '998365')], subject: `Growth Retainer · ${formatDate(octPeriod.start)} to ${formatDate(octPeriod.end)}`, billingType: 'retainer', extra: { retainerId: retainerIds.get('Aarav Retail Pvt Ltd'), retainerBillingDate: octDate, periodStart: octPeriod.start, periodEnd: octPeriod.end } },
    { client: meera, entity: entities.VSL, issueDate: today, terms: 15, tdsPercent: 0, lines: [line('Diwali lookbook — design and print management', 45_000, 'project', 0), line('Instagram reels (set of 6)', 4_000, 'nos', 0, undefined, 6)], subject: 'Diwali lookbook and reels', billingType: 'one_time' },
  ]
  for (const d of drafts) await ctx.db(Invoice).create({ ...documentFields(d), status: 'draft', number: null, balancePaise: 0, createdBy: finance })

  await seedCreditNote(ctx, c('Zenith Motors Pvt Ltd'), entities.VWX, today)
  await seedQuotes(ctx, c('Kabir Foods Pvt Ltd'), meera, entities, today, finance)
  ctx.log(`folio: 2 entities, ${SERVICES.length} services, ${CLIENTS.length} clients, ${retainerSpecs.length} retainers, 1 plan, ${specs.length} issued invoices, 2 drafts, 1 credit note, 2 quotes`)

  try {
    const moneyIn = (await import('./receipts/seed')) as { seedMoneyIn?: (ctx: SeedCtx, refs?: unknown) => Promise<void> }
    if (typeof moneyIn.seedMoneyIn === 'function') await moneyIn.seedMoneyIn(ctx, { asOf: today, entities, clients: Object.fromEntries([...clients].map(([name, doc]) => [name, doc._id])) })
  } catch (error) {
    ctx.log(`folio: money-in seed not run (${error instanceof Error ? error.message : 'unavailable'})`)
  }
  // Converge every issued invoice on its source rows, whatever money-in did.
  const issued = await ctx.db(Invoice).find({ status: { $ne: 'draft' } }, { _id: 1 }).lean()
  for (const inv of issued) await recalcInvoiceSettlement(ctx, inv._id)
  await seedExpenses(ctx)
}

/** ₹10,000 post-sale discount against Zenith's newest retainer invoice (left open by money-in). */
async function seedCreditNote(ctx: SeedCtx, zenith: ClientDoc, vwx: EntityDoc, today: string): Promise<void> {
  const invoice = await ctx.db(Invoice).findOne({ clientId: zenith._id, status: 'issued' }).sort({ issueDate: -1 }).lean()
  if (!invoice) return
  const target = invoice.lines[0]
  const priced = computeInvoice({ lines: [{ description: target.description, quantity: 1, rate: r(10_000), gstRatePercent: target.gstRatePercent }], supplyType: invoice.supplyType, roundOffTotal: true })
  const noteDate = addDays(invoice.issueDate, 3) > today ? today : addDays(invoice.issueDate, 3)
  const taken = await takeNumber(ctx.orgId, vwx, 'credit_note', noteDate)
  const c0 = priced.lines[0]
  await ctx.db(CreditNote).create({
    ...taken, entityId: vwx._id, clientId: zenith._id, invoiceId: invoice._id, documentType: invoice.documentType, status: 'issued', noteDate, reason: 'post_sale_discount', reasonText: 'Discount agreed for the delayed content calendar',
    supplyType: invoice.supplyType, placeOfSupplyStateCode: invoice.placeOfSupplyStateCode, clientGstin: invoice.clientGstin, entityGstin: invoice.entityGstin,
    lines: [{ invoiceLineId: target._id, description: target.description, hsnSac: target.hsnSac, taxablePaise: c0.taxableValue, gstRatePercent: c0.gstRatePercent, cgstPaise: c0.cgstAmount, sgstPaise: c0.sgstAmount, igstPaise: c0.igstAmount, lineTotalPaise: c0.lineTotal }],
    taxablePaise: priced.taxableValue, cgstPaise: priced.cgstAmount, sgstPaise: priced.sgstAmount, igstPaise: priced.igstAmount, roundOffPaise: priced.roundOff, totalPaise: priced.total, issuedAt: new Date(),
  })
  await recalcInvoiceSettlement(ctx, invoice._id)
}

async function seedQuotes(ctx: SeedCtx, kabir: ClientDoc, meera: ClientDoc, entities: Record<'VWX' | 'VSL', EntityDoc>, today: string, finance: Types.ObjectId): Promise<void> {
  const make = async (client: ClientDoc, entity: EntityDoc, kind: 'quote' | 'proforma', date: string, lines: DraftLine[], subject: string, status: 'sent' | 'accepted') => {
    const priced = priceDocument({ entityKind: entity.kind, entityStateCode: entity.address.stateCode, clientStateCode: clientStateCode(client), supplyMode: 'auto', lines, discountType: null, discountValue: 0, tdsPercent: 0, roundOffTotal: true })
    const taken = await takeNumber(ctx.orgId, entity, kind, date)
    await ctx.db(Quote).create({
      kind, number: taken.number, fyLabel: taken.fyLabel, entityId: entity._id, clientId: client._id, status, quoteDate: date, validUntil: addDays(date, 15), ...storedPricing(priced), subject,
      terms: entity.defaults?.terms ?? undefined, sentAt: new Date(`${date}T06:00:00Z`), acceptedAt: status === 'accepted' ? new Date() : null, createdBy: finance,
    })
  }
  await make(kabir, entities.VWX, 'quote', addDays(today, -4), [line('SEO Programme', 35_000, 'month', 18, '998365', 3)], 'SEO programme — first quarter', 'sent')
  await make(meera, entities.VSL, 'proforma', addDays(today, -6), [line('Wedding season catalogue shoot', 40_000, 'day', 0, undefined, 2)], 'Wedding season catalogue shoot', 'accepted')
}
