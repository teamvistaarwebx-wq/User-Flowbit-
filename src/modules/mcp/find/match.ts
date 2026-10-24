/**
 * The fuzzy matcher behind flowbit_find and plan name resolution (pure).
 * "Vikram" → member Vikram Joshi 0.85; "ramesh@kalpa.in" → lead 1.0;
 * "Kalpa" → two clients both 0.8 → ambiguous. Confidence is 0..1.
 */

export const RECORD_KINDS = ['member', 'client', 'project', 'task', 'lead', 'deal'] as const
export type RecordKind = (typeof RECORD_KINDS)[number]

export type Candidate = Readonly<{
  kind: RecordKind
  id: string
  name: string
  /** Extra names: email, phone, task key, project code, contact names. */
  aliases?: readonly string[]
  detail?: string
  link?: string
}>

export type Match = Candidate & Readonly<{ confidence: number; why: string }>

/** Above this a single match is taken without asking. */
export const SURE = 0.8
/** Two matches this close to each other are ambiguous. */
export const AMBIGUITY_GAP = 0.08
/** Below this a candidate is not shown at all. */
export const MIN_CONFIDENCE = 0.45

/** Words an AI adds around a name ("the homepage task", "client Kalpa"). */
const FILLER = new Set(['the', 'a', 'an', 'task', 'client', 'project', 'lead', 'deal', 'from', 'wala', 'wali', 'ka', 'ki'])

const squash = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9@.+]/g, '')
const words = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter(Boolean)
const digits = (s: string) => s.replace(/\D/g, '')
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim())
const isPhone = (s: string) => /^\+?[\d\s()-]{7,20}$/.test(s.trim()) && digits(s).length >= 7

/** Levenshtein distance, capped for speed on long strings. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    for (let j = 1; j <= b.length; j++) row.push(Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)))
    prev = row
  }
  return prev[b.length]
}

const similarity = (a: string, b: string) => (a.length && b.length ? 1 - editDistance(a, b) / Math.max(a.length, b.length) : 0)

const phoneSame = (a: string, b: string) => {
  const x = digits(a)
  const y = digits(b)
  return x.length >= 7 && y.length >= 7 && (x.endsWith(y.slice(-10)) || y.endsWith(x.slice(-10)))
}

/** How well `query` names one string (a name or an alias), with the reason. */
function scoreText(query: string, text: string): { score: number; why: string } {
  const q = squash(query)
  const t = squash(text)
  if (!q || !t) return { score: 0, why: '' }
  if (q === t) return { score: 1, why: 'exact' }
  const qw = words(query).filter((w) => !FILLER.has(w))
  const tw = words(text)
  if (qw.length && qw.every((w) => tw.includes(w))) return { score: qw.length === tw.length ? 0.97 : 0.86, why: 'all words' }
  if (qw.length && qw.every((w) => tw.some((x) => x.startsWith(w)))) return { score: 0.8, why: 'word start' }
  if (t.startsWith(q) && q.length >= 3) return { score: 0.78, why: 'starts with' }
  if (q.length >= 4 && t.includes(q)) return { score: 0.68, why: 'contains' }
  const whole = similarity(q, t)
  const best = Math.max(whole, ...qw.flatMap((w) => tw.map((x) => (w.length >= 4 ? similarity(w, x) * (qw.length === 1 ? 0.95 : 0.85) : 0))))
  return best >= 0.7 ? { score: best * 0.75, why: 'similar spelling' } : { score: 0, why: '' }
}

/** Confidence that `query` means `c`. Emails and phones match exactly or not at all. */
export function scoreCandidate(query: string, c: Candidate): { confidence: number; why: string } {
  const q = query.trim()
  const names = [c.name, ...(c.aliases ?? [])].filter(Boolean)
  if (isEmail(q)) {
    const hit = names.some((n) => n.trim().toLowerCase() === q.toLowerCase())
    return hit ? { confidence: 1, why: 'same email' } : { confidence: 0, why: '' }
  }
  if (isPhone(q)) {
    const hit = names.some((n) => isPhone(n) && phoneSame(n, q))
    return hit ? { confidence: 1, why: 'same phone' } : { confidence: 0, why: '' }
  }
  let best = { score: 0, why: '' }
  for (const [i, n] of names.entries()) {
    const s = scoreText(q, n)
    // An alias (code, key) counts a little less than the name, except an exact one.
    const score = i === 0 || s.score === 1 ? s.score : s.score * 0.95
    if (score > best.score) best = { score, why: i === 0 ? s.why : `${s.why} (${n})` }
  }
  return { confidence: Math.round(best.score * 100) / 100, why: best.why }
}

/** Candidates for `query`, best first, at most `limit`. */
export function rankMatches(query: string, candidates: readonly Candidate[], limit = 5): Match[] {
  return candidates
    .map((c) => ({ ...c, ...scoreCandidate(query, c) }))
    .filter((m) => m.confidence >= MIN_CONFIDENCE)
    .sort((a, b) => b.confidence - a.confidence || a.name.localeCompare(b.name))
    .slice(0, limit)
}

export type Resolution =
  | Readonly<{ status: 'sure'; match: Match; others: Match[] }>
  | Readonly<{ status: 'ambiguous'; match: Match; others: Match[] }>
  | Readonly<{ status: 'weak'; match: Match; others: Match[] }>
  | Readonly<{ status: 'none' }>

/** One answer for plan resolution: sure, ambiguous (close runner-up), weak (low confidence) or none. */
export function resolve(matches: readonly Match[]): Resolution {
  const [top, ...rest] = matches
  if (!top) return { status: 'none' }
  const close = rest.filter((m) => top.confidence - m.confidence < AMBIGUITY_GAP)
  if (close.length) return { status: 'ambiguous', match: top, others: close }
  if (top.confidence >= SURE) return { status: 'sure', match: top, others: rest }
  return { status: 'weak', match: top, others: rest }
}

/** "Vikram → Vikram Joshi (member)". */
export const describeMatch = (query: string, m: Pick<Match, 'name' | 'kind'>) => `${query} → ${m.name} (${m.kind})`

/** First three letters of each word, for a cheap database pre-filter before scoring. */
export function prefilterStems(query: string): string[] {
  if (isEmail(query) || isPhone(query)) return []
  return [...new Set(words(query).filter((w) => w.length >= 2).map((w) => w.slice(0, 3)))].slice(0, 5)
}

export const queryIsEmail = isEmail
export const queryIsPhone = isPhone
export const phoneDigits = digits
