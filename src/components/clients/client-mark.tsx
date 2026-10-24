import Image from 'next/image'
import { cn } from '@/lib/utils'

/** Up to two initials from a client name ("Kesar & Clay Ceramics" → "KC"). */
function initials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean)
  return (words.length > 1 ? `${words[0][0]}${words[1][0]}` : (words[0] ?? '?').slice(0, 2)).toUpperCase()
}

/**
 * A client's mark, in the family of the side panel's workspace square: a small rounded square (radius 6) with
 * white initials. Companies sit on the neutral #313131; individuals take a round shape, as people do.
 */
export function ClientMark({ name, kind, size = 'md', className, logoUrl }: { name: string; kind?: 'company' | 'individual' | string; size?: 'md' | 'lg' | 'xs'; className?: string; /** The client's own logo, when it has one. */ logoUrl?: string | null }) {
  const shape = kind === 'individual' ? 'rounded-full' : 'rounded-[6px]'
  const dims = size === 'lg' ? 'size-10' : size === 'xs' ? 'size-4' : 'size-8'
  if (logoUrl) {
    const px = size === 'lg' ? 40 : size === 'xs' ? 16 : 32
    // unoptimized: workspace file from /api/files (session-checked), small and already resized
    return <Image src={logoUrl} alt="" aria-hidden width={px} height={px} unoptimized className={cn('shrink-0 select-none bg-white/[0.06] object-contain', shape, dims, className)} />
  }
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center bg-[#313131] font-semibold text-white',
        kind === 'individual' ? 'rounded-full' : 'rounded-[6px]',
        size === 'lg' ? 'size-10 text-sm' : size === 'xs' ? 'size-4 text-[7px]' : 'size-8 text-xs',
        className,
      )}
    >
      {initials(name)}
    </span>
  )
}
