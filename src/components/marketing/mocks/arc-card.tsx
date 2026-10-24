import { CirclePlus } from 'lucide-react'
import { ArcMark } from '@/components/ui/logo'
import { cn } from '@/lib/utils'

const CHIPS = ['Outline Flowbit', 'Breakdown Task', 'Progress Update']

/**
 * The dashboard's Arc card at mock scale (Figma): glass lit by a purple light from below, the arc.ai logo, three
 * dark suggestion chips and the big ask pill with its blush lip. Static: nothing here is interactive.
 */
export function ArcCardMock({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <div className={cn('glass relative flex flex-col items-center overflow-hidden rounded-[10px] bg-white/[0.06] px-5', compact ? 'pb-5 pt-6' : 'pb-7 pt-10', className)}>
      <span aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_60%_at_30%_112%,rgba(140,90,170,0.5),transparent_70%)]" />
      <span aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_45%_at_95%_105%,rgba(150,135,160,0.35),transparent_70%)]" />
      <div className="relative flex items-center gap-2">
        <ArcMark size={compact ? 20 : 26} />
        <span className={cn('font-semibold leading-none text-white', compact ? 'text-lg' : 'text-[22px]')}>
          arc<span className="bg-[linear-gradient(90deg,#F2C7E5,#C796C6)] bg-clip-text text-transparent">.ai</span>
        </span>
      </div>
      <div className={cn('relative flex flex-wrap justify-center gap-2', compact ? 'mt-5' : 'mt-10')}>
        {CHIPS.map((c) => (
          <span key={c} className="inline-flex h-7 items-center rounded-full bg-control px-3 text-[11px] font-medium text-[#F1F1F1]">
            {c}
          </span>
        ))}
      </div>
      <div className={cn('edge-stroke relative mt-4 flex w-full max-w-[420px] items-center gap-2.5 rounded-full bg-[linear-gradient(90deg,rgba(120,80,160,0.38),rgba(220,200,225,0.36))] pl-4 pr-3 [--stroke:linear-gradient(180deg,rgba(177,156,185,0.9)_0%,rgba(177,156,185,0.25)_45%,rgba(245,220,240,0.6)_80%,#F5DCF0_100%)]', compact ? 'h-11' : 'h-14')}>
        <span aria-hidden className="pointer-events-none absolute inset-x-5 -bottom-px h-[2px] rounded-full bg-[#F5DCF0] blur-[1px]" />
        <CirclePlus className="size-4 shrink-0 text-white" strokeWidth={1.5} aria-hidden />
        <span className="truncate text-xs text-[#C1B8C4]">Search your workspace in seconds</span>
      </div>
    </div>
  )
}
