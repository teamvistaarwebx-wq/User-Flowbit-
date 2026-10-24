import Image from 'next/image'
import { Logo } from '@/components/ui/logo'
import { cn } from '@/lib/utils'

/**
 * The shell's logo: the workspace's own logo (Settings → General) when it has
 * one, with its name beside it when `showText`; otherwise Flowbit's.
 */
export function WorkspaceLogo({ org, size, showText = true, className }: { org: { name: string; logoUrl: string | null }; size: number; showText?: boolean; className?: string }) {
  if (!org.logoUrl) return <Logo size={size} showText={showText} className={className} />
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-2.5', className)}>
      {/* unoptimized: workspace upload served by /api/files (session-checked), sized here */}
      <Image src={org.logoUrl} alt="" aria-hidden width={size} height={size} unoptimized draggable={false} className="shrink-0 select-none rounded-[8px] object-contain" style={{ width: size, height: size }} />
      {showText ? <span className="max-w-[220px] truncate text-[19px] font-semibold leading-none tracking-[-0.01em] text-white">{org.name}</span> : null}
    </span>
  )
}
