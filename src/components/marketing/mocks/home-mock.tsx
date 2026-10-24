import { House } from 'lucide-react'
import { StatCard } from '@/components/ui/stat-card'
import { MockFrame } from '../mock-frame'
import { ArcCardMock } from './arc-card'

/** Share of the 10:00–19:00 day elapsed in the mock (about 2:50 pm). */
const DAY_PROGRESS = 54
/** Where the half-day block sits (1 PM) and how wide it is, as shares of the bar. */
const HALF_DAY_AT = 33.3
const HALF_DAY_WIDTH = 9

/**
 * The Figma Home dashboard at mock scale: the breadcrumb, the small greeting with the name in blush, the thick
 * workday timeline with its half-day block, then Arc beside the three stat cards.
 */
export function HomeMock() {
  return (
    <MockFrame label="Preview of the Flowbit Home dashboard" path="/app">
      <div className="flex items-center gap-1.5 border-b border-line/70 pb-3 text-xs text-white">
        <House className="size-3.5" strokeWidth={1.5} aria-hidden /> Home
      </div>
      <div className="mt-3">
        <p className="text-base font-medium text-white sm:text-lg">
          Good afternoon, <span className="text-name">Aditi</span>
        </p>
        <p className="mt-0.5 text-xs text-white/80">Thursday, 1 October</p>
      </div>

      <div className="glass mt-4 rounded-[12px] bg-white/[0.05] p-2.5">
        <div className="relative h-[30px] overflow-hidden rounded-[6px] bg-white/[0.17]">
          <div className="absolute inset-y-0 left-0 rounded-[6px] bg-grad-progress" style={{ width: `${DAY_PROGRESS}%` }} />
          <div className="absolute inset-y-0 flex items-center justify-center min-w-[52px] whitespace-nowrap rounded-[6px] bg-[#5E4084] text-[10px] font-semibold text-white" style={{ left: `${HALF_DAY_AT}%`, width: `${HALF_DAY_WIDTH}%` }}>
            Half day
          </div>
          <span className="absolute inset-y-0 left-2 flex items-center text-[10px] font-medium text-[#3c2a5c]">10AM</span>
          <span className="absolute inset-y-0 flex items-center text-[10px] font-medium text-white" style={{ left: `calc(${DAY_PROGRESS}% + 6px)` }}>02:50PM</span>
          <span className="absolute inset-y-0 right-2 flex items-center text-[10px] font-medium text-white">07PM</span>
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1.35fr]">
        <ArcCardMock compact />
        <div className="grid gap-3">
          <StatCard label="In progress" value={12} delta={8} trend={[4, 6, 5, 8, 7, 10, 12]} color="var(--info)" className="min-h-[104px]" />
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Overdue" value={3} delta={-25} invert trend={[6, 5, 6, 4, 5, 4, 3]} color="var(--danger)" className="min-h-[104px]" />
            <StatCard label="Completed" value={41} delta={14} trend={[18, 22, 25, 27, 33, 36, 41]} color="var(--success)" className="min-h-[104px]" />
          </div>
        </div>
      </div>
    </MockFrame>
  )
}
