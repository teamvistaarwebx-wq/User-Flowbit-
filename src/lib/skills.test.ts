import { describe, expect, it } from 'vitest'
import { isTimeZone, knows, localTimeIn, parseSkills, skillSuggestions } from './skills'

describe('skills', () => {
  it('parses a typed list: trimmed, de-duplicated, capped', () => {
    expect(parseSkills('Figma, SEO,  figma , Hindi   copy,')).toEqual(['Figma', 'SEO', 'Hindi copy'])
    expect(parseSkills(Array.from({ length: 30 }, (_, i) => `s${i}`))).toHaveLength(20)
    expect(parseSkills(null)).toEqual([])
  })

  it('answers "who knows X" by substring, case-insensitively', () => {
    expect(knows(['Figma', 'Meta Ads'], 'ads')).toBe(true)
    expect(knows(['Figma'], 'seo')).toBe(false)
    expect(knows([], '')).toBe(true)
  })

  it('suggests the most common skills first', () => {
    expect(skillSuggestions([{ skills: ['SEO', 'Figma'] }, { skills: ['figma'] }, { skills: null }])).toEqual(['Figma', 'SEO'])
  })

  it('checks time zones and formats local time', () => {
    expect(isTimeZone('Asia/Kolkata')).toBe(true)
    expect(isTimeZone('Mars/Base')).toBe(false)
    expect(localTimeIn('Asia/Kolkata', new Date('2026-10-09T10:12:00Z'))).toBe('3:42 pm')
  })
})
