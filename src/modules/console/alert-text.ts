/**
 * Sales alerts (console spec 8: "a hit limit or an Upgrade click alerts
 * Sales"): wording and the once-a-day key. Pure.
 */

export type AlertKind = 'limit_hit' | 'upgrade_clicked'
export const ALERT_KINDS: readonly AlertKind[] = ['limit_hit', 'upgrade_clicked']

const LIMIT_WORD: Record<string, string> = { seats: 'the Free plan’s 5 people', logins: 'its seat limit', persons: 'its seat limit', employees: 'its Muster employee limit', orbit: 'its Orbit seats', folio: 'its Folio users', firms: 'its Folio firms' }

export function alertTitle(kind: AlertKind, orgName: string, meta?: Record<string, unknown> | null): string {
  if (kind === 'upgrade_clicked') return `${orgName} clicked Upgrade`
  const limit = typeof meta?.limit === 'string' ? LIMIT_WORD[meta.limit] ?? 'a plan limit' : 'a plan limit'
  return `${orgName} hit ${limit}`
}

/** One alert per workspace, kind and IST day. */
export const alertKey = (kind: AlertKind, orgId: string, day: string) => `${kind}:${orgId}:${day}`
