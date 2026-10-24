import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { ArcMark } from '@/components/ui/logo'
import { timeAgo } from '@/lib/dates'
import type { ArcRunView } from '@/modules/work/arc/queries'
import { BreakdownCard } from './breakdown-card'
import { OutlineCard } from './outline-card'
import { ProgressCard } from './progress-card'
import { SearchResult } from './search-result'

const KIND_LABEL = { search: 'Search', outline: 'Project outline', breakdown: 'Task breakdown', progress: 'Progress update' } as const

function Body({ run, canPost }: { run: ArcRunView; canPost: boolean }) {
  switch (run.kind) {
    case 'search':
      return <SearchResult prompt={run.prompt} groups={run.groups} shortcut={run.shortcut} />
    case 'outline':
      return <OutlineCard runId={run.id} status={run.status} projectName={run.projectName} projectId={run.projectId} startDate={run.startDate} draft={run.draft} appliedHref={run.appliedHref} />
    case 'breakdown':
      return <BreakdownCard runId={run.id} status={run.status} draft={run.draft} appliedHref={run.appliedHref} />
    case 'progress':
      return <ProgressCard runId={run.id} text={run.text} postHref={run.postHref} canPost={canPost} />
  }
}

/** Chat-style thread: your prompt on the right, Arc's answer card on the left. */
export function ArcThread({ runs, userName, canPost }: { runs: ArcRunView[]; userName: string; canPost: boolean }) {
  return (
    <ol className="space-y-6">
      {runs.map((run) => (
        <li key={run.id} className="space-y-3 animate-slide-up">
          <div className="flex items-start justify-end gap-2">
            <div className="max-w-[80%] rounded-[16px] rounded-tr-[6px] bg-chip-active px-4 py-2.5 text-sm text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">{run.prompt}</div>
            <Avatar name={userName} size="sm" />
          </div>
          <div className="flex items-start gap-3">
            {/* Arc's tile from the rail: the gradient arc mark on blush. */}
            <span className="flex size-8 shrink-0 items-center justify-center rounded-[8px] bg-[#F5E8F2]">
              <ArcMark size={18} />
            </span>
            <div className="glass min-w-0 flex-1 rounded-[10px] p-4">
              <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-[#979797]">
                <span className="font-semibold uppercase tracking-[0.04em] text-white">{KIND_LABEL[run.kind]}</span>
                {run.source === 'ai' ? <span>· drafted by Claude</span> : run.kind !== 'search' ? <span>· from a template</span> : null}
                {run.status === 'draft' ? <Badge tone="warning">Draft · review before applying</Badge> : null}
                <span>· {timeAgo(run.createdAt)}</span>
              </div>
              <Body run={run} canPost={canPost} />
            </div>
          </div>
        </li>
      ))}
    </ol>
  )
}
