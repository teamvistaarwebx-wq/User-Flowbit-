import Link from 'next/link'
import { ArrowRight, LifeBuoy } from 'lucide-react'
import { CtaBand } from '@/components/marketing/cta-band'
import { Mesh } from '@/components/marketing/mesh'
import { SectionLabel } from '@/components/ui/card'
import { Icon } from '@/components/ui/icon'
import { chapterBySlug } from '@/modules/manual/chapters'
import { guideHref } from '@/modules/marketing/content/faq'
import { HELP_CARDS, type HelpCard } from '@/modules/marketing/content/help'
import { pageMetadata } from '@/modules/marketing/seo'

export const metadata = pageMetadata({
  title: 'Help centre',
  description: 'How to use Flowbit: getting started, Work, Muster, self-service, Orbit, Folio, admin and settings, what is new in 2.0, and the FAQ.',
  path: '/help',
})

const FAQ_ACCENT = '#EAC1DC'

function HelpCardView({ card }: { card: HelpCard }) {
  const accent = (card.chapter && chapterBySlug(card.chapter)?.accent) || FAQ_ACCENT
  const titleId = `help-${card.key}`
  return (
    <section aria-labelledby={titleId} className="group relative flex flex-col rounded-[14px] border border-line bg-white/[0.03] p-5 transition-colors hover:border-white/20 hover:bg-white/[0.05]" style={{ borderTop: `3px solid ${accent}` }}>
      <span className="grid size-10 place-items-center rounded-[10px] bg-white/[0.06]" style={{ color: accent }}>
        <Icon name={card.icon} className="size-5" strokeWidth={1.5} />
      </span>
      <h2 id={titleId} className="mt-4 text-lg font-semibold text-white">
        <Link href={card.href} className="rounded-[4px] after:absolute after:inset-0 after:rounded-[14px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60">
          {card.title}
        </Link>
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-white/70">{card.body}</p>
      {card.links.length ? (
        <ul className="relative z-10 mt-4 grid gap-1 text-sm">
          {card.links.map((l) => (
            <li key={l.guide}>
              <Link href={guideHref(l.guide)} className="text-white/80 transition-colors hover:text-white hover:underline">{l.label}</Link>
            </li>
          ))}
        </ul>
      ) : null}
      <span className="mt-auto inline-flex items-center gap-1.5 pt-5 text-sm text-link" aria-hidden>
        {card.href === '/faq' ? 'Browse the questions' : 'Open the guide'} <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
      </span>
    </section>
  )
}

/** /help: one card per product and topic, each opening its manual chapter (or the FAQ). */
export default function HelpPage() {
  return (
    <>
      <section className="relative isolate overflow-hidden px-4 pb-4 pt-16 sm:px-6 sm:pt-20">
        <Mesh className="-z-10" intensity="soft" />
        <div className="mx-auto max-w-6xl">
          <SectionLabel icon={<LifeBuoy strokeWidth={1.5} />}>Help centre</SectionLabel>
          <h1 className="mt-4 max-w-3xl text-balance text-[40px] font-semibold leading-[1.08] text-white sm:text-[52px]">How to use Flowbit</h1>
          <p className="mt-5 max-w-2xl text-pretty text-lg text-white/75">
            Pick a product for its step-by-step guide, or search the <Link href="/manual" className="text-link hover:text-white">user manual</Link> and the <Link href="/faq" className="text-link hover:text-white">FAQ</Link>. Can’t find it? <Link href="/contact" className="text-link hover:text-white">Ask us</Link>.
          </p>
        </div>
      </section>
      <section className="px-4 pb-20 pt-10 sm:px-6">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {HELP_CARDS.map((card) => (
            <HelpCardView key={card.key} card={card} />
          ))}
        </div>
      </section>
      <CtaBand title="Learn it hands-on: start free." />
    </>
  )
}
