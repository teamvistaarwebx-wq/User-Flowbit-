import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { formatINRCompact } from '@/lib/money'
import { cn } from '@/lib/utils'
import { hoursLabel, retainerUse } from '@/modules/clients/dashboard-math'
import { HEALTH_LABEL, HEALTH_TONE, type ClientHealth } from '@/modules/clients/health'
import type { Margin } from '@/modules/clients/dashboard-math'

/** Below this margin a client is flagged amber; below zero it is red. */
const THIN_MARGIN_PCT = 20

export function HealthBadge({ health }: { health: ClientHealth | null }) {
  if (!health) return <span className="text-[#979797]">—</span>
  return <Badge tone={HEALTH_TONE[health]}>{HEALTH_LABEL[health]}</Badge>
}

/** "12.5 h of 20 h" with a small bar when a retainer sets the hours, else just the hours. */
export function HoursVsRetainer({ minutes, retainerHours, compact = false }: { minutes: number | null; retainerHours: number | null; compact?: boolean }) {
  if (minutes === null) return <span className="text-[#979797]">—</span>
  const use = retainerUse(minutes, retainerHours)
  const text = retainerHours ? `${hoursLabel(minutes)} of ${retainerHours} h` : hoursLabel(minutes)
  if (use === null || compact) return <span className={cn('tabular-nums', use !== null && use > 100 ? 'text-danger' : 'text-white')}>{text}</span>
  return (
    <span className="block min-w-[120px]">
      <span className={cn('block text-xs tabular-nums', use > 100 ? 'text-danger' : 'text-white')}>{text}</span>
      <Progress value={use} size="sm" tone={use > 100 ? 'danger' : use > 80 ? 'warning' : 'success'} className="mt-1" />
    </span>
  )
}

export function MarginValue({ margin }: { margin: Margin }) {
  if (margin.pct === null) return <span className="text-[#979797]" title="Nothing billed in the last 90 days">—</span>
  const tone = margin.pct < 0 ? 'text-danger' : margin.pct < THIN_MARGIN_PCT ? 'text-warning' : 'text-success'
  return (
    <span className={cn('tabular-nums', tone)} title={`Revenue ${formatINRCompact(margin.revenuePaise)} · salary cost ${formatINRCompact(margin.costPaise)} (last 90 days)`}>
      {margin.pct}%
    </span>
  )
}

export function OverdueValue({ paise }: { paise: number | null }) {
  return paise ? <span className="tabular-nums text-danger">{formatINRCompact(paise)}</span> : <span className="text-[#979797]">—</span>
}
