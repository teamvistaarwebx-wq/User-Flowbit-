import type { ReactNode } from 'react'
import { BurstMark } from '@/components/ui/logo'
import { cn } from '@/lib/utils'

/**
 * A window around a mock screen built from real UI components: the sign-in card's glass (radius 16, a lit
 * hairline, backdrop blur) on the app's charcoal, with a slim address bar. No coloured halo, no drop shadow.
 * The inner screen is decorative for assistive tech; `label` describes it. `accent` and `float` are accepted
 * for older callers; the frame no longer tints or floats.
 */
export function MockFrame({ label, path, children, className }: { label: string; path: string; accent?: string; children: ReactNode; className?: string; float?: boolean }) {
  return (
    <figure aria-label={label} className={cn('relative isolate', className)}>
      <div aria-hidden className="edge-stroke overflow-hidden rounded-[16px] bg-[#171717]/90 backdrop-blur-xl [--stroke:linear-gradient(200deg,rgba(255,255,255,0.32)_0%,rgba(255,255,255,0.12)_45%,rgba(255,255,255,0.4)_100%)]">
        <div className="flex h-9 items-center gap-3 border-b border-line/70 bg-[#1A1A1A] px-4">
          <span className="w-10" />
          <span className="mx-auto flex h-6 min-w-0 items-center gap-1.5 truncate rounded-full bg-black/40 px-3 text-[11px] text-[#979797]">
            <BurstMark size={11} variant="white" className="opacity-70" />
            useflowbit.com{path}
          </span>
          <span className="w-10" />
        </div>
        <div className="bg-[radial-gradient(60%_45%_at_58%_0%,rgba(58,40,62,0.55)_0%,rgba(23,23,23,0)_75%)] p-4 sm:p-5">{children}</div>
      </div>
    </figure>
  )
}

/** Static, non-interactive look-alike of a button for mock screens (no handler on purpose). */
export function MockPill({ children, primary, className }: { children: ReactNode; primary?: boolean; className?: string }) {
  return (
    <span className={cn('inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[11px] font-medium', primary ? 'bg-grad-button text-white' : 'bg-control text-white ring-1 ring-inset ring-white/[0.18]', className)}>
      {children}
    </span>
  )
}
