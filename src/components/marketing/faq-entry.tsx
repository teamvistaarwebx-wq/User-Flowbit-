import Link from 'next/link'
import { ArrowRight, Link2, Plus } from 'lucide-react'
import { guideHref, type FaqItem } from '@/modules/marketing/content/faq'

/**
 * One question as a native `<details>`: opens and closes with no JavaScript,
 * keyboard included. `href` is where "link to this question" points;
 * `anchorId` is the element id (the question id on /faq).
 */
export function FaqEntry({ item, href, anchorId = item.id }: { item: FaqItem; href: string; anchorId?: string }) {
  return (
    <details id={anchorId} className="group scroll-mt-28">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-left text-[15px] font-medium text-white transition-colors hover:bg-white/[0.03] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white/60 sm:px-6 [&::-webkit-details-marker]:hidden">
        <h3 className="font-medium">{item.q}</h3>
        <Plus className="size-4 shrink-0 text-white/60 transition-transform duration-200 group-open:rotate-45 group-open:text-white" strokeWidth={1.5} aria-hidden />
      </summary>
      <div className="px-5 pb-5 sm:px-6">
        <p className="text-sm leading-relaxed text-white/70">{item.a}</p>
        <p className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px]">
          {item.guide ? (
            <Link href={guideHref(item.guide)} className="inline-flex items-center gap-1.5 text-link hover:text-white">
              Read the guide <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          ) : null}
          <a href={href} className="inline-flex items-center gap-1.5 text-white/50 hover:text-white" aria-label={`Link to this question: ${item.q}`}>
            <Link2 className="size-3.5" aria-hidden /> Link
          </a>
        </p>
      </div>
    </details>
  )
}
