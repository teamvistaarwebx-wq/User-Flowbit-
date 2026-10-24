import { describe, expect, it } from 'vitest'
import { breadcrumbFor, canOpenPage, findPage, isPermission, pagePermitted, panelFor, PAGES, SIDE_PANELS, type Permission } from './catalog'

describe('catalog', () => {
  it('has unique hrefs', () => {
    const hrefs = PAGES.map((p) => p.href)
    expect(new Set(hrefs).size).toBe(hrefs.length)
  })

  it('prefers static routes over [param] routes', () => {
    expect(findPage('/app/hr/payroll/structures')?.title).toBe('Salary structures')
    expect(findPage('/app/hr/payroll/66f0c0ffee')?.title).toBe('Payroll cycle')
    expect(findPage('/app/clients/new')?.title).toBe('New client')
  })

  it('builds breadcrumbs from matching ancestors', () => {
    expect(breadcrumbFor('/app/work/tasks/abc').map((c) => c.label)).toEqual(['Home', 'Tasks', 'Task'])
    // Each product home is titled with the product's name, as a page and as an ancestor.
    expect(breadcrumbFor('/app/folio/invoices/x/edit').map((c) => c.label)).toEqual(['Home', 'Folio', 'Invoices', 'Invoice', 'Edit invoice'])
    expect(breadcrumbFor('/app/folio').map((c) => c.label)).toEqual(['Home', 'Folio'])
    expect(breadcrumbFor('/app/orbit/leads').map((c) => c.label)).toEqual(['Home', 'Orbit', 'Leads'])
    expect(breadcrumbFor('/app/hr/people').map((c) => c.label)).toEqual(['Home', 'Muster', 'People'])
  })

  it('shows settings pages under Settings, not under General', () => {
    expect(breadcrumbFor('/app/settings/profile')).toEqual([
      { label: 'Home', href: '/app' },
      { label: 'Settings', href: '/app/settings/profile' },
      { label: 'My account (login)', href: '/app/settings/profile' },
    ])
    expect(breadcrumbFor('/app/settings').map((c) => c.label)).toEqual(['Home', 'General'])
  })

  it('lists the extra Folio and Muster routes from the specs', () => {
    expect(findPage('/app/folio/receipts/66f0c0ffee')?.title).toBe('Receipt')
    expect(findPage('/app/folio/receipts/new')?.title).toBe('New receipt')
    expect(findPage('/app/folio/credit-notes/new')?.title).toBe('New credit note')
    expect(findPage('/app/folio/recurring/plans/new')?.title).toBe('New billing plan')
    expect(findPage('/app/folio/ledger')?.title).toBe('Ledgers')
    expect(findPage('/app/folio/collections')?.perm).toBe('folio.read')
    expect(findPage('/app/hr/reports/gratuity')?.feature).toBe('muster.payroll')
    const folioLinks = SIDE_PANELS.folio.flatMap((s) => s.links ?? []).map((l) => l.href)
    expect(folioLinks).toEqual(expect.arrayContaining(['/app/folio/collections', '/app/folio/ledger']))
  })

  it('only uses known permissions on pages and links', () => {
    const links = Object.values(SIDE_PANELS).flat().flatMap((s) => s.links ?? [])
    const perms = [
      ...PAGES.flatMap((p) => [p.perm, ...(p.anyPerm ?? [])]),
      ...Object.values(SIDE_PANELS).flat().flatMap((s) => [s.addPerm, s.perm]),
      ...links.flatMap((l) => [l.perm, ...(l.anyPerm ?? [])]),
    ].filter(Boolean)
    expect(perms.every((p) => isPermission(p as string))).toBe(true)
  })

  it('picks the side panel by path', () => {
    expect(panelFor('/app/me/leave')).toBe('muster')
    expect(panelFor('/app/folio/invoices')).toBe('folio')
    // The notifications inbox is a page of its own (the bell's "view all"), not a Settings page.
    expect(panelFor('/app/notifications')).toBe('work')
    expect(panelFor('/app/settings/notifications')).toBe('settings')
    expect(panelFor('/app')).toBe('work')
    // Shared pages keep the product panel the member came from (Orbit or Folio), else Work.
    expect(panelFor('/app/clients', 'folio')).toBe('folio')
    expect(panelFor('/app/clients/66f0c0ffee', 'orbit')).toBe('orbit')
    expect(panelFor('/app/whatsapp', 'orbit')).toBe('orbit')
    expect(panelFor('/app/clients', 'settings')).toBe('work')
    expect(panelFor('/app/clients')).toBe('work')
    expect(panelFor('/app/work/tasks', 'folio')).toBe('work')
    expect(panelFor('/app/settings/import/employees', 'people')).toBe('muster')
    expect(panelFor('/app/settings/import/employees')).toBe('settings')
  })

  it('canOpenPage applies the product, feature and permission gates', () => {
    const viewer = (perms: Permission[], opts: { payroll?: boolean; orbit?: boolean } = {}) => ({
      has: (p: string) => p !== 'orbit' || opts.orbit !== false,
      hasFeature: (f: string) => f !== 'muster.payroll' || opts.payroll !== false,
      can: (p: Permission) => perms.includes(p),
    })
    expect(canOpenPage('/app/hr/payroll/structures', viewer(['payroll.read']))).toBe(true)
    expect(canOpenPage('/app/hr/payroll/structures', viewer(['payroll.read'], { payroll: false }))).toBe(false)
    expect(canOpenPage('/app/settings/members', viewer(['audit.read']))).toBe(false)
    expect(canOpenPage('/app/orbit/deals/66f0c0ffee', viewer(['orbit.read'], { orbit: false }))).toBe(false)
    expect(canOpenPage('/app/orbit/deals/66f0c0ffee', viewer(['orbit.read']))).toBe(true)
    expect(canOpenPage('/app/settings/profile', viewer([]))).toBe(true)
    expect(canOpenPage('/somewhere/else', viewer([]))).toBe(true)
    expect(canOpenPage('/app/folio/quotes', viewer(['quotes.write']))).toBe(true)
    expect(canOpenPage('/app/folio/quotes/66f0c0ffee', viewer(['folio.read']))).toBe(true)
    expect(canOpenPage('/app/folio/quotes', viewer([]))).toBe(false)
    expect(canOpenPage('/app/folio/invoices', viewer(['quotes.write']))).toBe(false)
  })
})

describe('canOpenPage for breadcrumbs', () => {
  const viewer = (perms: string[]) => ({ can: (p?: Permission) => !p || perms.includes(p), has: () => true, hasFeature: () => true })
  it('opens Folio itself only with folio.read, while Quotes also opens with quotes.write (sales)', () => {
    expect(canOpenPage('/app/folio', viewer(['quotes.write']))).toBe(false)
    expect(canOpenPage('/app/folio', viewer(['folio.read']))).toBe(true)
    expect(canOpenPage('/app/folio/quotes', viewer(['quotes.write']))).toBe(true)
  })
  it('leaves parent crumbs out of the trail when the viewer cannot open them', () => {
    expect(breadcrumbFor('/app/folio/quotes/new', viewer(['quotes.write'])).map((c) => c.href)).not.toContain('/app/folio')
    expect(breadcrumbFor('/app/folio/quotes/new', viewer(['quotes.write'])).map((c) => c.href)).toContain('/app/folio/quotes')
    expect(breadcrumbFor('/app/folio/quotes/new', viewer(['folio.read'])).map((c) => c.href)).toContain('/app/folio')
  })
})

describe('catalog integrity (audit A)', () => {
  const panelLinks = Object.values(SIDE_PANELS).flat().flatMap((s) => s.links ?? [])

  it('links every side-panel item to a catalog page', () => {
    for (const link of panelLinks) expect(findPage(link.href.split('?')[0]), link.href).toBeDefined()
  })

  it('gives no two pages the same title in one panel, and no two Settings links the same label', () => {
    const settings = SIDE_PANELS.settings.flatMap((s) => s.links ?? []).map((l) => l.label)
    expect(new Set(settings).size).toBe(settings.length)
    expect(findPage('/app/notifications')?.title).not.toBe(findPage('/app/settings/notifications')?.title)
  })

  it('keeps a side link gate no looser than its page gate', () => {
    for (const link of panelLinks) {
      const page = findPage(link.href.split('?')[0])!
      const linkPerms = link.perm ? [link.perm] : (link.anyPerm ?? [])
      // Every permission that shows the link must also open the page.
      for (const perm of linkPerms) expect(pagePermitted(page, (p) => p === perm), `${link.label} (${perm}) -> ${page.href}`).toBe(true)
    }
  })
})

describe('Settings grouping (audit A18)', () => {
  it('groups Settings into You, Company, People and access, Plan, Automation and messages, Data', () => {
    expect(SIDE_PANELS.settings.map((s) => s.label)).toEqual(['You', 'Company', 'People and access', 'Plan', 'Automation and messages', 'Data'])
  })

  it('gates Export and Compliance calendar links the same way as their pages', () => {
    const links = SIDE_PANELS.settings.flatMap((s) => s.links ?? [])
    const exp = links.find((l) => l.href === '/app/settings/export')!
    expect(exp.perm).toBe(findPage('/app/settings/export')?.perm)
    expect(links.find((l) => l.href === '/app/settings/compliance')?.anyPerm).toEqual(findPage('/app/settings/compliance')?.anyPerm)
  })
})

