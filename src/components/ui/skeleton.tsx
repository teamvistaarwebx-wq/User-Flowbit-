import { cn } from '@/lib/utils'

/** Shimmering placeholder block for loading.tsx files. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('relative overflow-hidden rounded-[10px] bg-white/[0.06] before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.4s_infinite] before:bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.05),transparent)]', className)} />
}
