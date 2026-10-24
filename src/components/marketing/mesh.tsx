import { cn } from '@/lib/utils'

/**
 * The public site's backdrop, from the Figma onboarding frame (DESIGN 3.5): pure black with one plum glow at the
 * top right that breathes slowly, and a faint indigo in the top-left. One light source per screen, no floating
 * blobs, no dot grid. `intensity="soft"` dims it for text-heavy pages. `accent` is accepted for older callers and
 * ignored: colour on the public site comes from the brand, not from decoration.
 */
export function Mesh({ className, intensity = 'full' }: { className?: string; accent?: string; intensity?: 'full' | 'soft' }) {
  const soft = intensity === 'soft'
  return (
    <div aria-hidden className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}>
      <div
        className={cn('absolute -right-[10%] -top-[30%] h-[860px] w-[min(1100px,120%)] origin-top-right', soft ? 'opacity-55' : 'opacity-100')}
        style={{ background: 'radial-gradient(closest-side, #744C6A 0%, rgba(116,76,106,0.45) 42%, rgba(116,76,106,0) 100%)', animation: 'breathe 18s var(--ease-in-out) infinite' }}
      />
      <div className="absolute -left-[12%] -top-[20%] h-[620px] w-[720px] opacity-80" style={{ background: 'radial-gradient(closest-side, rgba(42,21,100,0.55) 0%, rgba(42,21,100,0) 100%)' }} />
      <div className="absolute inset-x-0 bottom-0 h-48 bg-linear-to-b from-transparent to-black" />
    </div>
  )
}
