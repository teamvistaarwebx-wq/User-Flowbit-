import { describe, expect, it } from 'vitest'
import { meetingLink } from './link'

describe('meetingLink (R3 L-23b)', () => {
  it('accepts an https meeting link and an empty field', () => {
    expect(meetingLink.parse('https://meet.google.com/abc-defg-hij')).toBe('https://meet.google.com/abc-defg-hij')
    expect(meetingLink.parse('')).toBeUndefined()
    expect(meetingLink.parse(undefined)).toBeUndefined()
  })

  it.each(['javascript:alert(1)', 'data:text/html,<b>x</b>', 'http://meet.example.com/x', 'ftp://files.example.com'])('refuses %s', (value) => {
    // Arrange, Act
    const result = meetingLink.safeParse(value)

    // Assert
    expect(result.success).toBe(false)
  })
})
