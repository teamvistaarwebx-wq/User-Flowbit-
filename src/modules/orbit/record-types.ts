/** Shapes passed from Orbit's server pages to its client components. Pure types. */
import type { ActivityStatus, ActivityType, Channel, LeadStage } from './constants'

export type RecordKind = 'lead' | 'deal' | 'client'
export type RecordHit = { kind: RecordKind; id: string; label: string; sub: string; clientId?: string }

export type Option = { value: string; label: string; hint?: string }

/** A planned or done activity row as client components see it. */
export type ActivityItem = {
  id: string
  type: ActivityType
  status: ActivityStatus
  channel: Channel
  title: string
  notes: string
  dueDate: string | null
  dueTime: string | null
  occurredAt: string | null
  meetingLink: string | null
  assigneeName: string
  creatorName: string
  related: { kind: RecordKind; id: string; label: string; href: string } | null
  cancelReason: string | null
}

export type LeadCardData = {
  id: string
  columnId: string
  companyName: string
  contactName: string
  designation: string
  email: string
  ownerId: string
  sector: string
  sectorLabel: string
  source: string
  sourceLabel: string
  stage: LeadStage
  icpScore: number | null
  valuePaise: number | null
  ownerName: string
  nextDue: string | null
  nextTitle: string | null
  daysSinceTouch: number
  stale: boolean
  canEdit: boolean
  hasMeetingHeld: boolean
}

export type DealCardData = {
  id: string
  columnId: string
  title: string
  clientName: string
  valuePaise: number
  probability: number
  expectedCloseDate: string | null
  ownerName: string
  daysInStage: number
  nextDue: string | null
  nextTitle: string | null
  source: string | null
  canEdit: boolean
  status: 'open' | 'won' | 'lost'
}

/** What the dialogs need from Orbit settings (client-safe subset). */
export type OrbitChoices = {
  sources: { key: string; label: string; warm: boolean }[]
  sectors: { key: string; label: string; primary: boolean }[]
  lostReasons: Option[]
  wonReasons: Option[]
  dealStages: { key: string; label: string; probability: number; color: string }[]
  owners: Option[]
  reviewers: Option[]
}

/** One entry of a merged timeline (activities + stage changes), newest first. */
export type TimelineEntryData =
  | { kind: 'activity'; at: string; item: ActivityItem }
  | { kind: 'stage'; at: string; id: string; from: string | null; to: string; who: string; reason: string | null; entity: 'lead' | 'deal' }
