/**
 * Cron health for the public status page (pure): each scheduled job's last
 * finished run against its schedule in vercel.json. A job is late when its
 * last finish is older than two intervals plus a grace period, failed when
 * its last run threw, and "not run yet" before its first run.
 */

export type CronSchedule = Readonly<{ path: string; schedule: string }>
export type CronRow = Readonly<{ _id: string; finishedAt?: Date | null; lastOk?: boolean | null }>
export type CronState = 'ok' | 'late' | 'failed' | 'never'
export type CronStatus = Readonly<{ job: string; label: string; everyMinutes: number; state: CronState; lastRunAt: Date | null }>

const GRACE_MIN = 10
const DAY_MIN = 24 * 60

const LABELS: Record<string, string> = {
  messages: 'Email and message delivery',
  automations: 'Automations',
  posts: 'Scheduled posts',
  sequences: 'Orbit sequences',
  briefs: 'Daily briefs',
  'lead-sources': 'Lead sources',
  meetings: 'Meeting notes',
  health: 'Client health',
  'task-reminders': 'Task reminders',
  'follow-up-reminders': 'Follow-up reminders',
  folio: 'Invoices and reminders',
  'trial-reminders': 'Trial reminders',
  lifecycle: 'Workspace lifecycle',
  billing: 'Billing',
}

/** Minutes between runs for the cron expressions Flowbit uses ("*\/5 * * * *", "30 2 * * *"); a day for anything else. */
export function intervalMinutes(schedule: string): number {
  const [minute, hour] = schedule.trim().split(/\s+/)
  const every = /^\*\/(\d+)$/.exec(minute ?? '')
  if (every && hour === '*') return Number(every[1])
  if (/^\d+$/.test(minute ?? '') && hour === '*') return 60
  return DAY_MIN
}

/** One entry per job (catch-up `?resume=1` deliveries are the same job), in schedule order. */
export function cronJobs(schedules: readonly CronSchedule[]): Array<{ job: string; everyMinutes: number }> {
  const seen = new Map<string, number>()
  for (const s of schedules) {
    const job = s.path.split('?')[0].replace(/^\/api\/cron\//, '')
    if (!job || s.path.includes('?')) continue
    seen.set(job, Math.min(seen.get(job) ?? Infinity, intervalMinutes(s.schedule)))
  }
  return [...seen].map(([job, everyMinutes]) => ({ job, everyMinutes }))
}

export function cronStatuses(schedules: readonly CronSchedule[], rows: readonly CronRow[], now: Date): CronStatus[] {
  const byId = new Map(rows.map((r) => [r._id, r]))
  return cronJobs(schedules).map(({ job, everyMinutes }) => {
    const row = byId.get(job)
    const lastRunAt = row?.finishedAt ?? null
    const ageMin = lastRunAt ? (now.getTime() - lastRunAt.getTime()) / 60_000 : Infinity
    const state: CronState = !lastRunAt ? 'never' : row?.lastOk === false ? 'failed' : ageMin > everyMinutes * 2 + GRACE_MIN ? 'late' : 'ok'
    return { job, label: LABELS[job] ?? job, everyMinutes, state, lastRunAt }
  })
}

export type OverallState = 'operational' | 'degraded' | 'down'

/** Down when the app cannot reach its database; degraded when storage, email or a job is unwell. */
export function overallState(input: Readonly<{ db: boolean; storage: boolean; emailConfigured: boolean; crons: readonly CronStatus[] }>): OverallState {
  if (!input.db) return 'down'
  if (!input.storage || !input.emailConfigured || input.crons.some((c) => c.state === 'failed' || c.state === 'late')) return 'degraded'
  return 'operational'
}
