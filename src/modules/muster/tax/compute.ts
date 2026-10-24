import type { RegimeRules, Slab, TaxRules } from './rules'

/**
 * Yearly income tax on a total income (pure). Rupees in and out, rounded to
 * the rupee at each step: slab tax, rebate (with marginal relief where the
 * regime allows it), surcharge (with marginal relief at each threshold) and
 * cess on tax plus surcharge.
 */

export type TaxBreakdown = {
  taxableIncome: number
  slabTax: number
  rebate: number
  taxAfterRebate: number
  surcharge: number
  cess: number
  totalTax: number
}

const whole = (n: number) => Math.max(0, Math.round(n))

/** Tax on the slabs alone. */
export function slabTax(income: number, slabs: readonly Slab[]): number {
  let tax = 0
  let lower = 0
  for (const slab of slabs) {
    if (income <= lower) break
    const upper = slab.upTo ?? Infinity
    tax += ((Math.min(income, upper) - lower) * slab.ratePercent) / 100
    lower = upper
  }
  return whole(tax)
}

/** Rebate: the full tax up to the cap at or below the limit; above it, marginal relief keeps tax ≤ the excess income. */
function rebateFor(income: number, tax: number, rules: RegimeRules): number {
  const { incomeUpTo, maxRebate, marginalRelief } = rules.rebate
  if (income <= incomeUpTo) return Math.min(tax, maxRebate)
  if (!marginalRelief) return 0
  const excess = income - incomeUpTo
  return tax > excess ? whole(tax - excess) : 0
}

const taxAfterRebateOn = (income: number, rules: RegimeRules) => {
  const tax = slabTax(income, rules.slabs)
  return tax - rebateFor(income, tax, rules)
}

/** Surcharge at the highest threshold crossed, cut back so tax + surcharge never rises by more than the income above the threshold. */
function surchargeFor(income: number, taxAfterRebate: number, rules: RegimeRules): number {
  const bands = [...rules.surcharge].sort((a, b) => b.above - a.above)
  const band = bands.find((b) => income > b.above)
  if (!band) return 0
  const surcharge = whole((taxAfterRebate * band.ratePercent) / 100)
  const atThreshold = taxAfterRebateOn(band.above, rules)
  const lowerBand = bands.find((b) => band.above > b.above)
  const thresholdTotal = atThreshold + (lowerBand ? whole((atThreshold * lowerBand.ratePercent) / 100) : 0)
  const ceiling = thresholdTotal + (income - band.above)
  return Math.max(0, Math.min(surcharge, ceiling - taxAfterRebate))
}

export function computeTax(taxableIncome: number, rules: RegimeRules, cessPercent: number): TaxBreakdown {
  const income = whole(taxableIncome)
  const tax = slabTax(income, rules.slabs)
  const rebate = rebateFor(income, tax, rules)
  const taxAfterRebate = tax - rebate
  const surcharge = surchargeFor(income, taxAfterRebate, rules)
  const cess = whole(((taxAfterRebate + surcharge) * cessPercent) / 100)
  return { taxableIncome: income, slabTax: tax, rebate, taxAfterRebate, surcharge, cess, totalTax: taxAfterRebate + surcharge + cess }
}

export const computeRegimeTax = (taxableIncome: number, rules: TaxRules, regime: 'new' | 'old'): TaxBreakdown =>
  computeTax(taxableIncome, rules.regimes[regime], rules.cessPercent)
