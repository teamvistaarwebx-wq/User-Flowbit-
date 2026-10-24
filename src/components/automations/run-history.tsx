import { formatDateTime } from '@/lib/dates'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { RUN_STATUS_LABELS, type RunStatus, type StepStatus } from '@/modules/automations/run-status'
import type { RunRow } from '@/modules/automations/queries'
import type { Tone } from '@/lib/status'
import { History } from 'lucide-react'

const RUN_TONE: Record<RunStatus, Tone> = { scheduled: 'info', running: 'info', done: 'success', skipped: 'neutral', failed: 'danger' }
const STEP_LABEL: Record<StepStatus, string> = { sent: 'Sent', queued: 'Queued', created: 'Created', notified: 'Alerted', skipped: 'Skipped', failed: 'Failed' }
const ACTION_LABEL: Record<string, string> = { message: 'Message', notify: 'Alert', task: 'Task' }

/** What each run sent, skipped or failed, and why. */
export function RunHistory({ runs, showRule = true }: { runs: RunRow[]; showRule?: boolean }) {
  if (!runs.length) return <EmptyState compact icon={<History />} title="No runs yet." description="Each time an automation fires, what it did shows here." />
  return (
    <ul className="divide-y divide-line">
      {runs.map((run) => (
        <li key={run.id} className="space-y-1.5 px-[23px] py-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge tone={RUN_TONE[run.status]}>{RUN_STATUS_LABELS[run.status]}</Badge>
            {run.test ? <Badge tone="violet">Test</Badge> : null}
            {showRule ? <span className="text-white">{run.rule}</span> : null}
            <span className="text-xs text-fg-3">{run.status === 'scheduled' ? `Due ${formatDateTime(run.dueAt)}` : formatDateTime(run.at)} · {run.entity}</span>
          </div>
          {run.note ? <p className="text-xs text-fg-2">{run.note}</p> : null}
          {run.steps.length ? (
            <ul className="space-y-0.5 text-xs text-fg-2">
              {run.steps.map((s, i) => (
                <li key={i}>
                  {ACTION_LABEL[s.action] ?? s.action}: {STEP_LABEL[s.status]}
                  {s.to ? ` · ${s.to}` : ''}
                  {s.note ? ` · ${s.note}` : ''}
                </li>
              ))}
            </ul>
          ) : null}
        </li>
      ))}
    </ul>
  )
}
