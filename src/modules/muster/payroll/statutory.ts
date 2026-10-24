import { z } from 'zod'

/**
 * Statutory rates (pure). Rates, ceilings and slabs are data, never constants
 * in the engine: Finance records them as dated versions and the engine applies
 * whatever version covers the payroll month. Amounts here are rupees, the way
 * the law states them.
 */

export const pfSchema = z.object({
  enabled: z.boolean(),
  employeeRatePercent: z.number().min(0).max(25),
  employerRatePercent: z.number().min(0).max(25),
  /** Rupees. */
  wageCeiling: z.number().min(0).max(100_000),
  applyCeiling: z.boolean(),
  /** Reduce the ceiling in proportion to payable days in an LOP month. */
  prorateCeiling: z.boolean().default(false),
})

export const esiSchema = z.object({
  enabled: z.boolean(),
  employeeRatePercent: z.number().min(0).max(10),
  employerRatePercent: z.number().min(0).max(10),
  /** Rupees of full monthly gross at or below which a person is covered. */
  grossEligibilityLimit: z.number().min(0).max(100_000),
})

export const ptSlabSchema = z.object({
  /** Upper bound in rupees; null = "and above". */
  upTo: z.number().min(0).nullable(),
  amount: z.number().min(0).max(2500),
})

export const ptScheduleSchema = z.object({
  state: z.string().length(2),
  enabled: z.boolean(),
  slabs: z.array(ptSlabSchema).min(1),
  /** A month that collects a different amount (MP: ₹212 in one month to reach ₹2,500 a year). */
  monthOverrides: z.array(z.object({ month: z.number().int().min(1).max(12), amount: z.number().min(0).max(2500) })).default([]),
})

export const lwfScheduleSchema = z.object({
  state: z.string().length(2),
  enabled: z.boolean().default(false),
  employeeAmount: z.number().min(0).max(1000).default(10),
  employerAmount: z.number().min(0).max(1000).default(50),
  remittanceMonths: z.array(z.number().int().min(1).max(12)).default([6, 12]),
})

export const statutorySettingsSchema = z.object({
  pf: pfSchema,
  esi: esiSchema,
  /** manual: TDS added by hand as an adjustment; auto: computed each month from the tax worksheet (modules/muster/tax). */
  tds: z.object({ enabled: z.boolean(), mode: z.enum(['manual', 'auto']).default('manual') }),
  pt: z.array(ptScheduleSchema),
  lwf: z.array(lwfScheduleSchema),
})

export type PfSettings = z.infer<typeof pfSchema>
export type EsiSettings = z.infer<typeof esiSchema>
export type PtSchedule = z.infer<typeof ptScheduleSchema>
export type LwfSchedule = z.infer<typeof lwfScheduleSchema>
export type StatutorySettings = z.infer<typeof statutorySettingsSchema>

export const MP_PT_SLABS = [
  { upTo: 18750, amount: 0 },
  { upTo: 25000, amount: 125 },
  { upTo: 33333, amount: 167 },
  { upTo: null, amount: 208 },
]

/** The EPF wage ceiling by law (it was ₹15,000 from Sep 2014). Reference for the defaults and the settings notice, never read by the engine. */
export const EPF_WAGE_CEILING = { rupees: 25000, effectiveFrom: '2026-09-17', notification: 'S.O. 5109(E)' } as const

/** Starting values only: Finance confirms them against the company's own registrations. */
export const DEFAULT_STATUTORY: StatutorySettings = {
  pf: { enabled: true, employeeRatePercent: 12, employerRatePercent: 12, wageCeiling: EPF_WAGE_CEILING.rupees, applyCeiling: true, prorateCeiling: false },
  esi: { enabled: true, employeeRatePercent: 0.75, employerRatePercent: 3.25, grossEligibilityLimit: 21000 },
  tds: { enabled: true, mode: 'manual' as const },
  pt: [{ state: 'MP', enabled: true, slabs: MP_PT_SLABS, monthOverrides: [] }],
  lwf: [{ state: 'MP', enabled: false, employeeAmount: 10, employerAmount: 50, remittanceMonths: [6, 12] }],
}

export type StatutorySection = keyof StatutorySettings
const SECTIONS = Object.keys(statutorySettingsSchema.shape) as StatutorySection[]

/**
 * Reads stored settings section by section. A missing or malformed section falls back to its default and is
 * named in `unreadable` (payroll refuses an unreadable PF or ESI section, see `statutoryBlock`); every other
 * section is kept exactly as stored, so a confirmed version keeps the ceiling it was confirmed with.
 */
export function readStatutory(value: unknown): { settings: StatutorySettings; unreadable: StatutorySection[] } {
  const stored: Partial<Record<StatutorySection, unknown>> = value !== null && typeof value === 'object' ? value : {}
  const read = SECTIONS.map((key) => ({ key, result: statutorySettingsSchema.shape[key].safeParse(stored[key]) }))
  const settings = Object.fromEntries(read.map(({ key, result }) => [key, result.success ? result.data : DEFAULT_STATUTORY[key]])) as StatutorySettings
  return { settings, unreadable: read.filter(({ result }) => !result.success).map(({ key }) => key) }
}

/** Reads stored settings; a missing or malformed section falls back to its default, the rest are kept as stored. */
export function parseStatutory(value: unknown): StatutorySettings {
  return readStatutory(value).settings
}

/** Sections payroll never fills in from defaults: a default PF or ESI rate would change every person's pay. */
const NEVER_DEFAULTED = [['pf', 'PF'], ['esi', 'ESI']] as const

/** The unreadable sections that block payroll, by name ("PF", "ESI"). */
export function blockingSections(unreadable: readonly string[]): string[] {
  return NEVER_DEFAULTED.filter(([key]) => unreadable.includes(key)).map(([, name]) => name)
}

/**
 * The PF ceiling (rupees) of rates that still cap PF below the legal ceiling on `today`, or null.
 * Only tells Finance: stored rates are never changed, a new version has to be proposed and confirmed.
 */
export function outdatedPfCeiling(settings: StatutorySettings, today: string): number | null {
  const { pf } = settings
  if (today < EPF_WAGE_CEILING.effectiveFrom || !pf.enabled || !pf.applyCeiling) return null
  return pf.wageCeiling < EPF_WAGE_CEILING.rupees ? pf.wageCeiling : null
}

export const ptScheduleFor =(settings: StatutorySettings, state: string | null | undefined): PtSchedule | null =>
  (state && settings.pt.find((s) => s.state === state.toUpperCase())) || null

export const lwfScheduleFor = (settings: StatutorySettings, state: string | null | undefined): LwfSchedule | null =>
  (state && settings.lwf.find((s) => s.state === state.toUpperCase())) || null

/** Professional tax in rupees for a month's earned gross (rupees). */
export function professionalTaxFor(schedule: PtSchedule | null, grossRupees: number, month: number): number {
  if (!schedule?.enabled) return 0
  const slabs = [...schedule.slabs].sort((a, b) => (a.upTo === null ? 1 : b.upTo === null ? -1 : a.upTo - b.upTo))
  const slab = slabs.find((s) => s.upTo === null || grossRupees <= s.upTo)
  if (!slab || slab.amount === 0) return 0
  const override = schedule.monthOverrides.find((o) => o.month === month)
  // An override raises the top slab's month (MP's ₹212); lower slabs keep their own amount.
  return override && slab.upTo === null ? override.amount : slab.amount
}
