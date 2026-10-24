import { describe, expect, it } from 'vitest'
import { slugDraft, slugify } from './utils'

describe('slugify', () => {
  it('turns a name into a lowercase hyphenated slug', () => {
    expect(slugify('Vistaar WebX')).toBe('vistaar-webx')
    expect(slugify('  Café -- Crème! ')).toBe('cafe-creme')
  })

  it('never ends in a hyphen, even when cut at the length limit', () => {
    const slug = slugify(`${'a'.repeat(47)} bcd`)
    expect(slug).toBe('a'.repeat(47))
  })
})

describe('slugDraft', () => {
  it('keeps one trailing hyphen while typing so a hyphenated URL can be typed key by key', () => {
    let value = ''
    for (const key of 'my-team') value = slugDraft(value + key)
    expect(value).toBe('my-team')
    expect(slugDraft('acme ')).toBe('acme-')
    expect(slugDraft('acme--')).toBe('acme-')
  })

  it('drops leading hyphens and other characters', () => {
    expect(slugDraft('-Acme_Labs')).toBe('acme-labs')
  })

  it('becomes a valid slug after slugify', () => {
    expect(slugify(slugDraft('qa-r1-'))).toBe('qa-r1')
  })
})
