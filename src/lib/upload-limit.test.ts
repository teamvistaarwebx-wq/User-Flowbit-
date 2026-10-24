import { describe, expect, it } from 'vitest'
import { DEFAULT_MAX_UPLOAD_MB, fileTooLargeMessage, parseMaxUploadMb, VERCEL_MAX_UPLOAD_MB } from './upload-limit'

describe('upload cap', () => {
  it('reads MAX_UPLOAD_MB, falling back to 10 for blank or invalid values', () => {
    expect(parseMaxUploadMb('4', false)).toBe(4)
    expect(parseMaxUploadMb('2.5', false)).toBe(2.5)
    expect(parseMaxUploadMb(undefined, false)).toBe(DEFAULT_MAX_UPLOAD_MB)
    expect(parseMaxUploadMb('', false)).toBe(DEFAULT_MAX_UPLOAD_MB)
    expect(parseMaxUploadMb('-1', false)).toBe(DEFAULT_MAX_UPLOAD_MB)
    expect(parseMaxUploadMb('lots', false)).toBe(DEFAULT_MAX_UPLOAD_MB)
  })

  it('defaults to 4 on Vercel, which refuses bodies over about 4.5 MB', () => {
    expect(parseMaxUploadMb(undefined, true)).toBe(VERCEL_MAX_UPLOAD_MB)
    expect(parseMaxUploadMb('', true)).toBe(VERCEL_MAX_UPLOAD_MB)
    expect(parseMaxUploadMb('3', true)).toBe(3)
  })

  it('says which file is too large and the limit', () => {
    expect(fileTooLargeMessage('scan.pdf', 4)).toBe('"scan.pdf" is larger than 4 MB. Choose a smaller file.')
  })
})
