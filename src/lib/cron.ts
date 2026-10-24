import 'server-only'
import { NextResponse } from 'next/server'
import { isCronAuthorised } from '@/lib/cron-auth'
import { todayIST } from '@/lib/dates'
import { dbConnect } from '@/lib/db'
import { serverEnv } from '@/lib/env'
import { CRON_TIME_BUDGET_MS, hasUnfinishedRun, orgsToVisit } from '@/lib/cron-progress'
import { withLease } from '@/lib/lease'
import { elevated, type SystemDb } from '@/lib/platform'
import { CronLock } from '@/models/CronLock'
import { Org } from '@/models/Org'

const activeOrgs = (db: SystemDb) => db.raw(Org).find({ deletedAt: null, disabled: { $ne: true } }).sort({ _id: 1 }).lean()
export type CronOrg = Awaited<ReturnType<typeof activeOrgs>>[number]
export type OrgOutcome<T> = { orgId: string; name: string; result?: T; error?: string }

/**
 * Runs `fn` for every live workspace that `include` accepts, one at a time.
 * A failing workspace is logged and reported; the others still run. Called
 * only under the job's lease (runCronJob). Once CRON_TIME_BUDGET_MS is spent
 * it starts no further workspace and records where it stopped; the next
 * delivery the same day resumes after the last workspace finished.
 */
export async function eachOrg<T>(db: SystemDb, job: string, include: (org: CronOrg) => boolean, fn: (org: CronOrg) => Promise<T>): Promise<OrgOutcome<T>[]> {
  const startedAt = Date.now()
  const asOf = todayIST()
  const progress = await CronLock.findById(job, { runAsOf: 1, lastOrgId: 1, complete: 1 }).lean()
  const orgs = orgsToVisit(await activeOrgs(db), progress, asOf)
  const resuming = hasUnfinishedRun(progress, asOf)
  await CronLock.updateOne({ _id: job }, { $set: { runAsOf: asOf, complete: false, ...(resuming ? {} : { lastOrgId: null }) } }, { upsert: true })

  const outcomes: OrgOutcome<T>[] = []
  for (const [index, org] of orgs.entries()) {
    if (Date.now() - startedAt > CRON_TIME_BUDGET_MS) {
      console.warn(`[cron ${job}] time budget spent; ${orgs.length - index} workspace(s) left for the catch-up run`)
      return outcomes
    }
    if (include(org)) outcomes.push(await runForOrg(job, org, fn))
    await CronLock.updateOne({ _id: job }, { $set: { lastOrgId: org._id } })
  }
  await CronLock.updateOne({ _id: job }, { $set: { complete: true } })
  return outcomes
}

async function runForOrg<T>(job: string, org: CronOrg, fn: (org: CronOrg) => Promise<T>): Promise<OrgOutcome<T>> {
  try {
    return { orgId: String(org._id), name: org.name, result: await fn(org) }
  } catch (error) {
    console.error(`[cron ${job}] ${org.name} (${String(org._id)})`, error)
    return { orgId: String(org._id), name: org.name, error: 'This workspace’s run failed; see the server log.' }
  }
}

/** Runs `fn` while holding the job's lease; `{ ran: false }` when another run of the same job holds it. */
export const withCronLock = <T>(job: string, fn: () => Promise<T>) => withLease(job, fn)

/** True when today's run of `job` stopped at its time budget and has workspaces left. */
export async function cronRunUnfinished(job: string, asOf: string = todayIST()): Promise<boolean> {
  await dbConnect()
  return hasUnfinishedRun(await CronLock.findById(job, { runAsOf: 1, complete: 1 }).lean(), asOf)
}

/** Runs a job once under its lease with cross-org access; `asOf` is today in IST. */
export async function runCronJob<T>(job: string, run: (db: SystemDb, asOf: string) => Promise<T>) {
  const asOf = todayIST()
  const outcome = await withCronLock(job, () => elevated(`cron ${job}`, (db) => run(db, asOf)))
  return { asOf, outcome }
}

/**
 * GET handler for /api/cron/<job>: Vercel Cron calls it with
 * `Authorization: Bearer <CRON_SECRET>`. Idempotent: every job may run again
 * the same day without repeating a reminder or a draft. `?resume=1` (the
 * catch-up delivery) runs only when today's run stopped at its time budget.
 */
export function cronHandler<T>(job: string, run: (db: SystemDb, asOf: string) => Promise<T>) {
  return async function GET(request: Request): Promise<Response> {
    const secret = serverEnv().CRON_SECRET
    if (!secret) return NextResponse.json({ error: 'CRON_SECRET is not set on this server.' }, { status: 503 })
    if (!isCronAuthorised(request.headers.get('authorization'), secret)) return NextResponse.json({ error: 'Not authorised.' }, { status: 401 })
    const headers = { 'cache-control': 'no-store' }
    try {
      if (new URL(request.url).searchParams.get('resume') === '1' && !(await cronRunUnfinished(job))) {
        return NextResponse.json({ job, asOf: todayIST(), skipped: 'Today’s run finished; nothing to resume.' }, { headers })
      }
      const { asOf, outcome } = await runCronJob(job, run)
      if (!outcome.ran) return NextResponse.json({ job, asOf, skipped: 'Another run of this job is in progress.' }, { headers })
      const complete = !(await cronRunUnfinished(job, asOf))
      return NextResponse.json({ job, asOf, complete, result: outcome.result }, { headers })
    } catch (error) {
      console.error(`[cron ${job}] failed`, error)
      return NextResponse.json({ job, error: 'The job failed; see the server log.' }, { status: 500, headers })
    }
  }
}
