import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { hasUnfinishedRun, orgsToVisit } from './cron-progress'

const orgs = [{ _id: '650000000000000000000003' }, { _id: '650000000000000000000001' }, { _id: '650000000000000000000002' }]
const ids = (list: { _id: string }[]) => list.map((o) => o._id.slice(-1))

describe('cron progress', () => {
  it('visits every workspace, oldest id first, when there is no unfinished run today', () => {
    expect(ids(orgsToVisit(orgs, null, '2026-10-03'))).toEqual(['1', '2', '3'])
    expect(ids(orgsToVisit(orgs, { runAsOf: '2026-10-03', lastOrgId: '650000000000000000000001', complete: true }, '2026-10-03'))).toEqual(['1', '2', '3'])
  })

  it('resumes after the last finished workspace when today’s run stopped early', () => {
    const progress = { runAsOf: '2026-10-03', lastOrgId: '650000000000000000000001', complete: false }
    expect(hasUnfinishedRun(progress, '2026-10-03')).toBe(true)
    expect(ids(orgsToVisit(orgs, progress, '2026-10-03'))).toEqual(['2', '3'])
  })

  it('starts over on a new day even when yesterday’s run was cut short', () => {
    const progress = { runAsOf: '2026-10-02', lastOrgId: '650000000000000000000002', complete: false }
    expect(hasUnfinishedRun(progress, '2026-10-03')).toBe(false)
    expect(ids(orgsToVisit(orgs, progress, '2026-10-03'))).toEqual(['1', '2', '3'])
  })

  it('schedules a catch-up delivery for every daily job', () => {
    const { crons } = JSON.parse(readFileSync('vercel.json', 'utf8')) as { crons: { path: string; schedule: string }[] }
    // Daily jobs run at a fixed minute and hour; the every-few-minutes ones (messages, briefs) need no catch-up.
    const isDaily = (schedule: string) => /^\d+ \d+ \* \* \*$/.test(schedule)
    const main = crons.filter((c) => !c.path.includes('?') && isDaily(c.schedule))
    expect(main.length).toBeGreaterThan(0)
    for (const job of main) expect(crons.some((c) => c.path === `${job.path}?resume=1`)).toBe(true)
  })
})
