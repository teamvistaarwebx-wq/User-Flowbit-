import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { PRODUCT_KEYS } from '@/lib/catalog'
import { MANUAL_CHAPTERS, chapterBySlug } from '@/modules/manual/chapters'
import { parseTopics } from '@/modules/manual/parse'
import { HELP_CARDS, PRODUCT_HOW_TO } from './help'

const topics = new Map(
  MANUAL_CHAPTERS.map((c) => [c.slug, new Set(parseTopics(readFileSync(path.join(process.cwd(), 'content', 'manual', c.file), 'utf8')).map((t) => t.id))]),
)
const exists = (ref: string) => {
  const [chapter, topic] = ref.split('#')
  return topics.get(chapter)?.has(topic) ?? false
}

describe('help centre cards', () => {
  it('has a card for each product, payroll, self-service, admin, what is new and the FAQ', () => {
    expect(HELP_CARDS.map((c) => c.key)).toEqual(['start', 'work', 'muster', 'payroll', 'me', 'orbit', 'folio', 'admin', 'new', 'faq'])
  })

  it('sends every card to a manual chapter that exists, or to /faq', () => {
    const bad = HELP_CARDS.filter((c) => {
      if (c.href === '/faq') return false
      const slug = c.href.replace(/^\/manual\//, '')
      return !c.href.startsWith('/manual/') || !chapterBySlug(slug) || c.chapter !== slug
    })
    expect(bad.map((c) => c.key)).toEqual([])
  })

  it('links only to manual topics that exist', () => {
    expect(HELP_CARDS.flatMap((c) => c.links.map((l) => l.guide)).filter((g) => !exists(g))).toEqual([])
  })
})

describe('How to use, per product', () => {
  it('lists 4 to 6 tasks for every product, each linking to a real topic', () => {
    for (const key of PRODUCT_KEYS) {
      const howTo = PRODUCT_HOW_TO[key]
      expect(howTo.tasks.length).toBeGreaterThanOrEqual(4)
      expect(howTo.tasks.length).toBeLessThanOrEqual(6)
      expect(chapterBySlug(howTo.chapter)).toBeDefined()
      expect(howTo.tasks.map((t) => t.guide).filter((g) => !exists(g))).toEqual([])
    }
  })
})
