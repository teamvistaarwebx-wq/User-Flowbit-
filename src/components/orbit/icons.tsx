import type { ComponentType, SVGProps } from 'react'
import {
  AtSign, Ban, Building2, CalendarCheck, CalendarDays, CalendarPlus, CircleDashed, CircleX, Globe, Handshake, Inbox, Mail, MessageCircle,
  MessageSquareReply, Phone, RefreshCw, Send, ShoppingBag, StickyNote, Trophy, UserPlus, Users, Video,
} from 'lucide-react'
import type { ActivityType, Channel, LeadStage } from '@/modules/orbit/constants'
import { InstagramIcon, LinkedinIcon, WhatsappIcon } from './brand-icons'

type IconType = ComponentType<SVGProps<SVGSVGElement> & { size?: number | string; className?: string }>

export const STAGE_ICON: Record<LeadStage, IconType> = {
  new: CircleDashed, contacted: Send, engaged: MessageSquareReply, meeting_booked: CalendarPlus, meeting_done: CalendarCheck, converted: Trophy, lost: CircleX, disqualified: Ban,
}

export const ACTIVITY_ICON: Record<ActivityType, IconType> = {
  dm: MessageCircle, email: Mail, call: Phone, follow_up: RefreshCw, reply: MessageSquareReply, meeting: Video, note: StickyNote,
}

/**
 * Kept for callers: the activity colour is no longer drawn. A type is told apart by its glyph, as the dashboard
 * tells task rows apart, and colour stays reserved for meaning (late, won, lost).
 */
export const ACTIVITY_COLOR: Record<ActivityType, string> = {
  dm: 'var(--text)', email: 'var(--text)', call: 'var(--text)', follow_up: 'var(--text)', reply: 'var(--text)', meeting: 'var(--text)', note: 'var(--text)',
}

const SECTOR_ICONS: Record<string, IconType> = { d2c: ShoppingBag, real_estate: Building2, dev_ngo: Handshake }
const SOURCE_ICONS: Record<string, IconType> = {
  instagram: InstagramIcon, linkedin: LinkedinIcon, devnetjobs: Globe, referral: UserPlus, inbound: Inbox, event: CalendarDays, website: Globe, email_outreach: Mail,
}
const CHANNEL_ICONS: Partial<Record<Channel, IconType>> = { instagram: InstagramIcon, linkedin: LinkedinIcon, whatsapp: WhatsappIcon, phone: Phone, email: Mail, video: Video, in_person: Users }

export const channelIcon = (key: Channel): IconType => CHANNEL_ICONS[key] ?? AtSign

/** The activity type as a plain 16px outline glyph in a fixed 20px column (no tinted chip). */
export function ActivityTypeIcon({ type, className }: { type: ActivityType; className?: string }) {
  const Icon = ACTIVITY_ICON[type]
  return (
    <span aria-hidden className={`flex h-5 w-5 shrink-0 items-center justify-center text-white ${className ?? ''}`}>
      <Icon className="size-4" />
    </span>
  )
}

/** The icon for a sector or source key (a static lookup, so boards can render it per card). */
export function KeyIcon({ kind, value, className, size = 14 }: { kind: 'sector' | 'source'; value: string; className?: string; size?: number }) {
  const Icon = kind === 'sector' ? (SECTOR_ICONS[value] ?? Building2) : (SOURCE_ICONS[value] ?? AtSign)
  return <Icon className={className} size={size} />
}

/** Icon + label for a sector or source. */
export function KeyLabel({ kind, value, label, className }: { kind: 'sector' | 'source'; value: string; label: string; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-white ${className ?? ''}`}>
      <KeyIcon kind={kind} value={value} className="size-[15px] text-icon-muted" />
      {label}
    </span>
  )
}
