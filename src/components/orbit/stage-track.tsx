import { cn } from '@/lib/utils'
import { Tooltip } from '@/components/ui/tooltip'

export type TrackStage = { key: string; label: string; /** Second line under the label ("40%"). */ sub?: string; /** Tooltip with the stage rule. */ hint?: string }

export type StageTrackProps = {
  stages: TrackStage[]
  /** Stages before this many are done (filled with the workday gradient). */
  done: number
  /** Index of the highlighted block, or -1 for none. */
  current: number
  /** Colour of the highlighted block: the Figma "Half day" violet, or a closing state. */
  tone?: 'violet' | 'success' | 'danger'
  /** Text inside the highlighted block (defaults to the stage label). */
  currentLabel?: string
  /** Makes a stage a button. Return true only for stages that can be moved to right now. */
  canSelect?: (key: string) => boolean
  onSelect?: (key: string) => void
  busy?: boolean
  label: string
}

const TONE_BG = { violet: 'bg-[#5E4084]', success: 'bg-[#08AD93]', danger: 'bg-[#E9403B]' } as const

/**
 * Stage progress as the Figma workday timeline: one THICK 42px bar, the stages behind you filled with the
 * workday gradient (with its slow sheen), the current stage a solid block like "Half day", the rest the
 * translucent track. Labels sit under the bar so they stay readable over the light end of the gradient.
 */
export function StageTrack({ stages, done, current, tone = 'violet', currentLabel, canSelect, onSelect, busy, label }: StageTrackProps) {
  const n = Math.max(1, stages.length)
  const fillPct = (Math.min(Math.max(done, 0), n) / n) * 100
  const cols = { gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }
  const shown = current >= 0 && current < n ? current : Math.min(Math.max(done, 1), n) - 1
  return (
    <div className="@container">
      <div className="relative h-[42px] overflow-hidden rounded-[8px] bg-white/[0.17]" role="img" aria-label={`${label}: ${current >= 0 ? stages[current]?.label : 'closed'}`}>
        {fillPct > 0 ? (
          <div className="absolute inset-y-0 left-0 overflow-hidden rounded-[8px] bg-grad-progress transition-[width] duration-[600ms] ease-out" style={{ width: `${fillPct}%` }}>
            <span aria-hidden className="absolute inset-y-0 left-0 w-[120px] bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.14),transparent)] animate-[sheen_7s_var(--ease-in-out)_infinite]" />
            <span aria-hidden className="absolute inset-x-0 bottom-0 h-[10px] bg-[linear-gradient(0deg,color-mix(in_srgb,var(--orchid)_28%,transparent),transparent)]" />
          </div>
        ) : null}
        {stages.slice(1).map((s, i) => (
          <span key={s.key} aria-hidden className="absolute inset-y-[11px] w-px bg-black/20" style={{ left: `${((i + 1) / n) * 100}%` }} />
        ))}
        {current >= 0 && current < n ? (
          <span
            className={cn('absolute inset-y-0 flex items-center justify-center rounded-[8px] px-2 text-[13px] font-semibold text-white transition-[left] duration-[600ms] ease-out', TONE_BG[tone])}
            style={{ left: `${(current / n) * 100}%`, width: `${100 / n}%` }}
          >
            <span className="truncate @max-[520px]:sr-only">{currentLabel ?? stages[current]?.label}</span>
          </span>
        ) : null}
        {onSelect ? (
          <div className="absolute inset-0 grid" style={cols}>
            {stages.map((s) => {
              const ok = Boolean(canSelect?.(s.key)) && !busy
              return (
                <button
                  key={s.key}
                  type="button"
                  disabled={!ok}
                  onClick={() => onSelect(s.key)}
                  aria-label={`Move to ${s.label}`}
                  title={ok ? `Move to ${s.label}` : undefined}
                  className={cn('h-full rounded-[8px] transition-colors duration-150', ok ? 'cursor-pointer hover:bg-white/[0.08] focus-visible:bg-white/[0.08]' : 'cursor-default')}
                />
              )
            })}
          </div>
        ) : null}
      </div>
      {/* Too narrow for a label per stage: one line naming where it stands instead of a row of clipped words. */}
      <p className="mt-2.5 flex items-baseline justify-between gap-3 text-[13px] @min-[521px]:hidden">
        <span className="truncate font-medium text-white">{currentLabel ?? stages[shown]?.label}</span>
        <span className="shrink-0 tabular-nums text-[#979797]">Stage {shown + 1} of {n}{stages[shown]?.sub ? ` · ${stages[shown]?.sub}` : ''}</span>
      </p>
      <ol className="mt-2.5 grid gap-1 @max-[520px]:hidden" style={cols}>
        {stages.map((s, i) => {
          const text = (
            <span className="block min-w-0 px-0.5 text-center">
              <span className={cn('block truncate text-[13px] leading-4', i === current ? 'font-medium text-white' : i < done ? 'text-white/80' : 'text-[#979797]')}>{s.label}</span>
              {s.sub ? <span className="mt-0.5 block text-xs tabular-nums text-[#797779]">{s.sub}</span> : null}
            </span>
          )
          return <li key={s.key} className="min-w-0">{s.hint ? <Tooltip content={s.hint}>{text}</Tooltip> : text}</li>
        })}
      </ol>
    </div>
  )
}
