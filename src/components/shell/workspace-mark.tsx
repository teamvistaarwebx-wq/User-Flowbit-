'use client'

import { useState } from 'react'
import Image from 'next/image'
import { cn, initials } from '@/lib/utils'

/** The workspace's own logo (Settings → General), or its initial on the Figma's #784082 square when there is none or it fails to load. */
export function WorkspaceMark({ name, logoUrl, size = 36, className }: { name: string; logoUrl: string | null; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false)
  const box = cn('flex shrink-0 items-center justify-center overflow-hidden rounded-[6px]', className)
  if (logoUrl && !failed) {
    return (
      <span className={cn(box, 'bg-white/[0.06]')} style={{ width: size, height: size }}>
        {/* unoptimized: org-checked /api/files stream, which the image optimizer would fetch without the session */}
        <Image src={logoUrl} alt="" width={size} height={size} unoptimized className="size-full object-contain p-0.5" onError={() => setFailed(true)} />
      </span>
    )
  }
  return (
    <span className={cn(box, 'bg-[var(--avatar-ws)] font-semibold text-white/75')} style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }} aria-hidden>
      {initials(name).slice(0, 1)}
    </span>
  )
}
