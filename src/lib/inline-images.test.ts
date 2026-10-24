import { describe, expect, it } from 'vitest'
import { inlineImageRefusal, MAX_INLINE_IMAGES } from './inline-images'

const MB = 1024 * 1024

describe('inlineImageRefusal', () => {
  it('takes JPEG, PNG, GIF and WebP within the size limit', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/gif', 'image/webp']) expect(inlineImageRefusal({ name: 'a', type, size: MB }, 0, 4 * MB)).toBeNull()
  })

  it('refuses SVG and other types', () => {
    expect(inlineImageRefusal({ name: 'logo.svg', type: 'image/svg+xml', size: 10 }, 0, 4 * MB)).toMatch(/not a JPEG, PNG, GIF or WebP/)
    expect(inlineImageRefusal({ name: 'a.pdf', type: 'application/pdf', size: 10 }, 0, 4 * MB)).toMatch(/not a JPEG/)
  })

  it('refuses files over the upload limit (4 MB on Vercel)', () => {
    expect(inlineImageRefusal({ name: 'big.gif', type: 'image/gif', size: 4 * MB + 1 }, 0, 4 * MB)).toMatch(/larger than 4 MB/)
  })

  it(`stops at ${MAX_INLINE_IMAGES} images`, () => {
    expect(inlineImageRefusal({ name: 'a', type: 'image/png', size: 1 }, MAX_INLINE_IMAGES, 4 * MB)).toMatch(/Up to 4 images/)
  })
})
