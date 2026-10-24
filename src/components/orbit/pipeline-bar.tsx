import { formatINRCompact } from '@/lib/money'
import { Swatch } from '@/components/ui/swatch'
import { dealStageFill } from './palette'

export type PipelineStage = { key: string; label: string; color: string; count: number; valuePaise: number; weightedPaise: number }

/** Below this share a segment is too narrow to carry its own label. */
const LABEL_MIN_SHARE = 14

/**
 * Open pipeline by stage as the attendance bar: full-radius 48px segments that touch, sized by value, the share
 * inside the wider ones. Under it, one row per stage with a 12px round key, the count, the value and the weighted
 * value.
 */
export function PipelineBar({ stages }: { stages: PipelineStage[] }) {
  const total = stages.reduce((s, x) => s + x.valuePaise, 0)
  const shown = stages.filter((s) => s.valuePaise > 0)
  const share = (v: number) => (total ? (v / total) * 100 : 0)
  return (
    <div className="@container">
      <div className="flex h-12 w-full overflow-hidden rounded-full bg-white/[0.1]" role="img" aria-label={shown.map((s) => `${s.label} ${Math.round(share(s.valuePaise))}%`).join(', ')}>
        {shown.map((s) => {
          const f = dealStageFill(s.color)
          const pct = share(s.valuePaise)
          return (
            <div key={s.key} title={`${s.label}: ${formatINRCompact(s.valuePaise)}`} className="flex h-full min-w-[10px] items-center justify-center rounded-full text-sm font-semibold tabular-nums" style={{ width: `${pct}%`, background: f.bg, color: f.ink }}>
              {pct >= LABEL_MIN_SHARE ? `${Math.round(pct)}%` : null}
            </div>
          )
        })}
      </div>
      <ul className="mt-4 grid gap-x-10 @min-[900px]:grid-cols-2">
        {stages.map((s) => (
          <li key={s.key} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-4 border-b border-white/[0.06] py-2 text-sm">
            <span className="flex min-w-0 items-center gap-2.5 text-white">
              <Swatch color={dealStageFill(s.color).bg} shape="round" />
              <span className="truncate">{s.label}</span>
              <span className="text-[13px] text-[#979797]">{s.count}</span>
            </span>
            <span className="text-right tabular-nums text-white">{formatINRCompact(s.valuePaise)}</span>
            <span className="whitespace-nowrap text-right text-[13px] tabular-nums text-[#979797]">weighted {formatINRCompact(s.weightedPaise)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
