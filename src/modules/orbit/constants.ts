/**
 * Orbit vocabulary: lead stages (fixed, they define Cold % and Warm %),
 * activity types and channels, and the defaults a workspace's Orbit settings
 * start from. Pure, client-safe.
 */

export const LEAD_STAGES = ['new', 'contacted', 'engaged', 'meeting_booked', 'meeting_done', 'converted', 'lost', 'disqualified'] as const
export type LeadStage = (typeof LEAD_STAGES)[number]

export const OPEN_LEAD_STAGES = ['new', 'contacted', 'engaged', 'meeting_booked', 'meeting_done'] as const
export type OpenLeadStage = (typeof OPEN_LEAD_STAGES)[number]
export const CLOSED_LEAD_STAGES = ['converted', 'lost', 'disqualified'] as const

export const LEAD_STAGE_RANK: Record<LeadStage, number> = {
  new: 0, contacted: 1, engaged: 2, meeting_booked: 3, meeting_done: 4, converted: 5, lost: 99, disqualified: 99,
}

export const LEAD_STAGE_LABEL: Record<LeadStage, string> = {
  new: 'New', contacted: 'Contacted', engaged: 'Engaged', meeting_booked: 'Meeting booked', meeting_done: 'Meeting done',
  converted: 'Converted', lost: 'Lost', disqualified: 'Disqualified',
}

export const LEAD_STAGE_RULE: Record<LeadStage, string> = {
  new: 'Sourced and added. No outreach yet.',
  contacted: 'At least one outreach logged (DM, email or call).',
  engaged: 'They replied. Any human response counts, positive or not.',
  meeting_booked: 'Invite accepted, date on record.',
  meeting_done: 'Meeting happened and notes are logged.',
  converted: 'Became a client and a deal. Continue on the deal.',
  lost: 'Closed without a deal. Needs a reason.',
  disqualified: 'Not ICP, no budget or wrong fit. Needs a reason.',
}

/** Colour intensifies as a lead approaches money; only success uses mint. */
export const LEAD_STAGE_COLOR: Record<LeadStage, string> = {
  new: '#7E768C', contacted: '#7C93C8', engaged: '#60A5FA', meeting_booked: '#6366F1', meeting_done: '#8B5CF6',
  converted: '#5EEAB0', lost: '#F0507A', disqualified: '#7E768C',
}

export const isOpenLead = (stage: string): stage is OpenLeadStage => (OPEN_LEAD_STAGES as readonly string[]).includes(stage)

export const ACTIVITY_TYPES = ['dm', 'email', 'call', 'follow_up', 'reply', 'meeting', 'note'] as const
export type ActivityType = (typeof ACTIVITY_TYPES)[number]
export const PLANNABLE_TYPES = ['follow_up', 'call', 'email', 'dm', 'meeting'] as const
export type PlannableType = (typeof PLANNABLE_TYPES)[number]
export const OUTREACH_TYPES = ['dm', 'email', 'call', 'follow_up'] as const
export const ACTIVITY_STATUSES = ['done', 'planned', 'cancelled'] as const
export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number]

export const ACTIVITY_DONE_LABEL: Record<ActivityType, string> = {
  dm: 'DM sent', email: 'Email sent', call: 'Call made', follow_up: 'Follow-up sent', reply: 'Reply received', meeting: 'Meeting held', note: 'Note',
}
export const ACTIVITY_LABEL: Record<ActivityType, string> = {
  dm: 'DM', email: 'Email', call: 'Call', follow_up: 'Follow-up', reply: 'Reply', meeting: 'Meeting', note: 'Note',
}

export const CHANNELS = ['instagram', 'linkedin', 'email', 'phone', 'whatsapp', 'video', 'in_person', 'other'] as const
export type Channel = (typeof CHANNELS)[number]
export const CHANNEL_LABEL: Record<Channel, string> = {
  instagram: 'Instagram', linkedin: 'LinkedIn', email: 'Email', phone: 'Phone', whatsapp: 'WhatsApp', video: 'Video call', in_person: 'In person', other: 'Other',
}

/** Sensible channel for a newly logged activity. */
export function defaultChannel(type: ActivityType, source?: string): Channel {
  if (type === 'dm') return source === 'instagram' || source === 'linkedin' ? source : 'whatsapp'
  if (type === 'email') return 'email'
  if (type === 'call') return 'phone'
  if (type === 'meeting') return 'video'
  return 'other'
}

export const DEAL_STATUSES = ['open', 'won', 'lost'] as const
export type DealStatus = (typeof DEAL_STATUSES)[number]

export const STAGE_COLORS = { sky: '#60A5FA', indigo: '#6366F1', violet: '#8B5CF6', orchid: '#BB62A5', amber: '#F5B85C', mint: '#5EEAB0' } as const
export type StageColor = keyof typeof STAGE_COLORS
export const STAGE_COLOR_KEYS = Object.keys(STAGE_COLORS) as StageColor[]

export type DealStageDef = { key: string; label: string; probability: number; color: StageColor; order: number }
export type SourceDef = { key: string; label: string; warm: boolean; active: boolean; order: number }
export type SectorDef = { key: string; label: string; primary: boolean; active: boolean; order: number }
export type ReasonDef = { key: string; label: string; active: boolean; order: number }
export type Targets = { coldMinPct: number; coldMaxPct: number; warmPct: number; weeklyNewLeads: number; weeklyOutreach: number; monthlyMeetings: number }

const ordered = <T extends object>(items: T[]) => items.map((item, order) => ({ ...item, order }))

export const DEFAULT_DEAL_STAGES: DealStageDef[] = ordered([
  { key: 'discovery', label: 'Discovery', probability: 20, color: 'sky' as StageColor },
  { key: 'proposal', label: 'Proposal sent', probability: 40, color: 'indigo' as StageColor },
  { key: 'negotiation', label: 'Negotiation', probability: 70, color: 'violet' as StageColor },
])

export const DEFAULT_SOURCES: SourceDef[] = ordered([
  { key: 'instagram', label: 'Instagram', warm: false, active: true },
  { key: 'linkedin', label: 'LinkedIn', warm: false, active: true },
  { key: 'email_outreach', label: 'Email outreach', warm: false, active: true },
  { key: 'referral', label: 'Referral', warm: true, active: true },
  { key: 'inbound', label: 'Inbound', warm: true, active: true },
  { key: 'event', label: 'Event', warm: true, active: true },
  { key: 'website', label: 'Website', warm: false, active: true },
  { key: 'other', label: 'Other', warm: false, active: true },
])

export const DEFAULT_SECTORS: SectorDef[] = ordered([
  { key: 'd2c', label: 'D2C', primary: true, active: true },
  { key: 'real_estate', label: 'Real Estate', primary: false, active: true },
  { key: 'dev_ngo', label: 'Development & NGO', primary: false, active: true },
  { key: 'other', label: 'Other', primary: false, active: true },
])

export const DEFAULT_LOST_REASONS: ReasonDef[] = ordered(
  [
    ['no_budget', 'No budget'],
    ['no_response', 'No response after 5 follow-ups'],
    ['not_icp', 'Not ICP / wrong segment'],
    ['has_agency', 'Already has an agency'],
    ['timing', 'Timing - revisit next quarter'],
    ['price_too_high', 'Price too high'],
    ['competitor', 'Went with a competitor'],
    ['wrong_contact', 'Wrong contact / gatekeeper'],
    ['inactive', 'Company inactive or closed'],
    ['other', 'Other'],
  ].map(([key, label]) => ({ key, label, active: true })),
)

export const DEFAULT_WON_REASONS: ReasonDef[] = ordered(
  [
    ['referral_trust', 'Referral or trust'],
    ['proof', 'Case studies and proof'],
    ['price_fit', 'Price fit'],
    ['speed', 'Speed of response'],
    ['other', 'Other'],
  ].map(([key, label]) => ({ key, label, active: true })),
)

export const DEFAULT_TARGETS: Targets = { coldMinPct: 3, coldMaxPct: 5, warmPct: 15, weeklyNewLeads: 50, weeklyOutreach: 150, monthlyMeetings: 8 }
export const DEFAULT_STALE_DAYS = 7

export const PAGE_SIZE = 25
export const BOARD_COLUMN_LIMIT = 100
/** Done activities may be backdated at most this many days. */
export const BACKDATE_DAYS = 7
export const IMPORT_MAX_ROWS = 2000

/** 'Email outreach' -> 'email_outreach'. Keys never change once created. */
export function keyFromLabel(label: string): string {
  return label
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'item'
}

/** Label for a settings key, falling back to a readable key. */
export function labelFrom(list: readonly { key: string; label: string }[], key: string | null | undefined): string {
  if (!key) return '—'
  return list.find((i) => i.key === key)?.label ?? key.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())
}
