import { canWrite } from '@/lib/entitlements'

/**
 * Whether a workspace may take a captured lead right now (pure): it must
 * exist, not be deleted or disabled, and have write access to Orbit (an
 * active plan that includes it, not read-only). Every capture path — the
 * website form, the webhook and the IndiaMART pull — goes through this.
 */

type CaptureOrg = Parameters<typeof canWrite>[0]

export const CAPTURE_CLOSED = 'This workspace cannot take new leads right now.'

/** Null when the lead may be captured, otherwise the reason it is refused. */
export function captureRefusal(org: CaptureOrg | null | undefined, now: Date = new Date()): string | null {
  if (!org || org.deletedAt || org.disabled) return CAPTURE_CLOSED
  return canWrite(org, 'orbit', now) ? null : CAPTURE_CLOSED
}
