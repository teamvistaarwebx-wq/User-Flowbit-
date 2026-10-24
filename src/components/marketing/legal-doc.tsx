import Link from 'next/link'
import { ScrollText } from 'lucide-react'
import { SectionLabel } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { LegalContent } from '@/modules/marketing/legal/types'
import { Mesh } from './mesh'

const LEGAL_LINKS = [
  { href: '/legal/terms', label: 'Terms of service' },
  { href: '/legal/privacy', label: 'Privacy policy' },
  { href: '/legal/refunds', label: 'Refunds & cancellation' },
  { href: '/legal/dpa', label: 'Data processing' },
]

/** Long-form legal page: title, last-updated date, contents rail and numbered sections. */
export function LegalDoc({ content, current }: { content: LegalContent; current: string }) {
  const { title, updated, intro, sections } = content
  return (
    <div className="relative isolate overflow-hidden px-4 pb-24 pt-14 sm:px-6 sm:pt-20">
      <Mesh className="-z-10 h-[520px]" intensity="soft" />
      <div className="mx-auto max-w-6xl">
        <SectionLabel icon={<ScrollText strokeWidth={1.5} />}>Legal</SectionLabel>
        <h1 className="mt-4 text-4xl font-semibold leading-tight text-white sm:text-5xl">{title}</h1>
        <p className="mt-3 text-sm text-[#979797]">Last updated {updated}</p>
        <div className="mt-12 grid gap-10 lg:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <nav aria-label="Legal pages" className="grid gap-0.5 border-l border-line pl-0">
              {LEGAL_LINKS.map((l) => (
                <Link key={l.href} href={l.href} aria-current={l.href === current ? 'page' : undefined} className={cn('relative px-4 py-2 text-sm transition-colors', l.href === current ? 'font-medium text-white before:absolute before:inset-y-1.5 before:-left-px before:w-[3px] before:rounded-r-[3px] before:bg-white' : 'text-white/65 hover:text-white')}>
                  {l.label}
                </Link>
              ))}
            </nav>
            <nav aria-label="On this page" className="mt-8 hidden gap-2 lg:grid">
              <p className="text-xs font-semibold uppercase tracking-[0.06em] text-white">On this page</p>
              {sections.map((s, i) => (
                <a key={s.id} href={`#${s.id}`} className="text-[13px] text-[#979797] transition-colors hover:text-white">{i + 1}. {s.heading}</a>
              ))}
            </nav>
          </aside>
          <article className="card-solid p-6 sm:p-10">
            <p className="text-base leading-relaxed text-white/80">{intro}</p>
            {sections.map((s, i) => (
              <section key={s.id} id={s.id} className="mt-10 scroll-mt-24">
                <h2 className="text-lg font-semibold text-white">{i + 1}. {s.heading}</h2>
                {s.paragraphs?.map((p) => <p key={p} className="mt-3 text-sm leading-relaxed text-white/75">{p}</p>)}
                {s.list?.length ? (
                  <ul className="mt-3 grid list-disc gap-2 pl-5 text-sm leading-relaxed text-white/75 marker:text-white/35">
                    {s.list.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                ) : null}
              </section>
            ))}
          </article>
        </div>
      </div>
    </div>
  )
}
