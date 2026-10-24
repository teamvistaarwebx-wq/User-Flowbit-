import { formatDate, todayIST } from '@/lib/dates'
import type { TaskPriority } from './constants'
import { dueDateFor, matchDate, matchTime } from './quick-parse-dates'

/**
 * Natural-language quick add: "kal 5 baje @vikram #design !acme p1 logo bhejo" →
 * title "logo bhejo", due tomorrow 17:00 (IST), Vikram, project Design, client Acme, urgent.
 * Pure and client-safe; the input shows each token as a chip, and a dismissed chip
 * (its `key` in `skip`) stays part of the title.
 */

export type QuickTokenKind = 'date' | 'time' | 'assignee' | 'project' | 'list' | 'space' | 'client' | 'priority'
export type QuickToken = { key: string; kind: QuickTokenKind; raw: string; label: string }

export type QuickOption = { id: string; name: string; code?: string; leaveDates?: string[] }
export type QuickListOption = { id: string; name: string; spaceId: string }
export type QuickOptions = {
  people: QuickOption[]
  projects: QuickOption[]
  spaces: (QuickOption & { listIds: string[] })[]
  lists: QuickListOption[]
  clients: QuickOption[]
}

export type QuickParse = {
  title: string
  tokens: QuickToken[]
  dueDate?: string
  dueTime?: string
  assigneeIds: string[]
  priority?: TaskPriority
  projectId?: string
  spaceId?: string
  folderId?: string
  clientId?: string
}

export const EMPTY_QUICK_OPTIONS: QuickOptions = { people: [], projects: [], spaces: [], lists: [], clients: [] }

const PRIORITY_WORDS: Record<string, TaskPriority> = { p1: 'urgent', p2: 'high', p3: 'medium', p4: 'low', '!!': 'high', '!!!': 'urgent' }
const PRIORITY_NAME: Record<TaskPriority, string> = { urgent: 'Urgent', high: 'High', medium: 'Medium', low: 'Low' }
/** Little words that only tie a date to the sentence ("by friday", "kal tak"). */
const DATE_LEAD = new Set(['by', 'on', 'before', 'at'])
const DATE_TAIL = new Set(['tak', 'ko', 'se', 'pe', 'par'])

type Word = { text: string; norm: string }

const normalise = (s: string) => s.toLowerCase().replace(/[.,;:]+$/, '')
const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/** How well `query` matches an option: 5 exact code, 4 exact name, 3 first word, 2 prefix, 1 contains, 0 none. */
export function fuzzyScore(query: string, option: QuickOption): number {
  const q = squash(query)
  if (q.length < 2) return 0
  const name = squash(option.name)
  const first = squash(option.name.split(/\s+/)[0] ?? '')
  if (option.code && squash(option.code) === q) return 5
  if (name === q) return 4
  if (first === q) return 3
  if (name.startsWith(q)) return 2
  return name.includes(q) ? 1 : 0
}

/** Best fuzzy match: exact code, exact name, first word, then prefix, then contains. */
export function fuzzyFind<T extends QuickOption>(query: string, options: readonly T[]): T | undefined {
  return bestMatch(query, options).best
}

function bestMatch<T extends QuickOption>(query: string, options: readonly T[]): { best?: T; s: number } {
  return options.reduce<{ best?: T; s: number }>((acc, o) => {
    const s = fuzzyScore(query, o)
    return s > acc.s ? { best: o, s } : acc
  }, { s: 0 })
}

/** `nextDay`: a night time after midnight, due the day after the date given ("kal raat 1 baje"). */
type Hit = { used: number; token: Omit<QuickToken, 'key' | 'raw'>; apply: (p: QuickParse) => QuickParse; nextDay?: boolean }

function matchSigil(word: Word, opts: QuickOptions): Hit | null {
  const sigil = word.norm[0]
  const name = word.norm.slice(1)
  if (sigil === '@') {
    const person = fuzzyFind(name, opts.people)
    return person ? { used: 1, token: { kind: 'assignee', label: person.name }, apply: (p) => ({ ...p, assigneeIds: [...new Set([...p.assigneeIds, person.id])] }) } : null
  }
  if (sigil === '#') return matchPlace(name, opts)
  if (sigil === '!' && !name.startsWith('!')) {
    const client = fuzzyFind(name, opts.clients)
    return client ? { used: 1, token: { kind: 'client', label: client.name }, apply: (p) => ({ ...p, clientId: client.id }) } : null
  }
  return null
}

/**
 * "#x": the best-scoring project, list or space, scored together so an exact list name
 * beats a project that only contains the word. Ties go to project, then list, then space.
 * A space is offered only when it has exactly one list, since a task must live in a list.
 */
function matchPlace(name: string, opts: QuickOptions): Hit | null {
  const project = bestMatch(name, opts.projects)
  const list = bestMatch(name, opts.lists)
  const space = bestMatch(name, opts.spaces.filter((s) => s.listIds.length === 1))
  const top = Math.max(project.s, list.s, space.s)
  if (top === 0) return null
  if (project.best && project.s === top) {
    const p = project.best
    return { used: 1, token: { kind: 'project', label: p.code ? `${p.code} · ${p.name}` : p.name }, apply: (r) => ({ ...r, projectId: p.id }) }
  }
  if (list.best && list.s === top) {
    const l = list.best
    const owner = opts.spaces.find((s) => s.id === l.spaceId)
    return { used: 1, token: { kind: 'list', label: owner ? `${owner.name} / ${l.name}` : l.name }, apply: (r) => ({ ...r, spaceId: l.spaceId, folderId: l.id }) }
  }
  const sp = space.best
  if (!sp) return null
  return { used: 1, token: { kind: 'space', label: sp.name }, apply: (r) => ({ ...r, spaceId: sp.id, folderId: sp.listIds[0] }) }
}

function matchAt(words: Word[], i: number, opts: QuickOptions, today: string, seen: Set<QuickTokenKind>): Hit | null {
  const norms = words.map((w) => w.norm)
  const priority = PRIORITY_WORDS[norms[i]]
  if (priority && !seen.has('priority')) return { used: 1, token: { kind: 'priority', label: PRIORITY_NAME[priority] }, apply: (p) => ({ ...p, priority }) }
  const sigil = matchSigil(words[i], opts)
  if (sigil) return sigil
  const lead = DATE_LEAD.has(norms[i]) ? 1 : 0
  const date = seen.has('date') ? null : matchDate(norms, i + lead, today)
  if (date) {
    const used = lead + date.used + (DATE_TAIL.has(norms[i + lead + date.used]) ? 1 : 0)
    return { used, token: { kind: 'date', label: formatDate(date.date, { withWeekday: true, short: true }) }, apply: (p) => ({ ...p, dueDate: date.date }) }
  }
  const time = seen.has('time') ? null : matchTime(norms, i + lead)
  if (time) {
    const used = lead + time.used + (DATE_TAIL.has(norms[i + lead + time.used]) ? 1 : 0)
    return { used, token: { kind: 'time', label: formatClock(time.time) }, apply: (p) => ({ ...p, dueTime: time.time }), nextDay: time.nextDay }
  }
  return null
}

/** "17:00" → "5:00 pm". */
export function formatClock(time: string): string {
  const [h, m] = time.split(':').map(Number)
  const suffix = h >= 12 ? 'pm' : 'am'
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${suffix}`
}

export function parseQuickAdd(text: string, opts: QuickOptions = EMPTY_QUICK_OPTIONS, now: Date = new Date(), skip: readonly string[] = []): QuickParse {
  const words: Word[] = text.split(/\s+/).filter(Boolean).map((t) => ({ text: t, norm: normalise(t) }))
  const today = todayIST(now)
  const seen = new Set<QuickTokenKind>()
  const kept: string[] = []
  let nextDay = false
  let result: QuickParse = { title: '', tokens: [], assigneeIds: [] }
  for (let i = 0; i < words.length; ) {
    const hit = matchAt(words, i, opts, today, seen)
    const raw = hit ? words.slice(i, i + hit.used).map((w) => w.text).join(' ') : ''
    const key = hit ? `${hit.token.kind}:${raw.toLowerCase()}` : ''
    if (!hit || skip.includes(key)) {
      kept.push(words[i].text)
      i += 1
      continue
    }
    seen.add(hit.token.kind)
    if (hit.nextDay) nextDay = true
    result = { ...hit.apply(result), tokens: [...result.tokens, { ...hit.token, key, raw }] }
    i += hit.used
  }
  if (result.dueTime) result = { ...result, dueDate: dueDateFor(result.dueDate, { used: 0, time: result.dueTime, nextDay }, now) }
  return { ...result, title: kept.join(' ').trim() }
}

/** Search options from the Tasks data (people, projects, spaces and their lists, clients). */
export function quickOptionsFrom(data: {
  people: { id: string; name: string; active: boolean; leaveDates?: string[] }[]
  projects: { id: string; name: string; code: string }[]
  spaces: { id: string; name: string; folders: { id: string; name: string }[] }[]
  clients: { id: string; name: string }[]
}): QuickOptions {
  return {
    people: data.people.filter((p) => p.active).map((p) => ({ id: p.id, name: p.name, ...(p.leaveDates ? { leaveDates: p.leaveDates } : {}) })),
    projects: data.projects.map((p) => ({ id: p.id, name: p.name, code: p.code })),
    spaces: data.spaces.map((s) => ({ id: s.id, name: s.name, listIds: s.folders.map((f) => f.id) })),
    lists: data.spaces.flatMap((s) => s.folders.map((f) => ({ id: f.id, name: f.name, spaceId: s.id }))),
    clients: data.clients.map((c) => ({ id: c.id, name: c.name })),
  }
}
