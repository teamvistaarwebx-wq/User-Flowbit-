/**
 * Poll rules (pure): building the options, casting a vote (single or
 * multiple choice, once per member, changeable until the poll closes) and the
 * results a viewer sees. In an anonymous poll the voters are stored (so each
 * member votes once) but never shown to anyone, the author included.
 */

export const MIN_POLL_OPTIONS = 2
export const MAX_POLL_OPTIONS = 8

export type PollOption = { key: string; label: string; voterIds: string[] }
export type Poll = { options: PollOption[]; multiple: boolean; anonymous: boolean; closesAt?: Date | null; closedAt?: Date | null }

export type VoteResult = { ok: true; poll: Poll } | { ok: false; error: string }

/** Trims, drops blanks and repeats (case-insensitive); keys are a, b, c… Returns an error when fewer than two remain. */
export function buildPollOptions(labels: readonly string[]): { ok: true; options: PollOption[] } | { ok: false; error: string } {
  const seen = new Set<string>()
  const clean = labels.map((l) => l.trim()).filter((l) => l && !seen.has(l.toLowerCase()) && seen.add(l.toLowerCase()))
  if (clean.length < MIN_POLL_OPTIONS) return { ok: false, error: `Add at least ${MIN_POLL_OPTIONS} different options.` }
  if (clean.length > MAX_POLL_OPTIONS) return { ok: false, error: `A poll can have at most ${MAX_POLL_OPTIONS} options.` }
  return { ok: true, options: clean.map((label, i) => ({ key: String.fromCharCode(97 + i), label, voterIds: [] })) }
}

/** Closed by hand, or its close date has passed. */
export const isPollClosed = (poll: Pick<Poll, 'closesAt' | 'closedAt'>, now: Date): boolean => Boolean(poll.closedAt) || (poll.closesAt ? new Date(poll.closesAt) <= now : false)

/**
 * Replaces the member's vote with `keys` (an empty list withdraws it). Single choice takes exactly one
 * option; unknown options and closed polls are refused. Returns a new poll (no mutation).
 */
export function castVote(poll: Poll, memberId: string, keys: readonly string[], now: Date): VoteResult {
  if (isPollClosed(poll, now)) return { ok: false, error: 'This poll is closed.' }
  const chosen = [...new Set(keys)]
  if (chosen.some((k) => !poll.options.some((o) => o.key === k))) return { ok: false, error: 'That option is not in this poll.' }
  if (!poll.multiple && chosen.length > 1) return { ok: false, error: 'Pick one option.' }
  const options = poll.options.map((o) => {
    const others = o.voterIds.filter((id) => id !== memberId)
    return { ...o, voterIds: chosen.includes(o.key) ? [...others, memberId] : others }
  })
  return { ok: true, poll: { ...poll, options } }
}

export type PollView = {
  multiple: boolean
  anonymous: boolean
  closed: boolean
  closesAt: string | null
  /** People who voted at least once. */
  voters: number
  mine: string[]
  options: { key: string; label: string; votes: number; percent: number; names: string[] }[]
}

/** What a viewer sees: counts and percentages (of voters), their own choice, and names unless anonymous. */
export function pollView(poll: Poll, memberId: string, now: Date, nameOf: (id: string) => string): PollView {
  const voters = new Set(poll.options.flatMap((o) => o.voterIds)).size
  return {
    multiple: poll.multiple,
    anonymous: poll.anonymous,
    closed: isPollClosed(poll, now),
    closesAt: poll.closesAt ? new Date(poll.closesAt).toISOString() : null,
    voters,
    mine: poll.options.filter((o) => o.voterIds.includes(memberId)).map((o) => o.key),
    options: poll.options.map((o) => ({
      key: o.key,
      label: o.label,
      votes: o.voterIds.length,
      percent: voters ? Math.round((o.voterIds.length / voters) * 100) : 0,
      names: poll.anonymous ? [] : o.voterIds.map(nameOf),
    })),
  }
}
