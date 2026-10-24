import type { Metadata } from 'next'
import Link from 'next/link'
import { ManualSearch } from '@/components/marketing/manual-search'
import { manualIndex, searchEntries } from '@/modules/manual/content'
import { pageMetadata } from '@/modules/marketing/seo'

export const dynamic = 'force-static'

export const metadata: Metadata = pageMetadata({ title: 'User manual', description: 'Step-by-step help for Flowbit Work, Muster, Orbit and Folio, with screenshots.', path: '/manual' })

/** /manual: search, then every chapter grouped by product with its topics. */
export default function ManualIndexPage() {
  const chapters = manualIndex()
  return (
    <div className="space-y-10">
      <header className="max-w-3xl space-y-4">
        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#979797]">Flowbit 2.0 · User manual</p>
        <h1 className="text-balance text-4xl font-semibold tracking-tight text-white sm:text-5xl">How to use Flowbit</h1>
        <p className="text-lg text-white/75">Step by step, with screenshots: getting started, then each product. Search for a page, a button or a task.</p>
        <ManualSearch entries={searchEntries()} />
      </header>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {chapters.map((c) => (
          <section key={c.slug} className="flex flex-col rounded-[14px] border border-line bg-white/[0.03] p-5" style={{ borderTop: `3px solid ${c.accent}` }}>
            <p className="text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: c.accent }}>{c.eyebrow}</p>
            <h2 className="mt-2 text-lg font-semibold text-white"><Link href={`/manual/${c.slug}`} className="hover:underline">{c.title}</Link></h2>
            <p className="mt-1 text-sm text-white/70">{c.summary}</p>
            <ul className="mt-4 grid gap-1 text-sm">
              {c.topics.slice(0, 8).map((t) => (
                <li key={t.id}><Link href={`/manual/${c.slug}#${t.id}`} className="text-white/80 transition-colors hover:text-white">{t.title}</Link></li>
              ))}
            </ul>
            {c.topics.length > 8 ? <Link href={`/manual/${c.slug}`} className="mt-3 text-sm text-link hover:underline">All {c.topics.length} topics</Link> : null}
          </section>
        ))}
      </div>
    </div>
  )
}
