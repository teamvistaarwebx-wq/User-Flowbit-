import { z } from 'zod'

/**
 * Minutes of meeting (MOM) from a transcript: the shape Claude must return,
 * the prompt, matching owners to members, and merging the minutes into the
 * meeting's own agenda, notes and action items. Pure; action items are
 * drafts until someone presses the existing "Create task".
 */

export const MINUTES_MAX_ITEMS = 25

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const minutesSchema = z.object({
  agenda: z.array(z.string().trim().min(1).max(300)).max(20).default([]),
  notes: z.array(z.string().trim().min(1).max(600)).max(40).default([]),
  decisions: z.array(z.string().trim().min(1).max(400)).max(20).default([]),
  actionItems: z
    .array(z.object({ title: z.string().trim().min(2).max(200), owner: z.string().trim().max(80).nullish(), due: isoDay.nullish().catch(null) }))
    .max(MINUTES_MAX_ITEMS)
    .default([]),
})

export type Minutes = z.output<typeof minutesSchema>

export const MINUTES_SYSTEM = [
  'You write minutes of meeting (MOM) for an Indian team from a speaker-labelled transcript that may mix Hindi and English (Hinglish).',
  'Write in clear, plain English. Do not invent anything that was not said. Keep each point short.',
  'Reply with ONLY a JSON object: {"agenda": string[], "notes": string[], "decisions": string[], "actionItems": [{"title": string, "owner": string|null, "due": "YYYY-MM-DD"|null}]}.',
  'agenda: the topics discussed. notes: the key points. decisions: what was agreed. actionItems: concrete follow-ups, each starting with a verb, with the owner\'s name as spoken (or null) and a due date only when one was said (resolve "Friday" against the meeting date).',
].join(' ')

export function minutesPrompt(input: { title: string; date: string; attendees: readonly string[]; agenda: string | null; transcript: string }): string {
  return [
    `Meeting: ${input.title}`,
    `Date: ${input.date} (Asia/Kolkata)`,
    `Attendees: ${input.attendees.join(', ') || 'not listed'}`,
    input.agenda ? `Planned agenda:\n${input.agenda}` : '',
    'Transcript:',
    input.transcript,
  ]
    .filter(Boolean)
    .join('\n\n')
}

export type MemberName = Readonly<{ id: string; name: string }>

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim()

/**
 * The member an owner name means: an exact full name, else a unique first
 * name, else a unique member whose name contains it. Attendees are tried
 * first, then everyone; ambiguous or unknown names stay unassigned.
 */
export function matchOwner(owner: string | null | undefined, attendees: readonly MemberName[], members: readonly MemberName[]): string | null {
  const wanted = norm(owner ?? '')
  if (wanted.length < 2) return null
  for (const pool of [attendees, members]) {
    const exact = pool.filter((m) => norm(m.name) === wanted)
    if (exact.length === 1) return exact[0].id
    const first = pool.filter((m) => norm(m.name).split(' ')[0] === wanted.split(' ')[0])
    if (first.length === 1) return first[0].id
    const partial = pool.filter((m) => norm(m.name).includes(wanted))
    if (partial.length === 1) return partial[0].id
  }
  return null
}

export type ExistingMeeting = Readonly<{ agenda?: string | null; notes?: string | null; actionItems: readonly { title: string }[] }>
export type DraftItem = { title: string; assigneeId: string | null; dueDate: string | null }

const bullets = (items: readonly string[]) => items.map((i) => `- ${i}`).join('\n')

/**
 * What to write into the meeting: the agenda when it was empty, a "Minutes"
 * block appended to the notes (notes and decisions), and action items not
 * already on the meeting (same title) as drafts.
 */
export function mergeMinutes(meeting: ExistingMeeting, minutes: Minutes, owners: (owner: string | null | undefined) => string | null, stamp: string): { agenda: string | null; notes: string; newItems: DraftItem[] } {
  const agenda = !meeting.agenda?.trim() && minutes.agenda.length ? bullets(minutes.agenda).slice(0, 5000) : null
  const block = [`Minutes (${stamp})`, minutes.notes.length ? `Notes:\n${bullets(minutes.notes)}` : '', minutes.decisions.length ? `Decisions:\n${bullets(minutes.decisions)}` : ''].filter(Boolean).join('\n\n')
  const notes = [meeting.notes?.trim() ?? '', block].filter(Boolean).join('\n\n').slice(0, 20_000)
  const have = new Set(meeting.actionItems.map((a) => a.title.trim().toLowerCase()))
  const newItems = minutes.actionItems
    .filter((a) => !have.has(a.title.trim().toLowerCase()))
    .map((a) => ({ title: a.title.slice(0, 200), assigneeId: owners(a.owner), dueDate: a.due ?? null }))
  return { agenda, notes, newItems }
}

/** The minutes without AI (off, over the cap or failed): the transcript's first lines as notes, nothing invented. */
export function templateMinutes(transcript: string, reason: string): Minutes {
  const lines = transcript.split('\n').filter(Boolean).slice(0, 12)
  return { agenda: [], notes: [`AI minutes were not drafted (${reason}). The first lines of the transcript:`, ...lines.map((l) => l.slice(0, 600))].slice(0, 40), decisions: [], actionItems: [] }
}
