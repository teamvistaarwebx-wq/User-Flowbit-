import { describe, expect, it, vi } from 'vitest'
import { BIOMETRIC_PUNCH_ROWS, FILE_LIMITS, IMPORT_ROW_LIMITS, IMPORT_LIMITS_COPY } from './limits'

vi.mock('server-only', () => ({}))

describe('the one limits table (B25, B26) matches the code', () => {
  it('lists every importer with its real row limit', async () => {
    const { IMPORTERS } = await import('@/modules/imports/registry')
    expect(IMPORT_ROW_LIMITS.map((r) => r.kind).sort()).toEqual(Object.keys(IMPORTERS).sort())
    for (const row of IMPORT_ROW_LIMITS) {
      const importer = IMPORTERS[row.kind as keyof typeof IMPORTERS]
      expect({ kind: row.kind, rows: importer.maxRows, label: importer.label }).toEqual({ kind: row.kind, rows: row.rows, label: row.label })
    }
  })

  it('states the file sizes the code enforces', async () => {
    const { VERCEL_MAX_UPLOAD_MB } = await import('@/lib/upload-limit')
    const { MAX_IMPORT_BYTES } = await import('@/modules/imports/sheet')
    const { EXPORT_FILE_BYTES } = await import('@/modules/lifecycle/export')
    const { LOGO_MAX_BYTES } = await import('@/lib/entity-logo')
    const { MAX_PUNCH_ROWS } = await import('@/modules/muster/attendance/biometric/formats')
    const MB = 1024 * 1024
    expect(FILE_LIMITS[0].limit).toContain(`${VERCEL_MAX_UPLOAD_MB} MB`)
    expect(FILE_LIMITS.find((r) => r.what.startsWith('Spreadsheet'))?.limit).toBe(`${MAX_IMPORT_BYTES / MB} MB`)
    expect(FILE_LIMITS.find((r) => r.what.startsWith('Files in one'))?.limit).toContain(`${EXPORT_FILE_BYTES / MB} MB`)
    expect(FILE_LIMITS.find((r) => r.what.startsWith('Company'))?.limit).toBe(`${LOGO_MAX_BYTES / MB} MB`)
    expect(BIOMETRIC_PUNCH_ROWS).toBe(MAX_PUNCH_ROWS)
    expect(IMPORT_LIMITS_COPY).toMatch(/employees 500, attendance 5,000/)
  })
})
