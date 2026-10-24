import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { MANUAL_CHAPTERS, chapterBySlug } from '@/modules/manual/chapters'
import { chapterHtml, manualIndex } from '@/modules/manual/content'
import { pageMetadata } from '@/modules/marketing/seo'

type Props = { params: Promise<{ slug: string }> }

export const dynamicParams = false

export function generateStaticParams() {
  return MANUAL_CHAPTERS.map((c) => ({ slug: c.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const chapter = chapterBySlug((await params).slug)
  return chapter ? pageMetadata({ title: `${chapter.eyebrow}: ${chapter.title}`, description: chapter.summary, path: `/manual/${chapter.slug}` }) : {}
}

/** One chapter: its contents on the side (top on phones) and the chapter text. */
export default async function ManualChapterPage({ params }: Props) {
  const chapter = chapterBySlug((await params).slug)
  if (!chapter) notFound()
  const index = manualIndex()
  const at = index.findIndex((c) => c.slug === chapter.slug)
  const topics = index[at].topics
  const prev = index[at - 1]
  const next = index[at + 1]
  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[240px_minmax(0,1fr)]">
      <nav aria-label="In this chapter" className="lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7rem)] lg:self-start lg:overflow-y-auto">
        <Link href="/manual" className="inline-flex items-center gap-1 text-sm text-white/70 hover:text-white"><ChevronLeft className="size-4" />All chapters</Link>
        <p className="mt-4 text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: chapter.accent }}>{chapter.eyebrow}</p>
        <details className="mt-2 lg:hidden">
          <summary className="cursor-pointer text-sm text-white">{topics.length} topics in this chapter</summary>
          <TopicList slug={chapter.slug} topics={topics} />
        </details>
        <div className="max-lg:hidden"><TopicList slug={chapter.slug} topics={topics} /></div>
      </nav>
      <article className="min-w-0">
        {/* Repo content (content/manual), reviewed text, never user input. */}
        <div className="manual-doc" style={{ ['--c' as string]: chapter.accent }} dangerouslySetInnerHTML={{ __html: chapterHtml(chapter) }} />
        <nav aria-label="Chapters" className="mt-16 flex flex-wrap justify-between gap-3 border-t border-line pt-6 text-sm">
          {prev ? <Link href={`/manual/${prev.slug}`} className="inline-flex items-center gap-1 text-white/80 hover:text-white"><ChevronLeft className="size-4" />{prev.eyebrow}</Link> : <span />}
          {next ? <Link href={`/manual/${next.slug}`} className="inline-flex items-center gap-1 text-white/80 hover:text-white">{next.eyebrow}<ChevronRight className="size-4" /></Link> : null}
        </nav>
      </article>
    </div>
  )
}

function TopicList({ slug, topics }: { slug: string; topics: { id: string; title: string }[] }) {
  return (
    <ul className="mt-2 grid gap-0.5 text-sm">
      {topics.map((t) => (
        <li key={t.id}><a href={`/manual/${slug}#${t.id}`} className="block rounded-[6px] px-2 py-1 text-white/70 transition-colors hover:bg-white/[0.05] hover:text-white">{t.title}</a></li>
      ))}
    </ul>
  )
}
