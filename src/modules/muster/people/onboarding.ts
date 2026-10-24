import { docLabel } from '../settings/defaults'
import { LIFECYCLE, statusLabelOf, type EmployeeStatus } from './lifecycle'

/**
 * Joining documents (pure): how far a joiner is with the documents HR made
 * mandatory, and whether that is enough to start work. A person below the
 * threshold stays before joining; an HR admin can let them start anyway,
 * with a reason.
 */

export type OnboardingRules = { mandatoryDocuments: readonly string[]; thresholdPercent: number }
export type OnboardingStatus = { percent: number; done: number; total: number; missing: string[]; threshold: number; ready: boolean }

/** Share of the mandatory documents on file (100% when nothing is mandatory). */
export function onboardingStatus(rules: OnboardingRules, uploaded: readonly string[]): OnboardingStatus {
  const have = new Set(uploaded)
  const missing = rules.mandatoryDocuments.filter((d) => !have.has(d))
  const total = rules.mandatoryDocuments.length
  const done = total - missing.length
  const percent = total ? Math.round((done / total) * 100) : 100
  return { percent, done, total, missing, threshold: rules.thresholdPercent, ready: percent >= rules.thresholdPercent }
}

const stageOf = (s: string) => LIFECYCLE[s as EmployeeStatus]?.stage
/** Moving from before joining (candidate, offered, joining pending) into work. */
export const startsWork = (from: string | null, to: string): boolean => stageOf(to) === 'working' && (from === null || stageOf(from) === 'pre_joining')

/** Why this move must wait for documents, or null. `from` is null for a new record. */
export function onboardingRefusal(input: { name: string; from: string | null; to: string; status: OnboardingStatus }): string | null {
  const { name, from, to, status } = input
  if (!startsWork(from, to) || status.ready) return null
  const missing = status.missing.map(docLabel).join(', ')
  return `${name}'s joining documents are ${status.percent}% complete; ${status.threshold}% is needed before they can be made ${statusLabelOf(to).toLowerCase()}. Missing: ${missing}. Upload them, or have an HR admin start them anyway with a reason.`
}
