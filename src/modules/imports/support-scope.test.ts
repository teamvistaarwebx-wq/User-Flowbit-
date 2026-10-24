import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

describe('support access import list', () => {
  it('lists every registered importer, in order, with its product', async () => {
    const { IMPORTERS } = await import('./registry')
    const { IMPORT_KINDS } = await import('./types')
    const { importScope } = await import('./support-scope')
    const rows = importScope(Object.values(IMPORTERS))
    expect(rows.map((r) => r.kind)).toEqual([...IMPORT_KINDS])
    expect(rows.find((r) => r.kind === 'team')?.product).toBe('Workspace')
    expect(rows.find((r) => r.kind === 'employees')?.product).toBe('Muster')
    expect(rows.find((r) => r.kind === 'folio_clients')?.product).toBe('Folio')
    expect(rows.every((r) => r.label && r.description)).toBe(true)
  })
  it('names billing and inventory as not importable, and none of them is an importer', async () => {
    const { IMPORTERS } = await import('./registry')
    const { NOT_IMPORTABLE } = await import('./support-scope')
    const labels = NOT_IMPORTABLE.map((n) => n.label.toLowerCase())
    expect(labels.some((l) => l.includes('billing'))).toBe(true)
    expect(labels.some((l) => l.includes('inventory'))).toBe(true)
    const importerLabels = Object.values(IMPORTERS).map((i) => i.label.toLowerCase())
    expect(NOT_IMPORTABLE.every((n) => !importerLabels.includes(n.label.toLowerCase()))).toBe(true)
  })
})
