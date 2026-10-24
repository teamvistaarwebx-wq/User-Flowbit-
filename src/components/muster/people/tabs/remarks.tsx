import { Activity, Eye, Lock, MessageSquareText, Trash2 } from 'lucide-react'
import { formatDate, todayIST } from '@/lib/dates'
import { firstName as firstNameOf } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader } from '@/components/ui/card'
import { Timeline } from '@/components/ui/timeline'
import { AuditLog } from '@/models/AuditLog'
import { EmployeeRemark } from '@/models/muster/EmployeeRemark'
import { archiveRemark } from '@/modules/muster/people/record-actions'
import { REMARK_KIND_LABEL } from '@/modules/muster/settings/defaults'
import { ActionButton } from '../action-button'
import { RemarkForm } from '../remark-form'
import type { TabProps } from './types'

const KIND_TONE = { performance: 'info', commendation: 'success', concern: 'danger', one_on_one: 'violet', general: 'neutral' } as const
const PAY = /salary|payroll|payslip/
const BANK = /bank/

/** Remarks tab (people.write): HR notes plus the activity timeline from the audit log. */
export async function RemarksTab({ ctx, employee: e }: TabProps) {
  const [remarks, activity] = await Promise.all([
    ctx.db(EmployeeRemark).find({ employeeId: e._id, deletedAt: null }).sort({ occurredOn: -1, createdAt: -1 }).lean(),
    ctx.db(AuditLog).find({ entity: 'Employee', entityId: String(e._id) }).sort({ createdAt: -1 }).limit(40).lean(),
  ])
  const first = e.firstName || firstNameOf(e.fullName)
  const visible = activity.filter((a) => (!PAY.test(a.action) || ctx.can('payroll.read')) && (!BANK.test(a.action) || ctx.can('people.read_sensitive')))
  return (
    <div className="grid grid-cols-12 gap-4">
      <Card className="col-span-12 lg:col-span-7">
        <CardHeader label="Remarks" icon={<MessageSquareText />} description={`General notes and one-on-ones are shared with ${first}; concerns and performance notes stay with HR.`} />
        <RemarkForm employeeId={String(e._id)} firstName={first} today={todayIST()} />
        <ul className="mt-5 border-t border-line">
          {remarks.map((r) => (
            <li key={String(r._id)} className="border-b border-white/[0.1] py-4 last:border-0">
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <Badge tone={KIND_TONE[r.kind as keyof typeof KIND_TONE] ?? 'neutral'}>{REMARK_KIND_LABEL[r.kind] ?? r.kind}</Badge>
                <span className="text-xs text-fg-2">{formatDate(r.occurredOn)} · {r.authorName}</span>
                <span className="inline-flex items-center gap-1 text-xs text-fg-2">{r.visibleToEmployee ? <><Eye className="size-3" /> Visible to {first}</> : <><Lock className="size-3" /> HR only</>}</span>
                <span className="ml-auto"><ActionButton action={archiveRemark} input={{ id: String(r._id) }} label={<Trash2 className="size-3.5" />} title="Remove this remark?" confirmLabel="Remove" reason={{ label: 'Reason', required: true }} /></span>
              </div>
              <p className="whitespace-pre-line text-sm leading-relaxed text-white/85">{r.body}</p>
            </li>
          ))}
          {!remarks.length ? <li className="py-6 text-center text-sm text-fg-2">No remarks yet.</li> : null}
        </ul>
      </Card>
      <Card className="col-span-12 lg:col-span-5">
        <CardHeader label="Activity" icon={<Activity />} />
        <Timeline empty="No activity yet." items={visible.map((a) => ({ id: String(a._id), title: a.summary, description: a.actorName ?? undefined, at: a.createdAt }))} />
      </Card>
    </div>
  )
}
