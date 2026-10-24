import { describe, expect, it } from 'vitest'
import { cronJobs, cronStatuses, intervalMinutes, overallState } from './cron-health'
import vercel from '../../../vercel.json'

const NOW = new Date('2026-10-09T10:00:00Z')
const ago = (min: number) => new Date(NOW.getTime() - min * 60_000)

describe('status page: cron health', () => {
  it('reads the intervals Flowbit schedules', () => {
    expect(intervalMinutes('*/5 * * * *')).toBe(5)
    expect(intervalMinutes('*/15 * * * *')).toBe(15)
    expect(intervalMinutes('30 2 * * *')).toBe(1440)
  })

  it('lists each job of vercel.json once, without the catch-up deliveries', () => {
    const jobs = cronJobs(vercel.crons).map((j) => j.job)
    expect(jobs).toContain('messages')
    expect(jobs).toContain('billing')
    expect(new Set(jobs).size).toBe(jobs.length)
    expect(jobs.some((j) => j.includes('?'))).toBe(false)
  })

  it('marks jobs on time, late, failed or not run yet', () => {
    const schedules = [{ path: '/api/cron/messages', schedule: '*/5 * * * *' }, { path: '/api/cron/folio', schedule: '30 3 * * *' }, { path: '/api/cron/billing', schedule: '45 3 * * *' }, { path: '/api/cron/posts', schedule: '*/15 * * * *' }]
    const rows = [{ _id: 'messages', finishedAt: ago(4), lastOk: true }, { _id: 'folio', finishedAt: ago(60 * 50), lastOk: true }, { _id: 'billing', finishedAt: ago(60), lastOk: false }]
    const states = Object.fromEntries(cronStatuses(schedules, rows, NOW).map((c) => [c.job, c.state]))
    expect(states).toEqual({ messages: 'ok', folio: 'late', billing: 'failed', posts: 'never' })
  })

  it('is down without the database and degraded when a part is unwell', () => {
    expect(overallState({ db: false, storage: true, emailConfigured: true, crons: [] })).toBe('down')
    expect(overallState({ db: true, storage: true, emailConfigured: false, crons: [] })).toBe('degraded')
    expect(overallState({ db: true, storage: true, emailConfigured: true, crons: [{ job: 'x', label: 'x', everyMinutes: 5, state: 'late', lastRunAt: ago(30) }] })).toBe('degraded')
    expect(overallState({ db: true, storage: true, emailConfigured: true, crons: [{ job: 'x', label: 'x', everyMinutes: 5, state: 'never', lastRunAt: null }] })).toBe('operational')
  })
})
