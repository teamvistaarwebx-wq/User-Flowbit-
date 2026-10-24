import { describe, expect, test } from 'vitest'
import { downloadErrorMessage, DOWNLOAD_FAILED, filenameFromDisposition } from './download'

describe('filenameFromDisposition', () => {
  test('prefers the UTF-8 name, then the quoted one, then the fallback', () => {
    expect(filenameFromDisposition(`attachment; filename="a_b.csv"; filename*=UTF-8''a%20b.csv`, 'x')).toBe('a b.csv')
    expect(filenameFromDisposition('attachment; filename="tally-VWX.xml"', 'x')).toBe('tally-VWX.xml')
    expect(filenameFromDisposition(null, 'export.csv')).toBe('export.csv')
  })
})

describe('downloadErrorMessage (R2 15.2)', () => {
  test("shows the route's own error from JSON", () => {
    expect(downloadErrorMessage('application/json', '{"error":"Too many documents for one file. Pick a shorter period."}')).toBe('Too many documents for one file. Pick a shorter period.')
  })

  test('shows a short plain-text reason, and words "Not allowed" for people', () => {
    expect(downloadErrorMessage('text/plain;charset=UTF-8', 'Use a real month as YYYY-MM, for example 2026-10.')).toMatch(/real month/)
    expect(downloadErrorMessage('text/plain', 'Not allowed')).toMatch(/permission/)
  })

  test('never shows HTML or broken JSON', () => {
    expect(downloadErrorMessage('text/html', '<html>502</html>')).toBe(DOWNLOAD_FAILED)
    expect(downloadErrorMessage('application/json', '{oops')).toBe(DOWNLOAD_FAILED)
  })
})
