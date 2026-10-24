import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { MANUAL_CHAPTERS } from './chapters'
import { parseTopics } from './parse'

vi.mock('server-only', () => ({}))

const read = (file: string) => readFileSync(path.join(process.cwd(), 'content', 'manual', file), 'utf8')
const all = MANUAL_CHAPTERS.map((c) => ({ ...c, html: read(c.file) }))

describe('manual content (content/manual)', () => {
  it('has every chapter, with unique topic ids', () => {
    const ids = all.flatMap((c) => parseTopics(c.html).map((t) => t.id))
    expect(ids.length).toBeGreaterThan(100)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('links only to topics that exist', () => {
    const ids = new Set(all.flatMap((c) => parseTopics(c.html).map((t) => t.id)))
    const targets = all.flatMap((c) => [...c.html.matchAll(/href="#([a-z0-9-]+)"/g)].map((m) => m[1]))
    expect(targets.filter((t) => !ids.has(t))).toEqual([])
  })

  it('ships every screenshot it shows', () => {
    const shots = all.flatMap((c) => [...c.html.matchAll(/src="shots\/([a-z0-9-]+\.jpg)"/g)].map((m) => m[1]))
    expect(shots.length).toBeGreaterThan(50)
    expect(shots.filter((f) => !existsSync(path.join(process.cwd(), 'public', 'manual-img', f)))).toEqual([])
    // The phone-sized copies: run `npx tsx scripts/manual-img-720.ts` after adding a screenshot.
    expect(shots.filter((f) => !existsSync(path.join(process.cwd(), 'public', 'manual-img', '720', f)))).toEqual([])
  })

  it('shows no screenshot of WhatsApp controls (they are hidden until WhatsApp launches)', () => {
    const shots = all.flatMap((c) => [...c.html.matchAll(/src="shots\/([a-z0-9-]+)\.jpg"/g)].map((m) => m[1]))
    const withWhatsApp = ['set-integrations', 'set-notifications', 'set-profile-notif', 'set-billing', 'set-profile', 'folio-quote', 'folio-receipt']
    expect(shots.filter((s) => withWhatsApp.includes(s))).toEqual([])
    expect(withWhatsApp.filter((f) => existsSync(path.join(process.cwd(), 'public', 'manual-img', `${f}.jpg`)))).toEqual([])
  })

  it('keeps WhatsApp to "coming soon" and the hosted 4 MB upload limit', () => {
    const text = all.map((c) => c.html).join('\n')
    const whatsapp = text.split('\n').filter((line) => /whatsapp/i.test(line))
    expect(whatsapp.every((line) => /coming soon/i.test(line))).toBe(true)
    expect(text).not.toMatch(/10 MB/)
  })

  it('covers the v2.0 and v2.1 features in What\'s new', () => {
    const ids = parseTopics(read('70-new.html')).map((t) => t.id)
    expect(ids).toEqual(expect.arrayContaining(['new-quick-add', 'new-breaks', 'new-task-panel', 'new-posts', 'new-get-started', 'new-location', 'new-google', 'new-sequences', 'new-clients', 'new-folio-charts', 'new-tally']))
  })

  it('covers the later v2 features: two-factor, Hindi, portal, bank, e-invoice, TDS, connectors and status', () => {
    const ids = all.flatMap((c) => parseTopics(c.html).map((t) => t.id))
    expect(ids).toEqual(expect.arrayContaining(['admin-company', 'admin-security', 'me-language', 'me-tax', 'muster-tax', 'work-client-portal', 'folio-bank', 'folio-einvoice', 'admin-connected-apps', 'admin-slack', 'admin-webhooks', 'admin-email-task', 'admin-status', 'new-latest']))
    const text = all.map((c) => c.html).join('\n')
    expect(text).toMatch(/Two-factor sign-in/)
    expect(text).toMatch(/From a biometric device/)
    expect(text).not.toMatch(/no separate two-factor setting/)
  })
})
