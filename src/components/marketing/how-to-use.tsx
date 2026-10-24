import Link from 'next/link'
import { ArrowRight, BookOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { guideHref } from '@/modules/marketing/content/faq'
import type { ProductHowTo } from '@/modules/marketing/content/help'

/** "How to use <product>": numbered key tasks, each opening its manual topic, and a Full guide button. */
export function HowToUse({ howTo, accent }: { howTo: ProductHowTo; accent: string }) {
  return (
    <div>
      <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {howTo.tasks.map((task, i) => (
          <li key={task.guide}>
            <Link
              href={guideHref(task.guide)}
              className="group flex h-full gap-4 rounded-[14px] border border-line bg-white/[0.03] p-5 transition-colors hover:border-white/20 hover:bg-white/[0.05] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-full text-sm font-semibold text-black" style={{ background: accent }} aria-hidden>{i + 1}</span>
              <span className="min-w-0">
                <span className="block font-medium text-white">{task.title}</span>
                <span className="mt-1 block text-sm leading-relaxed text-white/70">{task.body}</span>
                <span className="mt-2 inline-flex items-center gap-1 text-[13px] text-link">
                  Read the guide <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button variant="primary" href={`/manual/${howTo.chapter}`} icon={<BookOpen className="size-4" />}>Full guide</Button>
        <Button variant="secondary" href="/help">Help centre</Button>
      </div>
    </div>
  )
}
