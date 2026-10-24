import { Repeat2 } from 'lucide-react'
import { formatDate, formatTime } from '@/lib/dates'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import type { SelectOption } from '@/components/ui/select'
import type { LeadSequence } from '@/modules/orbit/sequences/queries'
import { EnrollDialog } from './sequence-enroll'
import { SequenceLeadButtons } from './sequence-lead-buttons'

const OUTCOME: Record<string, string> = { sent: 'Email sent', task: 'Task created', waited: 'Waited', failed: 'Send failed' }

/** The lead's follow-up sequence: progress, what each step did, and Replied / Remove; or Enroll when it has none. */
export function LeadSequenceCard({ leadId, sequence, options, canEdit }: { leadId: string; sequence: LeadSequence | null; options: SelectOption[]; canEdit: boolean }) {
  const active = sequence?.status === 'active'
  const enroll = canEdit && !active ? <EnrollDialog ids={[leadId]} options={options} trigger={<Button size="sm" variant="secondary">Enroll in sequence</Button>} /> : null
  return (
    <Card variant="solid">
      <CardHeader label="Sequence" icon={<Repeat2 />} actions={active ? <Badge tone="info">Running</Badge> : enroll} />
      {sequence ? (
        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium text-white">{sequence.name}</p>
            <p className="text-xs text-fg-3">{sequence.progress}{sequence.nextRunAt ? ` · next ${formatDate(sequence.nextRunAt, { short: true })}, ${formatTime(sequence.nextRunAt)}` : ''}</p>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.08]" role="progressbar" aria-valuemin={0} aria-valuemax={sequence.steps} aria-valuenow={sequence.doneSteps} aria-label="Sequence progress">
            <div className="h-full rounded-full bg-[#8B5CF6]" style={{ width: `${sequence.steps ? (sequence.doneSteps / sequence.steps) * 100 : 0}%` }} />
          </div>
          {sequence.history.length ? (
            <ol className="space-y-1.5">
              {sequence.history.map((h, i) => (
                <li key={i} className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="min-w-0 truncate text-fg-2">Step {h.step}: {OUTCOME[h.outcome] ?? h.outcome}{h.label ? ` · ${h.label}` : ''}{h.via === 'gmail' ? ' (Gmail)' : ''}</span>
                  <span className="shrink-0 tabular-nums text-fg-3">{formatDate(h.at, { short: true })}</span>
                </li>
              ))}
            </ol>
          ) : null}
          {active && canEdit ? <SequenceLeadButtons leadId={leadId} /> : null}
        </div>
      ) : (
        <p className="text-sm text-fg-3">Not in a sequence. Enroll to send follow-ups and create call tasks automatically.</p>
      )}
    </Card>
  )
}
