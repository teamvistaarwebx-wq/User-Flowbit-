import { sumPaise } from '../engine/money'

/** Pure billing-plan arithmetic (phases as a share of the value or a flat amount). */

export type PhaseLike = { position: number; name: string; percentOfTotal?: number | null; amountPaise?: number | null; status?: string | null }

/** A phase's amount: the flat amount when set, else its share of the value. `!= null`, so 0 counts. */
export function milestoneAmount(totalValuePaise: number, phase: Pick<PhaseLike, 'percentOfTotal' | 'amountPaise'>): number {
  if (phase.amountPaise != null) return phase.amountPaise
  return Math.round((totalValuePaise * (phase.percentOfTotal ?? 0)) / 100)
}

/** The first rule the phases break, or null. */
export function milestoneIssues(totalValuePaise: number, phases: readonly PhaseLike[]): string | null {
  const positions = new Set<number>()
  for (const phase of phases) {
    if (positions.has(phase.position)) return 'Two phases cannot share a position.'
    positions.add(phase.position)
    const hasPercent = phase.percentOfTotal != null
    const hasAmount = phase.amountPaise != null
    if (hasPercent === hasAmount) return `Phase "${phase.name}" needs either a share of the project value or a flat amount — not both, and not neither.`
  }
  const live = phases.filter((p) => p.status !== 'cancelled')
  if (sumPaise(live.map((p) => p.percentOfTotal ?? 0)) > 100) return 'The phases add up to more than 100% of the value.'
  if (sumPaise(live.map((p) => milestoneAmount(totalValuePaise, p))) > totalValuePaise) return 'The phases add up to more than the plan value.'
  return null
}

/** "{x}% / ₹y of ₹z allocated": the share and amount the phases cover. */
export function allocatedOf(totalValuePaise: number, phases: readonly PhaseLike[]): { percent: number; amountPaise: number } {
  const live = phases.filter((p) => p.status !== 'cancelled')
  const amountPaise = sumPaise(live.map((p) => milestoneAmount(totalValuePaise, p)))
  return { amountPaise, percent: totalValuePaise ? Math.round((amountPaise / totalValuePaise) * 1000) / 10 : 0 }
}
