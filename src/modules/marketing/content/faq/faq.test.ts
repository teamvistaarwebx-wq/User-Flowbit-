import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { PRODUCT_KEYS } from '@/lib/catalog'
import { MANUAL_CHAPTERS } from '@/modules/manual/chapters'
import { parseTopics } from '@/modules/manual/parse'
import {
  ALL_FAQ,
  FAQ_CATEGORIES,
  LANDING_FAQ,
  PRICING_FAQ,
  PRODUCT_FAQ_IDS,
  faqJsonLd,
  guideHref,
  jsonLdScript,
  matchesQuery,
  pickFaq,
  productFaq,
} from './index'

const topicsByChapter = new Map(
  MANUAL_CHAPTERS.map((c) => [c.slug, new Set(parseTopics(readFileSync(path.join(process.cwd(), 'content', 'manual', c.file), 'utf8')).map((t) => t.id))]),
)

/** The 32 tutorial FAQ videos (flowbit-launch/tutorials), F01 to F32, as FAQ ids. */
const TUTORIAL_TOPICS = [
  'what-is-flowbit', 'sign-up', 'find-your-way', 'invite-team', 'roles-permissions', 'flowbit-invoices',
  'create-tasks', 'spaces-projects', 'meetings-action-items', 'posts', 'time-tracking', 'whiteboards', 'work-reports', 'what-is-arc',
  'add-employees', 'employee-profile', 'attendance-lock', 'leave-approval', 'claims', 'run-payroll', 'hr-letters', 'self-service',
  'add-leads', 'deals-pipeline', 'sales-follow-ups', 'shared-clients',
  'gst-invoice', 'record-payment', 'quotes-credit-notes', 'receivables', 'gst-reports', 'expenses-pnl',
]

describe('FAQ data', () => {
  it('has unique, anchor-safe ids', () => {
    // Arrange
    const ids = ALL_FAQ.map((f) => f.id)
    // Assert
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.filter((id) => !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id))).toEqual([])
  })

  it('uses every category, and only known ones', () => {
    const known = new Set<string>(FAQ_CATEGORIES.map((c) => c.key))
    expect(ALL_FAQ.filter((f) => !known.has(f.category))).toEqual([])
    expect(FAQ_CATEGORIES.filter((c) => !ALL_FAQ.some((f) => f.category === c.key)).map((c) => c.key)).toEqual([])
  })

  it('answers all 32 tutorial questions and the v2 topics', () => {
    const ids = new Set(ALL_FAQ.map((f) => f.id))
    expect(TUTORIAL_TOPICS).toHaveLength(32)
    expect(TUTORIAL_TOPICS.filter((id) => !ids.has(id))).toEqual([])
    const v2 = ['task-side-panel', 'quick-add-hinglish', 'breaks', 'location-check-in', 'biometric-import', 'company-profile', 'brand-colours', 'automations', 'briefs', 'email-alerts', 'client-portal', 'bank-import', 'tally-export', 'e-invoice', 'tds-form-16', 'google-calendar', 'sequences', 'what-is-arc', 'connect-claude-chatgpt', 'data-export', 'privacy-dpdp', 'security', 'two-factor', 'free-plan', 'trial', 'pricing', 'gst', 'refunds', 'whatsapp']
    expect(v2.filter((id) => !ids.has(id))).toEqual([])
  })

  it('keeps answers short and non-empty', () => {
    expect(ALL_FAQ.filter((f) => !f.q.trim().endsWith('?') || f.a.trim().length < 20)).toEqual([])
    expect(ALL_FAQ.filter((f) => f.a.length > 520).map((f) => f.id)).toEqual([])
  })

  it('mentions WhatsApp only as coming soon', () => {
    const mentions = ALL_FAQ.filter((f) => /whatsapp/i.test(`${f.q} ${f.a}`))
    expect(mentions.length).toBeGreaterThan(0)
    expect(mentions.filter((f) => !/coming soon/i.test(f.a)).map((f) => f.id)).toEqual([])
  })

  it('does not repeat the v1 "not yet" answers for features that now exist', () => {
    const answer = (id: string) => pickFaq([id])[0].a
    expect(answer('e-invoice')).not.toMatch(/^not yet/i)
    expect(answer('sequences')).not.toMatch(/^not yet/i)
    expect(answer('tds-form-16')).not.toMatch(/^no\b/i)
  })

  it('links every guide to a manual topic that exists in that chapter', () => {
    const broken = ALL_FAQ.filter((f) => {
      if (!f.guide) return false
      const [chapter, topic] = f.guide.split('#')
      return !topicsByChapter.get(chapter)?.has(topic)
    }).map((f) => `${f.id} → ${f.guide}`)
    expect(broken).toEqual([])
    expect(ALL_FAQ.filter((f) => f.guide).length).toBeGreaterThan(ALL_FAQ.length * 0.75)
    expect(guideHref('work#work-tasks')).toBe('/manual/work#work-tasks')
  })
})

describe('FAQ subsets (one source for every page)', () => {
  it('builds the landing, pricing and product lists from the same items', () => {
    expect(LANDING_FAQ).toHaveLength(6)
    expect(PRICING_FAQ.length).toBeGreaterThanOrEqual(10)
    for (const key of PRODUCT_KEYS) {
      expect(productFaq(key).length).toBeGreaterThanOrEqual(4)
      expect(productFaq(key).every((f) => ALL_FAQ.includes(f))).toBe(true)
    }
    expect(Object.keys(PRODUCT_FAQ_IDS).sort()).toEqual([...PRODUCT_KEYS].sort())
  })

  it('refuses an unknown id', () => {
    expect(() => pickFaq(['no-such-question'])).toThrow(/Unknown FAQ id/)
  })
})

describe('FAQ search', () => {
  it('matches every word in the question or answer, case-insensitively', () => {
    const item = pickFaq(['e-invoice'])[0]
    expect(matchesQuery(item, '')).toBe(true)
    expect(matchesQuery(item, 'IRN way')).toBe(true)
    expect(matchesQuery(item, 'irn payroll')).toBe(false)
  })
})

describe('FAQPage JSON-LD', () => {
  it('lists every question with its answer', () => {
    // Act
    const data = faqJsonLd(ALL_FAQ)
    // Assert
    expect(data['@context']).toBe('https://schema.org')
    expect(data['@type']).toBe('FAQPage')
    expect(data.mainEntity).toHaveLength(ALL_FAQ.length)
    expect(data.mainEntity[0]).toEqual({ '@type': 'Question', name: ALL_FAQ[0].q, acceptedAnswer: { '@type': 'Answer', text: ALL_FAQ[0].a } })
  })

  it('escapes < so the script tag cannot be closed early', () => {
    const out = jsonLdScript({ text: '</script><b>' })
    expect(out).not.toContain('<')
    expect(JSON.parse(out)).toEqual({ text: '</script><b>' })
  })
})
