import { Activity } from 'lucide-react'
import { Mesh } from '@/components/marketing/mesh'
import { Section } from '@/components/marketing/section'
import { SectionLabel } from '@/components/ui/card'
import { formatDateTime, timeAgo } from '@/lib/dates'
import { CronLock } from '@/models/CronLock'
import { cronStatuses, overallState, type CronState, type CronStatus, type OverallState } from '@/modules/status/cron-health'
import { healthSnapshot } from '@/modules/status/health'
import { pageMetadata } from '@/modules/marketing/seo'
import vercel from '../../../../vercel.json'

export const metadata = pageMetadata({
  title: 'Status',
  description: 'Whether Flowbit, its database, email and scheduled jobs are working right now.',
  path: '/status',
})

// Always the live state, never a cached copy.
export const dynamic = 'force-dynamic'

// TODO(owner): add an external uptime monitor (e.g. Better Stack or UptimeRobot polling
// https://<APP_URL>/api/health every minute) so an outage is noticed even when this page cannot load.

const OVERALL: Record<OverallState, { text: string; tone: string }> = {
  operational: { text: 'All systems working', tone: 'bg-success' },
  degraded: { text: 'Some parts need attention', tone: 'bg-warning' },
  down: { text: 'Flowbit is having trouble', tone: 'bg-danger' },
}

const CRON_TEXT: Record<CronState, { text: string; tone: string }> = {
  ok: { text: 'On time', tone: 'bg-success' },
  late: { text: 'Late', tone: 'bg-warning' },
  failed: { text: 'Last run failed', tone: 'bg-danger' },
  never: { text: 'Not run yet', tone: 'bg-white/30' },
}

const every = (m: number) => (m < 60 ? `every ${m} min` : m === 60 ? 'hourly' : 'daily')

function Row({ name, detail, state, tone }: { name: string; detail: string; state: string; tone: string }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
      <span className="min-w-0">
        <span className="block text-sm font-medium text-white">{name}</span>
        <span className="block text-xs text-white/55">{detail}</span>
      </span>
      <span className="inline-flex items-center gap-2 text-sm text-white/80">
        <span aria-hidden className={`size-2 rounded-full ${tone}`} />
        {state}
      </span>
    </li>
  )
}

async function cronRows(): Promise<CronStatus[] | null> {
  try {
    const rows = await CronLock.find({}, { finishedAt: 1, lastOk: 1 }).lean()
    return cronStatuses(vercel.crons, rows.map((r) => ({ _id: String(r._id), finishedAt: r.finishedAt ?? null, lastOk: r.lastOk ?? null })), new Date())
  } catch (error) {
    console.error('[status] cron state unavailable', error)
    return null
  }
}

/** The public status page: the app, its database, file storage, email and the scheduled jobs. No internal detail. */
export default async function StatusPage() {
  const health = await healthSnapshot()
  const crons = health.db ? await cronRows() : null
  const overall = overallState({ db: health.db, storage: health.storage, emailConfigured: health.email === 'resend', crons: crons ?? [] })
  const checkedAt = new Date()
  return (
    <>
      <section className="relative isolate overflow-hidden px-4 pb-4 pt-16 text-center sm:px-6 sm:pt-20">
        <Mesh className="-z-10" intensity="soft" />
        <SectionLabel icon={<Activity strokeWidth={1.5} />} className="justify-center">Status</SectionLabel>
        <h1 className="mx-auto mt-4 flex max-w-3xl items-center justify-center gap-3 text-balance text-[34px] font-semibold leading-[1.1] text-white sm:text-[44px]">
          <span aria-hidden className={`size-3 shrink-0 rounded-full ${OVERALL[overall].tone}`} />
          {OVERALL[overall].text}
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-white/70">Checked {formatDateTime(checkedAt)} IST. Reload for the latest.</p>
      </section>
      <Section className="pt-8 sm:pt-10">
        <div className="mx-auto grid max-w-3xl gap-4">
          <section aria-labelledby="services" className="lit-edge rounded-[14px] bg-white/[0.035] px-5 py-2">
            <h2 id="services" className="pt-3 text-xs font-semibold uppercase tracking-[0.06em] text-white/60">Services</h2>
            <ul className="divide-y divide-white/[0.06]">
              <Row name="App" detail="Pages and sign-in" state="Working" tone="bg-success" />
              <Row name="Database" detail="Your workspace data" state={health.db ? 'Working' : 'Not reachable'} tone={health.db ? 'bg-success' : 'bg-danger'} />
              <Row name="File storage" detail="Uploads, attachments and PDFs" state={health.storage ? 'Working' : 'Not reachable'} tone={health.storage ? 'bg-success' : 'bg-danger'} />
              <Row name="Email" detail="Invites, reminders and invoices" state={health.email === 'resend' ? 'Sending' : 'Not sending (saved in the log)'} tone={health.email === 'resend' ? 'bg-success' : 'bg-warning'} />
            </ul>
          </section>
          <section aria-labelledby="jobs" className="lit-edge rounded-[14px] bg-white/[0.035] px-5 py-2">
            <h2 id="jobs" className="pt-3 text-xs font-semibold uppercase tracking-[0.06em] text-white/60">Scheduled jobs</h2>
            {crons ? (
              <ul className="divide-y divide-white/[0.06]">
                {crons.map((c) => (
                  <Row key={c.job} name={c.label} detail={`Runs ${every(c.everyMinutes)}${c.lastRunAt ? ` · last finished ${timeAgo(c.lastRunAt)}` : ''}`} state={CRON_TEXT[c.state].text} tone={CRON_TEXT[c.state].tone} />
                ))}
              </ul>
            ) : (
              <p className="py-4 text-sm text-white/60">Job times are not available while the database is unreachable.</p>
            )}
          </section>
        </div>
      </Section>
    </>
  )
}
