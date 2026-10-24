import Link from 'next/link'
import type { ReactNode } from 'react'
import { ArrowRight, CircleCheck, CircleSlash } from 'lucide-react'

/** Bottom row of an Arc draft: summary + Apply/Discard, or the applied/discarded state. */
export function DraftFooter({ status, summary, actions, appliedHref, appliedLabel }: { status: string; summary: string; actions: ReactNode; appliedHref?: string; appliedLabel: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
      <span className="text-[13px] text-[#979797]">{summary}</span>
      {status === 'draft' ? (
        <div className="flex gap-2">{actions}</div>
      ) : status === 'applied' ? (
        <span className="inline-flex items-center gap-3 text-sm text-[#2DCBAF]">
          <CircleCheck className="size-4" /> Applied
          {appliedHref ? (
            <Link href={appliedHref} className="inline-flex items-center gap-1 text-link transition-opacity hover:opacity-80">{appliedLabel} <ArrowRight className="size-3.5" /></Link>
          ) : null}
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5 text-sm text-fg-2"><CircleSlash className="size-4" /> Discarded, nothing was created</span>
      )}
    </div>
  )
}
