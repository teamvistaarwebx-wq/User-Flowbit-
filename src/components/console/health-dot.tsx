import { cn } from '@/lib/utils'
import { HEALTH_LABEL, type HealthScore } from '@/modules/console/health'

const COLOR: Record<HealthScore, string> = { green: 'bg-[#2DCBAF]', amber: 'bg-[#F5B544]', red: 'bg-[#F64A45]' }

/** Green / Amber / Red health score (console spec 7.3); grey before the first nightly run. */
export function HealthDot({ score, withLabel }: { score: HealthScore | null; withLabel?: boolean }) {
  const label = score ? HEALTH_LABEL[score] : 'Not scored yet'
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5" title={label}>
      <span aria-hidden className={cn('size-2.5 rounded-full', score ? COLOR[score] : 'bg-white/25')} />
      {withLabel ? <span className="text-sm text-white">{label}</span> : <span className="sr-only">{label}</span>}
    </span>
  )
}
