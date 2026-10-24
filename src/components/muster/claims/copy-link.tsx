'use client'

import { Copy, Link2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from '@/lib/toast'
import { IconButton } from '@/components/ui/button'

/** The public link of a claim form with a copy button. */
export function CopyLink({ slug, compact }: { slug: string; compact?: boolean }) {
  const path = `/c/${slug}`
  const [origin, setOrigin] = useState('')
  useEffect(() => setOrigin(window.location.origin), [])
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${path}`)
      toast.success('Link copied. Share it with the team.')
    } catch {
      toast.error('Copy did not work here. Select the link and copy it by hand.')
    }
  }
  return (
    <span className="inline-flex h-8 max-w-full items-center gap-1.5 rounded-full bg-control py-1 pl-3 pr-1 text-xs text-white/85 ring-1 ring-inset ring-white/[0.12]">
      <Link2 className="size-3.5 shrink-0 text-icon-muted" />
      <a href={path} target="_blank" rel="noreferrer" className="truncate transition-colors hover:text-white">
        {compact ? path : `${origin}${path}`}
      </a>
      <IconButton label="Copy link" size="sm" onClick={copy}>
        <Copy className="size-3.5" />
      </IconButton>
    </span>
  )
}
