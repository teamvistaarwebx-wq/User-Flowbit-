/**
 * Status -> colour tone, shared by every product so "overdue" is the same red
 * everywhere. StatusPill reads this; pass `tone` to override.
 */

export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'pink' | 'orange' | 'violet' | 'orchid' | 'neutral'

const TONES: Record<string, Tone> = {
  // work
  todo: 'neutral', in_progress: 'info', in_review: 'violet', blocked: 'pink', done: 'success',
  low: 'neutral', medium: 'warning', high: 'orange', urgent: 'danger',
  planning: 'neutral', active: 'success', on_hold: 'warning', completed: 'success', cancelled: 'neutral', canceled: 'neutral',
  on_track: 'success', at_risk: 'warning', off_track: 'danger',
  // approvals
  draft: 'neutral', pending: 'warning', submitted: 'info', approved: 'success', rejected: 'danger', withdrawn: 'neutral',
  // attendance
  present: 'success', late: 'warning', half_day: 'orange', absent: 'danger', leave: 'violet', holiday: 'pink', weekoff: 'neutral', on_duty: 'info',
  work_from_home: 'info', sick_leave: 'violet', paid_half_day: 'warning',
  // money
  issued: 'info', sent: 'info', part_paid: 'warning', paid: 'success', overdue: 'danger', void: 'neutral', unpaid: 'warning', refunded: 'neutral',
  accepted: 'success', expired: 'danger', converted: 'success',
  // crm
  lead: 'info', open: 'info', won: 'success', lost: 'danger', new: 'info', contacted: 'violet', qualified: 'orchid', cold: 'info', warm: 'orange', hot: 'danger',
  // people / members
  invited: 'warning', disabled: 'neutral', inactive: 'neutral', probation: 'warning', notice: 'orange', exited: 'neutral', onboarding: 'info',
  // payroll
  generated: 'info', reviewed: 'violet', locked: 'orchid', released: 'success', published: 'success', on_hold_pay: 'warning',
  // subscription
  trialing: 'info', past_due: 'danger',
  // letters
  revoked: 'danger',
}

export const statusTone = (status: string | null | undefined): Tone => (status ? (TONES[status] ?? 'neutral') : 'neutral')

/** Keys whose words don't split on their own ('todo' reads as "To do" in the task UI). */
const LABEL_OVERRIDES: Record<string, string> = { todo: 'To do', work_from_home: 'Work from home', weekoff: 'Week off', paid_half_day: 'Half day (paid)' }

/** 'in_progress' -> 'In progress', 'half_day' -> 'Half day'. */
export function statusLabel(status: string | null | undefined): string {
  if (!status) return '—'
  if (LABEL_OVERRIDES[status]) return LABEL_OVERRIDES[status]
  const text = status.replace(/[_-]+/g, ' ').trim()
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** CSS colour (variable) for a tone, for charts and dots. */
export const TONE_COLOR: Record<Tone, string> = {
  success: 'var(--success)', warning: 'var(--warning)', danger: 'var(--danger)', info: 'var(--info)', pink: 'var(--pink)',
  orange: 'var(--orange)', violet: 'var(--violet)', orchid: 'var(--orchid)', neutral: 'var(--text-3)',
}
