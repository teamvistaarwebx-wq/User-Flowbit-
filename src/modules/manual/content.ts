import 'server-only'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { cache } from 'react'
import { MANUAL_CHAPTERS, type ManualChapter } from './chapters'
import { parseTopics, rewriteHtml, type ManualTopic } from './parse'

/**
 * Loads content/manual at build time: the manual pages are static
 * (`force-static`), so the files are read once by `next build` and the site
 * never needs the folder at run time.
 */

const DIR = path.join(process.cwd(), 'content', 'manual')

const raw = cache((file: string): string => readFileSync(path.join(DIR, file), 'utf8'))

export type ChapterWithTopics = ManualChapter & { topics: ManualTopic[] }

export const manualIndex = cache((): ChapterWithTopics[] => MANUAL_CHAPTERS.map((c) => ({ ...c, topics: parseTopics(raw(c.file)) })))

/** The chapter's HTML, ready for the page. */
export function chapterHtml(chapter: ManualChapter): string {
  const chapterOfTopic = new Map(manualIndex().flatMap((c) => c.topics.map((t) => [t.id, c.slug] as const)))
  return rewriteHtml(raw(chapter.file), chapter.slug, chapterOfTopic)
}

export type SearchEntry = { slug: string; chapter: string; id: string; title: string; text: string }

/** Topic titles and text for the search box (text trimmed to keep the page light). */
export function searchEntries(): SearchEntry[] {
  return manualIndex().flatMap((c) => c.topics.map((t) => ({ slug: c.slug, chapter: c.eyebrow, id: t.id, title: t.title, text: t.text.slice(0, 800) })))
}
