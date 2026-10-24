import { addPeriod, quoteSelection, subscriptionInvoiceTotals, supplyTypeFor } from '@/lib/billing'
import { fiscalYear, istInstant, monthOf, monthRange, shiftMonth, todayIST } from '@/lib/dates'
import { flowbitSupplier } from '@/lib/env'
import { stateByCode2 } from '@/lib/india-states'
import type { SeedCtx } from '@/lib/seed-types'
import { formatSeq, nextSeq, PLATFORM_ORG_ID } from '@/lib/sequence'
import { Org } from '@/models/Org'
import { SubscriptionInvoice } from '@/models/subscription/SubscriptionInvoice'
import { invoiceLines, shapeOf } from './selection'

/** Suite seats the demo org pays for (platform spec 14). */
const DEMO_SEATS = 25

/**
 * The demo org has been on Suite for three months, paid in test mode: the two
 * months before the current IST month, and the current one (the live period).
 */
function paidPeriods() {
  const current = monthOf(todayIST())
  return [-2, -1, 0].map((delta) => {
    const month = shiftMonth(current, delta)
    const { start, end } = monthRange(month)
    return { start, end, paidAt: new Date(Math.min(istInstant(start, '10:15').getTime(), Date.now())), paymentId: `sim_seed_${month.replace('-', '_')}` }
  })
}

const DEMO_BILLING = {
  legalName: 'Sanskaar Webx Services LLP',
  address: { line1: '2nd Floor, Plot 14, Zone-II, MP Nagar', line2: '', city: 'Bhopal', stateCode: 'MP', pincode: '462011' },
}

export async function seed(ctx: SeedCtx): Promise<void> {
  const org = await Org.findById(ctx.orgId, { subscription: 1 }).lean()
  const billing = org?.subscription?.billing?.legalName ? org.subscription.billing : { ...DEMO_BILLING, email: ctx.users.owner.email }
  if (!org?.subscription?.billing?.legalName) await Org.updateOne({ _id: ctx.orgId }, { $set: { 'subscription.billing': billing } })

  const selection = { plan: 'suite', seats: DEMO_SEATS } as const
  const quote = quoteSelection(selection, 'monthly')
  const periods = paidPeriods()
  const supplier = flowbitSupplier()
  const customerState = stateByCode2(billing.address?.stateCode ?? 'MP')!
  const supplierState = stateByCode2(supplier.stateCode2)
  const supplyType = supplyTypeFor(supplier, customerState.code2)
  const totals = subscriptionInvoiceTotals(quote.lines, supplyType)
  let created = 0

  for (const period of periods) {
    if (await SubscriptionInvoice.exists({ 'payment.paymentId': period.paymentId })) continue
    const fy = fiscalYear(period.start)
    const seq = await nextSeq(PLATFORM_ORG_ID, `fb-invoice:${fy}`)
    await ctx.db(SubscriptionInvoice).create({
      number: formatSeq(seq, { prefix: `FB/${fy}/`, pad: 4 }),
      fy,
      seq,
      kind: 'subscription',
      status: 'paid',
      issueDate: period.start,
      periodStart: period.start,
      periodEnd: period.end,
      supplier: { legalName: supplier.legalName, gstin: supplier.gstin ?? undefined, pan: supplier.pan ?? undefined, address: supplier.address, stateCode2: supplierState?.code2, gstStateCode: supplierState?.gstCode, email: supplier.supportEmail },
      customer: { legalName: billing.legalName ?? DEMO_BILLING.legalName, email: billing.email ?? ctx.users.owner.email, address: { ...DEMO_BILLING.address, ...billing.address }, stateCode2: customerState.code2, gstStateCode: customerState.gstCode },
      placeOfSupply: { gstStateCode: customerState.gstCode, name: customerState.name },
      supplyType,
      sac: supplier.sac,
      gstRate: 18,
      lines: invoiceLines(quote, { start: period.start, end: period.end }),
      taxableValuePaise: totals.taxableValuePaise,
      cgstPaise: totals.cgstPaise,
      sgstPaise: totals.sgstPaise,
      igstPaise: totals.igstPaise,
      taxPaise: totals.taxPaise,
      roundOffPaise: totals.roundOffPaise,
      totalPaise: totals.totalPaise,
      payment: { provider: 'simulated', paymentId: period.paymentId, paidAt: period.paidAt },
      isTest: true,
    })
    created += 1
  }

  // The live period: 1st of this IST month to the 1st of the next (exclusive end).
  const shape = shapeOf(selection)
  const periodStart = istInstant(periods[periods.length - 1].start)
  await Org.updateOne(
    { _id: ctx.orgId },
    {
      $set: {
        'subscription.status': 'active',
        'subscription.plan': shape.plan,
        'subscription.products': shape.products,
        'subscription.quantities': shape.quantities,
        'subscription.seats': shape.seats,
        'subscription.cycle': 'monthly',
        'subscription.currentPeriodStart': periodStart,
        'subscription.currentPeriodEnd': addPeriod(periodStart, 'monthly'),
        'subscription.amountPaise': quote.periodAmountPaise,
        'subscription.cancelAtPeriodEnd': false,
      },
    },
  )
  ctx.log(`subscription: Suite ${DEMO_SEATS} seats, monthly, active; ${created} paid invoices in billing history`)
}
