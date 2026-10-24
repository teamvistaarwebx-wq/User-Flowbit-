import { describe, expect, it } from 'vitest'
import { directUploadKeys, isStoredFileKeyFor, safeName, storedFileKey } from './keys'

const ORG_A = '64f000000000000000000001'
const ORG_B = '64f000000000000000000002'
const NEW_ID = '64f0000000000000000000aa'
const VICTIM_ID = '64f0000000000000000000bb'
/** The reviewer's traversal key (R3 H1): passes the old startsWith/includes checks, resolves into org B. */
const TRAVERSAL_KEY = `${ORG_A}/2026-10/${NEW_ID}-x/../../../${ORG_B}/2026-09/${VICTIM_ID}-payslip.pdf`

describe('storage keys', () => {
  it('builds <orgId>/<yyyy-mm>/<id>-<safeName>', () => {
    // Arrange
    const at = new Date('2026-10-11T00:00:00Z')

    // Act
    const key = storedFileKey(ORG_A, NEW_ID, 'My rec (final).mp3', at)

    // Assert
    expect(key).toBe(`${ORG_A}/2026-10/${NEW_ID}-My_rec_final_.mp3`)
  })

  it('strips path separators from names', () => {
    expect(safeName('../../etc/passwd')).toBe('.._.._etc_passwd')
    expect(safeName('a\\b')).toBe('a_b')
  })

  it('accepts an exact server-shaped key of the same org and file', () => {
    expect(isStoredFileKeyFor(ORG_A, NEW_ID, `${ORG_A}/2026-10/${NEW_ID}-rec.mp3`)).toBe(true)
  })

  it('refuses the traversal key from the report', () => {
    expect(isStoredFileKeyFor(ORG_A, NEW_ID, TRAVERSAL_KEY)).toBe(false)
  })

  it('refuses keys of another org, another file, backslashes and double slashes', () => {
    expect(isStoredFileKeyFor(ORG_A, NEW_ID, `${ORG_B}/2026-10/${NEW_ID}-rec.mp3`)).toBe(false)
    expect(isStoredFileKeyFor(ORG_A, NEW_ID, `${ORG_A}/2026-10/${VICTIM_ID}-rec.mp3`)).toBe(false)
    expect(isStoredFileKeyFor(ORG_A, NEW_ID, `${ORG_A}\\2026-10\\${NEW_ID}-rec.mp3`)).toBe(false)
    expect(isStoredFileKeyFor(ORG_A, NEW_ID, `${ORG_A}//2026-10/${NEW_ID}-rec.mp3`)).toBe(false)
    expect(isStoredFileKeyFor(ORG_A, NEW_ID, `${ORG_A}/2026-10/${NEW_ID}-a/b.mp3`)).toBe(false)
  })

  it('offers this month and last month for a direct upload, all valid for the file', () => {
    // Arrange
    const now = new Date('2026-11-01T00:05:00Z')

    // Act
    const keys = directUploadKeys(ORG_A, NEW_ID, 'rec.mp3', now)

    // Assert
    expect(keys).toEqual([`${ORG_A}/2026-11/${NEW_ID}-rec.mp3`, `${ORG_A}/2026-10/${NEW_ID}-rec.mp3`])
    expect(keys.every((key) => isStoredFileKeyFor(ORG_A, NEW_ID, key))).toBe(true)
  })

  it('never yields a traversal key, whatever name the browser sends', () => {
    const keys = directUploadKeys(ORG_A, NEW_ID, `x/../../../${ORG_B}/2026-09/${VICTIM_ID}-payslip.pdf`)
    expect(keys.every((key) => key.split('/').length === 3 && key.startsWith(`${ORG_A}/`))).toBe(true)
  })
})
