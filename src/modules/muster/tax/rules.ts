import { z } from 'zod'

/**
 * Income-tax rules for salary TDS (pure, client-safe). Slabs, rebates and caps
 * are data, edited in Console → Settings → Salary TDS rules, so a Finance Act
 * change needs no deploy. Amounts are rupees, the way the law states them.
 *
 * Defaults: tax year 2026-27 (1 Apr 2026 – 31 Mar 2027), the first year under
 * the Income-tax Act, 2025 and the Income-tax Rules, 2026 (in force 1 Apr 2026).
 * Budget 2026 (1 Feb 2026) left personal slabs unchanged from FY 2025-26.
 * Sources (checked 9 Oct 2026):
 *  - incometaxindia.gov.in, s.392 (TDS on salary at the average rate on estimated
 *    yearly income): https://www.incometaxindia.gov.in/w/section-392-6
 *  - incometaxindia.gov.in, Form 130 FAQs (Form 16 → Form 130 under Rule 215(1)):
 *    https://www.incometaxindia.gov.in/documents/d/guest/form-130-faqs
 *  - Default (new) regime: nil to ₹4 L, 5% to ₹8 L, 10% to ₹12 L, 15% to ₹16 L,
 *    20% to ₹20 L, 25% to ₹24 L, 30% above; standard deduction ₹75,000; rebate up
 *    to ₹60,000 when total income ≤ ₹12 L, with marginal relief above it;
 *    surcharge capped at 25%.
 *  - Old regime: nil to ₹2.5 L, 5% to ₹5 L, 20% to ₹10 L, 30% above; standard
 *    deduction ₹50,000; rebate up to ₹12,500 when income ≤ ₹5 L; surcharge
 *    10/15/25/37% above ₹50 L/1 Cr/2 Cr/5 Cr.
 *  - Health and education cess 4% on tax plus surcharge.
 * Old-regime deductions keep their familiar names (80C, 80D, 80CCD(1B), 24(b),
 * HRA 10(13A)); the 2025 Act renumbers them, the amounts are unchanged.
 * Verify against the Finance Act for the year with your CA.
 */

export const REGIMES = ['new', 'old'] as const
export type Regime = (typeof REGIMES)[number]
export const REGIME_LABEL: Record<Regime, string> = { new: 'New regime (default)', old: 'Old regime' }

const rupees = z.number().min(0).max(1_000_000_000)

export const slabSchema = z.object({
  /** Upper bound of the slab in rupees; null = "and above". */
  upTo: rupees.nullable(),
  ratePercent: z.number().min(0).max(100),
})

export const surchargeSchema = z.object({ above: rupees, ratePercent: z.number().min(0).max(100) })

export const regimeRulesSchema = z.object({
  slabs: z.array(slabSchema).min(1).max(20),
  standardDeduction: rupees,
  rebate: z.object({ incomeUpTo: rupees, maxRebate: rupees, marginalRelief: z.boolean() }),
  surcharge: z.array(surchargeSchema).max(10),
})

export const taxRulesSchema = z.object({
  /** The tax year these rules are for: '2026-27'. */
  fy: z.string().regex(/^\d{4}-\d{2}$/),
  cessPercent: z.number().min(0).max(20),
  regimes: z.object({ new: regimeRulesSchema, old: regimeRulesSchema }),
  /** Old-regime caps, rupees a year. */
  caps: z.object({
    sec80c: rupees,
    sec80dSelf: rupees,
    sec80dSelfSenior: rupees,
    sec80dParents: rupees,
    sec80dParentsSenior: rupees,
    homeLoanInterest: rupees,
    nps80ccd1b: rupees,
    professionalTax: rupees,
  }),
  /** HRA: exempt share of basic in a metro / elsewhere, and the yearly rent above which the landlord's PAN is required. */
  hra: z.object({ metroPercent: z.number().min(0).max(100), nonMetroPercent: z.number().min(0).max(100), rentPercentOfBasic: z.number().min(0).max(100), landlordPanAboveRent: rupees }),
})

export type Slab = z.infer<typeof slabSchema>
export type RegimeRules = z.infer<typeof regimeRulesSchema>
export type TaxRules = z.infer<typeof taxRulesSchema>

export const DEFAULT_TAX_RULES: TaxRules = {
  fy: '2026-27',
  cessPercent: 4,
  regimes: {
    new: {
      slabs: [
        { upTo: 400_000, ratePercent: 0 },
        { upTo: 800_000, ratePercent: 5 },
        { upTo: 1_200_000, ratePercent: 10 },
        { upTo: 1_600_000, ratePercent: 15 },
        { upTo: 2_000_000, ratePercent: 20 },
        { upTo: 2_400_000, ratePercent: 25 },
        { upTo: null, ratePercent: 30 },
      ],
      standardDeduction: 75_000,
      rebate: { incomeUpTo: 1_200_000, maxRebate: 60_000, marginalRelief: true },
      surcharge: [
        { above: 5_000_000, ratePercent: 10 },
        { above: 10_000_000, ratePercent: 15 },
        { above: 20_000_000, ratePercent: 25 },
      ],
    },
    old: {
      slabs: [
        { upTo: 250_000, ratePercent: 0 },
        { upTo: 500_000, ratePercent: 5 },
        { upTo: 1_000_000, ratePercent: 20 },
        { upTo: null, ratePercent: 30 },
      ],
      standardDeduction: 50_000,
      rebate: { incomeUpTo: 500_000, maxRebate: 12_500, marginalRelief: false },
      surcharge: [
        { above: 5_000_000, ratePercent: 10 },
        { above: 10_000_000, ratePercent: 15 },
        { above: 20_000_000, ratePercent: 25 },
        { above: 50_000_000, ratePercent: 37 },
      ],
    },
  },
  caps: {
    sec80c: 150_000,
    sec80dSelf: 25_000,
    sec80dSelfSenior: 50_000,
    sec80dParents: 25_000,
    sec80dParentsSenior: 50_000,
    homeLoanInterest: 200_000,
    nps80ccd1b: 50_000,
    professionalTax: 2_500,
  },
  hra: { metroPercent: 50, nonMetroPercent: 40, rentPercentOfBasic: 10, landlordPanAboveRent: 100_000 },
}

/** Slabs must rise and end with an open slab. */
function slabsInOrder(slabs: readonly Slab[]): boolean {
  if (slabs[slabs.length - 1]?.upTo !== null) return false
  const bounds = slabs.slice(0, -1).map((s) => s.upTo)
  return bounds.every((b, i) => b !== null && (i === 0 || b > (bounds[i - 1] ?? 0)))
}

/** Stored rules, or the defaults when missing or malformed (with the reason, so the Console can say so). */
export function readTaxRules(stored: unknown): { rules: TaxRules; error: string | null } {
  if (stored == null) return { rules: DEFAULT_TAX_RULES, error: null }
  const parsed = taxRulesSchema.safeParse(stored)
  if (!parsed.success) return { rules: DEFAULT_TAX_RULES, error: parsed.error.issues[0]?.message ?? 'Unreadable rules' }
  const bad = REGIMES.find((r) => !slabsInOrder(parsed.data.regimes[r].slabs))
  if (bad) return { rules: DEFAULT_TAX_RULES, error: `The ${bad} regime slabs must rise and end with an open slab (upTo null).` }
  return { rules: parsed.data, error: null }
}

export const mergeTaxRules = (stored: unknown): TaxRules => readTaxRules(stored).rules
