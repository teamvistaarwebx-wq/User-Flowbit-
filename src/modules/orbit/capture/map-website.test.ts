import { describe, expect, test } from 'vitest'
import { draftFromFields } from './map'

const lead = (website: string) => draftFromFields({ name: 'Ravi', email: 'ravi@acme.in', website }, 'website_form')

describe('captured website (R3 L-23a)', () => {
  test('keeps a web address as an https link', () => {
    expect(lead('acme.in')?.website).toBe('https://acme.in')
    expect(lead('http://acme.in/about')?.website).toBe('http://acme.in/about')
  })

  test('drops a script or data link instead of storing it', () => {
    expect(lead('javascript:alert(1)')?.website).toBe('')
    expect(lead('data:text/html,hi')?.website).toBe('')
  })

  test('drops text that is not a web address', () => {
    expect(lead('not a site')?.website).toBe('')
  })
})
