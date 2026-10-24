import type { ProductKey } from '@/lib/catalog'
import type { UsageKind } from '@/lib/usage-kinds'

/**
 * Day 1, 3 and 7 onboarding emails (console spec 5.5). Pure. Each email
 * features one first step; when the workspace's UsageEvents show the step is
 * already done (or its product is switched off), that email is skipped.
 */

export const ONBOARDING_DAYS = [1, 3, 7] as const
export type OnboardingDay = (typeof ONBOARDING_DAYS)[number]
/** After this many days without sending a step it is too late for it (a missed cron day still catches up). */
const SEND_WINDOW_DAYS = 2
const DAY_MS = 86_400_000

export type OnboardingStep = {
  day: OnboardingDay
  product: ProductKey
  /** Any of these usage events means the step is done. */
  doneWhen: readonly UsageKind[]
}

export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  { day: 1, product: 'work', doneWhen: ['task_created'] },
  { day: 3, product: 'muster', doneWhen: ['attendance_marked'] },
  { day: 7, product: 'folio', doneWhen: ['invoice_issued'] },
]

export type OnboardingInput = {
  createdAt: Date
  now: Date
  /** Usage kinds the workspace has recorded at least once. */
  done: ReadonlySet<string>
  /** Products the workspace can open. */
  products: readonly ProductKey[]
}

/** Whole days since signup. */
export const daysSinceSignup = (createdAt: Date, now: Date) => Math.floor((now.getTime() - createdAt.getTime()) / DAY_MS)

/** The onboarding email due now, or null (not its day yet, too late, already done or product off). */
export function dueOnboardingStep(input: OnboardingInput): OnboardingStep | null {
  const age = daysSinceSignup(input.createdAt, input.now)
  const step = [...ONBOARDING_STEPS].reverse().find((s) => age >= s.day && age < s.day + SEND_WINDOW_DAYS)
  if (!step) return null
  if (!input.products.includes(step.product)) return null
  if (step.doneWhen.some((kind) => input.done.has(kind))) return null
  return step
}

/** The Message dedupeKey of an onboarding email. */
export const onboardingKey = (day: OnboardingDay) => `onboarding-day-${day}`
