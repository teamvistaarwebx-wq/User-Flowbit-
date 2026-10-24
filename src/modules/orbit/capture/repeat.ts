import { OPEN_LEAD_STAGES } from '../constants'
import { CAPTURE_SOURCES, type LeadDraft } from './map'

/**
 * Repeat enquiries (pure): a captured lead whose email or phone matches an
 * open lead is the same buyer (a double-submitted form, or the website and
 * IndiaMART both). It is logged as a note on the open lead instead of
 * becoming a second lead with a second alert.
 */

/** The query for an open lead with the same email or phone; null when the draft has neither. */
export function openDuplicateFilter(draft: Pick<LeadDraft, 'email' | 'phone'>): Record<string, unknown> | null {
  const or = [...(draft.email ? [{ email: draft.email }] : []), ...(draft.phone ? [{ phone: draft.phone }] : [])]
  return or.length ? { stage: { $in: [...OPEN_LEAD_STAGES] }, $or: or } : null
}

/**
 * The note logged on the open lead. Its title carries the sender's enquiry id
 * when there is one, so a re-delivered enquiry (IndiaMART's overlapping pull)
 * is noted once.
 */
export function repeatNote(draft: LeadDraft): Readonly<{ title: string; notes: string }> {
  const label = CAPTURE_SOURCES[draft.source].label
  const title = `Repeat enquiry from ${label}${draft.externalId ? ` (#${draft.externalId})` : ''}`
  const lines = [
    draft.contactName && draft.contactName !== draft.companyName ? `${draft.contactName}, ${draft.companyName}` : draft.companyName,
    [draft.phone, draft.email].filter(Boolean).join(' · '),
    draft.notes,
  ]
  return { title, notes: lines.filter(Boolean).join('\n').slice(0, 4000) }
}
