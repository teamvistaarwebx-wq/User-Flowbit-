import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export type Step = { key: string; label: string; description?: string }

/**
 * Horizontal stage tracker (payroll's 8 stages, onboarding). Steps before
 * `current` are done, `current` is active. `current = steps.length` = all done.
 */
export function Stepper({ steps, current, className }: { steps: Step[]; current: number; className?: string }) {
  return (
    <ol className={cn('flex w-full gap-1 overflow-x-auto scrollbar-none', className)}>
      {steps.map((s, i) => {
        const state = i < current ? 'done' : i === current ? 'active' : 'todo'
        return (
          <li key={s.key} className="flex min-w-[96px] flex-1 flex-col gap-2">
            <div className={cn('h-1 rounded-[2px]', state === 'done' ? 'bg-[image:var(--grad-step)]' : state === 'active' ? 'bg-[image:var(--grad-step)] opacity-60' : 'bg-[#625F67]')} />
            <div className="flex items-start gap-1.5">
              <span className={cn('mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold tabular-nums', state === 'done' ? 'bg-violet-2 text-white' : state === 'active' ? 'bg-white text-[#200C55]' : 'bg-[#313131] text-fg-2')}>
                {state === 'done' ? <Check className="size-2.5" strokeWidth={4} /> : i + 1}
              </span>
              <div className="min-w-0">
                <div className={cn('text-[13px] font-medium leading-tight', state === 'todo' ? 'text-fg-2' : 'text-fg')}>{s.label}</div>
                {s.description ? <div className="text-xs text-fg-2">{s.description}</div> : null}
              </div>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
