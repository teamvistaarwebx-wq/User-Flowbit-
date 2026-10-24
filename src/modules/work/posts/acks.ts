import { csvLine } from '@/lib/csv-safe'

/**
 * Policy acknowledgements (pure): who in the audience has confirmed "I've
 * read this", who has not, who a reminder goes to and the CSV the author
 * downloads. The author never needs to acknowledge their own policy.
 */

/** Gap between two reminders to the same post's pending readers. */
export const ACK_REMIND_GAP_MS = 60 * 60_000

export type Ack = { memberId: string; at: Date | string }
export type AckPerson = { id: string; name: string; email?: string }
export type AckRow = { id: string; name: string; email: string; ackAt: string | null }

/** Audience rows with their acknowledgement time (acknowledged first, by time; then pending by name). The author is left out. */
export function ackRows(audience: readonly AckPerson[], acks: readonly Ack[], authorId: string): AckRow[] {
  const at = new Map(acks.map((a) => [String(a.memberId), new Date(a.at).toISOString()]))
  const rows = audience.filter((p) => p.id !== authorId).map((p) => ({ id: p.id, name: p.name, email: p.email ?? '', ackAt: at.get(p.id) ?? null }))
  const done = rows.filter((r) => r.ackAt).sort((a, b) => a.ackAt!.localeCompare(b.ackAt!))
  const pending = rows.filter((r) => !r.ackAt).sort((a, b) => a.name.localeCompare(b.name))
  return [...done, ...pending]
}

/** Who a reminder goes to: audience members (not the author) who have not acknowledged. */
export const pendingAckIds = (audienceIds: readonly string[], acks: readonly Ack[], authorId: string): string[] => {
  const acked = new Set(acks.map((a) => String(a.memberId)))
  return [...new Set(audienceIds)].filter((id) => id !== authorId && !acked.has(id))
}

/** Adds the member's acknowledgement once; returns the same list when already acknowledged (no mutation). */
export function withAck(acks: readonly Ack[], memberId: string, now: Date): Ack[] {
  return acks.some((a) => String(a.memberId) === memberId) ? [...acks] : [...acks, { memberId, at: now }]
}

/** Null when a reminder may go now, else when the next one may. */
export function nextReminderAt(lastRemindedAt: Date | null | undefined, now: Date): Date | null {
  if (!lastRemindedAt) return null
  const next = new Date(lastRemindedAt.getTime() + ACK_REMIND_GAP_MS)
  return next > now ? next : null
}

/** The acknowledgement list as CSV (formula-safe cells). */
export function acksCsv(rows: readonly AckRow[]): string {
  const lines = [['Name', 'Email', 'Status', 'Acknowledged at (UTC)'], ...rows.map((r) => [r.name, r.email, r.ackAt ? 'Acknowledged' : 'Pending', r.ackAt ?? ''])]
  return lines.map((cells) => csvLine(cells)).join('\r\n') + '\r\n'
}
