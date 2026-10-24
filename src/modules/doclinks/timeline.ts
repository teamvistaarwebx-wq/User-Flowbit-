/**
 * The document timeline (notifications-v2 §1.1, §1.4): sent, delivered,
 * opened link, accepted, paid. Built from the document's Message rows and its
 * DocEvents (pure).
 */

export const DOC_EVENT_TYPES = ['opened', 'accepted', 'declined', 'utr_shared', 'paid'] as const
export type DocEventType = (typeof DOC_EVENT_TYPES)[number]

export type TimelineTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

export type DocTimelineEntry = Readonly<{ at: Date; label: string; detail?: string; tone: TimelineTone }>

export type TimelineMessage = Readonly<{
  channel: string
  status: string
  to?: readonly string[]
  createdAt: Date
  sentAt?: Date | null
  timeline?: readonly { at: Date; status: string; note?: string | null }[]
}>

export type TimelineEvent = Readonly<{ type: DocEventType; at: Date; name?: string | null; comment?: string | null; utr?: string | null; amountPaise?: number | null }>

const CHANNEL: Readonly<Record<string, string>> = { email: 'email', whatsapp: 'WhatsApp', inapp: 'in-app' }

/** The delivery steps a message reached, each once, in order. */
function messageEntries(m: TimelineMessage): DocTimelineEntry[] {
  const via = CHANNEL[m.channel] ?? m.channel
  const to = m.to?.length ? m.to.join(', ') : undefined
  const steps = m.timeline ?? []
  const first = (status: string) => steps.find((s) => s.status === status)?.at
  const sentAt = m.sentAt ?? first('sent')
  const entries: DocTimelineEntry[] = []
  if (sentAt) entries.push({ at: sentAt, label: `Sent by ${via}`, detail: to, tone: 'info' })
  const delivered = first('delivered')
  if (delivered) entries.push({ at: delivered, label: `Delivered by ${via}`, detail: to, tone: 'info' })
  const read = first('read')
  if (read) entries.push({ at: read, label: `Read on ${via}`, tone: 'info' })
  if (m.status === 'failed') entries.push({ at: first('failed') ?? m.createdAt, label: `Not delivered by ${via}`, detail: steps.at(-1)?.note ?? undefined, tone: 'danger' })
  if (m.status === 'skipped' && !sentAt) entries.push({ at: m.createdAt, label: `Saved, not sent by ${via}`, detail: steps.at(-1)?.note ?? undefined, tone: 'neutral' })
  return entries
}

const rupees = (paise: number | null | undefined) => (paise ? `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : undefined)

function eventEntry(e: TimelineEvent): DocTimelineEntry {
  switch (e.type) {
    case 'opened':
      return { at: e.at, label: 'Opened the link', tone: 'neutral' }
    case 'accepted':
      return { at: e.at, label: `Accepted${e.name ? ` by ${e.name}` : ''}`, detail: e.comment ?? undefined, tone: 'success' }
    case 'declined':
      return { at: e.at, label: `Declined${e.name ? ` by ${e.name}` : ''}`, detail: e.comment ?? undefined, tone: 'warning' }
    case 'utr_shared':
      return { at: e.at, label: 'Client says it is paid', detail: [e.utr ? `UTR ${e.utr}` : null, rupees(e.amountPaise)].filter(Boolean).join(' · ') || undefined, tone: 'warning' }
    case 'paid':
      return { at: e.at, label: 'Paid online', detail: rupees(e.amountPaise), tone: 'success' }
  }
}

/** Oldest first. */
export function buildDocTimeline(messages: readonly TimelineMessage[], events: readonly TimelineEvent[]): DocTimelineEntry[] {
  return [...messages.flatMap(messageEntries), ...events.map(eventEntry)].sort((a, b) => a.at.getTime() - b.at.getTime())
}
