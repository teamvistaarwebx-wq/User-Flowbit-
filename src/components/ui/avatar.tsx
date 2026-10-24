import type { CSSProperties } from 'react'
import Image from 'next/image'
import { avatarFill, patternUrl } from '@/lib/avatar-pattern'
import { cn, initials } from '@/lib/utils'

const SIZES = { xs: 'size-5 text-[9px]', sm: 'size-8 text-xs', md: 'size-10 text-sm', lg: 'size-14 text-lg', xl: 'size-20 text-2xl' }

/** Small status dot on an avatar: leave (amber), checked in (teal), on break (lavender), offline (grey). */
export type AvatarMarker = 'leave' | 'in' | 'break' | 'out'
const MARKER: Record<AvatarMarker, { fill: string; label: string }> = {
  leave: { fill: 'bg-warning', label: 'on leave today' },
  in: { fill: 'bg-success', label: 'checked in' },
  break: { fill: 'bg-violet', label: 'on break' },
  out: { fill: 'bg-[#5a585b]', label: 'offline' },
}
const MARKER_SIZE = { xs: 'size-2', sm: 'size-2.5', md: 'size-3', lg: 'size-3.5', xl: 'size-4' }

export type AvatarProps = { name?: string | null; src?: string | null; size?: keyof typeof SIZES; className?: string; ring?: boolean; marker?: AvatarMarker | null; markerLabel?: string }

/**
 * Round avatar: the photo when `src`, otherwise initials on a muted fill picked from the name, or the
 * workspace's generated pattern when the shell sets data-avatar-style="pattern" (globals.css). `marker` adds a status dot.
 */
export function Avatar({ name, src, size = 'sm', className, ring, marker, markerLabel }: AvatarProps) {
  const label = name ?? 'Unknown'
  if (marker) {
    const text = markerLabel ?? MARKER[marker].label
    return (
      <span className="relative inline-flex shrink-0" title={`${label}, ${text}`}>
        <Avatar name={name} src={src} size={size} className={className} ring={ring} />
        <span role="img" aria-label={text} className={cn('absolute -bottom-px -right-px rounded-full ring-2 ring-[#171717]', MARKER_SIZE[size], MARKER[marker].fill)} />
      </span>
    )
  }
  return (
    <span
      title={label}
      className={cn('relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-semibold text-white', SIZES[size], ring && 'ring-[1.5px] ring-white', !src && 'avatar-initials', className)}
      style={src ? undefined : ({ background: avatarFill(label), '--avatar-pattern': patternUrl(label) } as CSSProperties)}
    >
      {src ? (
        // unoptimized: /api/files checks the viewer's session, which the image optimizer would not send
        <Image src={src} alt={label} width={80} height={80} unoptimized className="size-full object-cover" />
      ) : (
        initials(label)
      )}
    </span>
  )
}

/** Overlapping avatars with a white ring, about 6px of overlap (Figma), and a "+n" bubble. */
/** `away`: on leave today (a small amber dot). */
export function AvatarStack({ people, max = 4, size = 'sm', className }: { people: { name?: string | null; src?: string | null; away?: boolean }[]; max?: number; size?: AvatarProps['size']; className?: string }) {
  const shown = people.slice(0, max)
  const extra = people.length - shown.length
  return (
    <span className={cn('flex items-center', size === 'xs' ? '-space-x-1.5' : '-space-x-2', className)}>
      {shown.map((p, i) => (
        <Avatar key={`${p.name}-${i}`} name={p.name} src={p.src} size={size} ring marker={p.away ? 'leave' : null} />
      ))}
      {extra > 0 ? <span className={cn('inline-flex items-center justify-center rounded-full bg-[#313131] font-medium text-fg ring-[1.5px] ring-white', SIZES[size])}>+{extra}</span> : null}
    </span>
  )
}
