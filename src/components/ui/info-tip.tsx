'use client'

import Link from 'next/link'
import { CircleHelp } from 'lucide-react'
import { EXPLAINERS, type ConceptKey } from '@/lib/explainers'
import { cn } from '@/lib/utils'
import { Popover } from './popover'

export type InfoTipProps = { concept: ConceptKey; className?: string }

/** A small "?" that opens a short explainer for a concept (lib/explainers), with links to the related pages. */
export function InfoTip({ concept, className }: InfoTipProps) {
  const e = EXPLAINERS[concept]
  return (
    <Popover
      align="start"
      className="w-80"
      trigger={
        <button
          type="button"
          aria-label={`What is this? ${e.title}`}
          className={cn('inline-flex size-6 shrink-0 items-center justify-center rounded-full text-fg-3 transition-colors hover:bg-white/[0.06] hover:text-fg', className)}
        >
          <CircleHelp className="size-4" strokeWidth={1.5} />
        </button>
      }
    >
      <p className="text-sm font-medium text-fg">{e.title}</p>
      {e.body.map((line) => (
        <p key={line} className="mt-2 text-[13px] leading-5 text-fg-2">
          {line}
        </p>
      ))}
      {e.links?.length ? (
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t border-line-soft pt-3">
          {e.links.map((l) => (
            <Link key={l.href} href={l.href} className="text-[13px] text-fg underline-offset-2 hover:underline">
              {l.label}
            </Link>
          ))}
        </div>
      ) : null}
    </Popover>
  )
}
