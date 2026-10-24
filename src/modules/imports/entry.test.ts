import { describe, expect, it } from 'vitest'
import { findPage } from '@/lib/catalog'
import { IMPORT_FROM, importBack, importHref } from './entry'
import { IMPORT_KINDS } from './types'

describe('one import screen per importer (audit A9)', () => {
  it('sends every kind to Settings → Import, except leads which open Orbit’s dialog', () => {
    expect(importHref('employees', 'people')).toBe('/app/settings/import/employees?from=people')
    expect(importHref('attendance', 'attendance')).toBe('/app/settings/import/attendance?from=attendance')
    expect(importHref('folio_clients', 'clients')).toBe('/app/settings/import/folio_clients?from=clients')
    expect(importHref('leads', 'clients')).toBe('/app/orbit/leads?import=1')
  })

  it('links only to catalog pages', () => {
    for (const kind of IMPORT_KINDS) expect(findPage(importHref(kind).split('?')[0]), kind).toBeDefined()
    for (const back of Object.values(IMPORT_FROM)) expect(findPage(back.href.split('?')[0]), back.href).toBeDefined()
  })

  it('returns to the page the import started from, else the Import hub', () => {
    expect(importBack('people')).toEqual({ href: '/app/hr/people', label: 'People' })
    expect(importBack('nope')).toEqual({ href: '/app/settings/import', label: 'Import' })
    expect(importBack(undefined).href).toBe('/app/settings/import')
  })
})
