import { describe, expect, it } from 'vitest'
import type { Permission, ProductKey } from '@/lib/catalog'
import { previewProduct, previewRailKey, railTop, sideSections, type Access } from './nav-model'

const access = (perms: Permission[]): Access => {
  const product = { entitled: true, enabled: true }
  return {
    can: (p?: Permission) => !p || perms.includes(p),
    has: () => true,
    hasFeature: () => true,
    products: { work: product, muster: product, orbit: product, folio: product } as Record<ProductKey, typeof product>,
    hasEmployee: true,
  }
}

describe('nav-model Folio gating', () => {
  it('sends a quotes-only member (sales) to Quotes and hides the rest of Folio', () => {
    const viewer = access(['quotes.write', 'clients.read'])
    expect(railTop(viewer).find((e) => e.key === 'folio')?.target).toBe('/app/folio/quotes')
    const links = sideSections('folio', viewer).flatMap((s) => s.links ?? []).map((l) => l.href)
    expect(links).toContain('/app/folio/quotes')
    expect(links).not.toContain('/app/folio/invoices')
    expect(links).not.toContain('/app/folio/ledger')
  })

  it('hides Folio from members with no Folio permission', () => {
    expect(railTop(access([])).find((e) => e.key === 'folio')).toBeUndefined()
  })

  it('opens Receivables for members who can read Folio', () => {
    expect(railTop(access(['folio.read'])).find((e) => e.key === 'folio')?.target).toBe('/app/folio')
  })
})

describe('nav-model Work rail gating', () => {
  it('hides the side-panel projects section without projects.read (its links open the Projects page)', () => {
    expect(sideSections('work', access(['tasks.read'])).map((s) => s.key)).not.toContain('projects')
    expect(sideSections('work', access(['tasks.read', 'projects.read'])).map((s) => s.key)).toContain('projects')
  })

  it('hides Work items a custom role cannot open (each page requires the same permission)', () => {
    const keys = railTop(access(['tasks.read'])).map((e) => e.key)
    expect(keys).toEqual(expect.arrayContaining(['home', 'tasks', 'spaces', 'team', 'meeting']))
    expect(keys).not.toContain('arc')
    expect(keys).not.toContain('project')
    expect(keys).not.toContain('client')
  })

  it('shows Arc, Project and Client with their permissions', () => {
    const keys = railTop(access(['tasks.read', 'arc.use', 'projects.read', 'clients.read'])).map((e) => e.key)
    expect(keys).toEqual(expect.arrayContaining(['arc', 'project', 'client']))
  })
})

describe('nav-model product preview', () => {
  const params = (query: string) => new URLSearchParams(query)

  it('reads the previewed product from ?product or ?feature on /app/locked only', () => {
    expect(previewProduct('/app/locked', params('product=orbit'))).toBe('orbit')
    expect(previewProduct('/app/locked', params('feature=muster.payroll'))).toBe('muster')
    expect(previewProduct('/app/locked', params('product=nope'))).toBeNull()
    expect(previewProduct('/app/orbit', params('product=orbit'))).toBeNull()
  })

  it('highlights exactly one rail item for the previewed product', () => {
    const entries = railTop(access(['arc.use', 'tasks.read', 'people.read', 'orbit.read']))
    expect(previewRailKey(entries, 'orbit')).toBe('orbit')
    expect(previewRailKey(entries, 'muster')).toBe('hr')
    expect(previewRailKey(entries, 'work')).toBe('tasks')
    expect(previewRailKey(entries, null)).toBeUndefined()
  })
})

describe('nav-model labels and Finance links (audit A10)', () => {
  it('uses plural Work labels and names the Work reports item', () => {
    const labels = railTop(access(['tasks.read', 'projects.read', 'clients.read', 'work.reports'])).map((e) => e.label)
    expect(labels).toEqual(expect.arrayContaining(['Teams', 'Projects', 'Clients', 'Meetings', 'Work reports']))
    expect(sideSections('work', access(['projects.read']))[0].label).toBe('Projects')
  })

  it('gives Finance (folio.settings, no org.manage) the Compliance calendar link in Folio', () => {
    const links = (perms: Permission[]) => sideSections('folio', access(perms)).flatMap((s) => s.links ?? []).map((l) => l.href)
    expect(links(['folio.read', 'folio.settings'])).toContain('/app/settings/compliance')
    expect(links(['folio.read'])).not.toContain('/app/settings/compliance')
    const settingsLinks = sideSections('settings', access(['folio.settings'])).flatMap((s) => s.links ?? []).map((l) => l.href)
    expect(settingsLinks).toContain('/app/settings/compliance')
  })

  it('keeps HR reports and settings out of the Documents section', () => {
    const docs = sideSections('muster', access(['letters.read', 'hr.reports', 'hr.settings'])).find((s) => s.key === 'docs')
    expect(docs?.links?.map((l) => l.href)).toEqual(['/app/hr/letters'])
  })
})

describe('nav-model product names (audit A7)', () => {
  it('names product rail items after the product, with its descriptor', async () => {
    const { productLabel } = await import('@/lib/catalog')
    const entries = railTop(access(['people.read', 'orbit.read', 'folio.read']))
    const byKey = Object.fromEntries(entries.map((e) => [e.key, e]))
    expect(byKey.hr.label).toBe('Muster')
    expect(productLabel(byKey.hr.product!)).toBe('Muster · HR')
    expect(productLabel(byKey.orbit.product!)).toBe('Orbit · Sales')
    expect(productLabel(byKey.folio.product!)).toBe('Folio · Invoicing')
    expect(productLabel('work')).toBe('Work · Tasks')
  })

  it('opens each product home under its product name in the side panel', () => {
    const first = (panel: 'muster' | 'orbit' | 'folio', perms: Permission[]) => sideSections(panel, access(perms))[0].links?.[0].label
    expect(first('muster', ['people.read'])).toBe('Muster')
    expect(first('orbit', ['orbit.read'])).toBe('Orbit')
    expect(first('folio', ['folio.read'])).toBe('Folio')
  })
})

describe('nav-model workspace kind', () => {
  const freelancer = (entitled: boolean): Access => {
    const base = access(['people.read', 'orbit.read', 'folio.read'])
    const on = { entitled: true, enabled: true }
    return { ...base, products: { work: on, muster: { entitled, enabled: false, hidden: true }, orbit: on, folio: on } }
  }

  it('hides Muster from a freelancer workspace instead of offering it locked, whatever the plan', () => {
    expect(railTop(freelancer(false)).find((e) => e.key === 'hr')).toBeUndefined()
    expect(railTop(freelancer(true)).find((e) => e.key === 'hr')).toBeUndefined()
    expect(railTop(freelancer(false)).map((e) => e.key)).toEqual(expect.arrayContaining(['orbit', 'folio', 'team']))
  })

  it('still offers a product the plan lacks, locked, when the kind allows it', () => {
    const viewer = { ...freelancer(false), products: { ...freelancer(false).products, orbit: { entitled: false, enabled: true } } }
    expect(railTop(viewer).find((e) => e.key === 'orbit')?.state).toBe('locked')
  })
})
