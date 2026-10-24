import type { Metadata } from 'next'
import { ListChecks, Siren } from 'lucide-react'
import { requireStaff } from '@/lib/console/session'
import { formatDateTime, todayIST } from '@/lib/dates'
import { Card, CardHeader } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { BreachNoticeForm } from '@/components/console/breach-form'
import { StaffAudit } from '@/models/console/StaffAudit'

export const metadata: Metadata = { title: 'Incidents' }

const STEPS = [
  'Contain: stop the leak (rotate keys, revoke sessions, block the route). Keep the logs.',
  'Assess: which workspaces, which records and fields, since when. Write it down with times.',
  'Decide with the founder within 24 hours of finding it. Workspaces are the data fiduciaries; they must tell the Board and the people within 72 hours.',
  'Notify the owners here, in plain words. Then answer their questions from support.',
  'Report to CERT-In within 6 hours when it is a reportable cyber incident (see the runbook).',
  'Close: root cause, the fix, and what changes so it does not happen again.',
]

/** Console → Incidents (Admin): the breach runbook in short, and the notice to affected workspace owners. */
export default async function IncidentsPage() {
  const p = await requireStaff('breach.notify')
  const sent = await p.raw(StaffAudit).find({ action: 'console.breach_notice' }).sort({ createdAt: -1 }).limit(10).lean()
  return (
    <>
      <PageHeader title="Incidents" description="When personal data in a workspace may have been exposed. The full runbook is docs/BREACH-RUNBOOK.md." />
      <div className="grid grid-cols-12 gap-4">
        <Card className="col-span-12 rounded-[16px] lg:col-span-7">
          <CardHeader label="Notify affected workspace owners" icon={<Siren strokeWidth={1.5} />} description="Essential email to every active owner of each workspace, plus a bell alert." />
          <BreachNoticeForm today={todayIST()} />
        </Card>
        <div className="col-span-12 space-y-4 lg:col-span-5">
          <Card className="rounded-[16px]">
            <CardHeader label="Runbook" icon={<ListChecks strokeWidth={1.5} />} />
            <ol className="list-decimal space-y-1.5 pl-5 text-sm text-fg-2">{STEPS.map((s) => <li key={s}>{s}</li>)}</ol>
          </Card>
          <Card className="rounded-[16px]">
            <CardHeader label="Notices sent" icon={<Siren strokeWidth={1.5} />} />
            {sent.length ? (
              <ul className="space-y-2 text-sm">{sent.map((s) => <li key={String(s._id)}><span className="text-white">{s.summary}</span><span className="block text-xs text-fg-3">{s.staffName} · {formatDateTime(s.createdAt)}</span></li>)}</ul>
            ) : (
              <p className="text-sm text-fg-2">None so far.</p>
            )}
          </Card>
        </div>
      </div>
    </>
  )
}
