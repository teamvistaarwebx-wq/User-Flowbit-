import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const { emailLayout } = await import('./mail')

describe('emailLayout escapes href attributes (R3 L-23c)', () => {
  it('escapes quotes and ampersands in every link it writes', () => {
    // Arrange
    const tricky = 'https://x.test/a?b=1&c="><script>'

    // Act
    const { html } = emailLayout({
      title: 'Hi',
      paragraphs: ['Body'],
      cta: { label: 'Open', href: tricky },
      buttons: [{ label: 'Approve', href: tricky }],
      settingsHref: tricky,
      unsubscribeUrl: tricky,
    })

    // Assert
    expect(html).not.toContain('"><script>')
    expect(html.match(/href="https:\/\/x\.test\/a\?b=1&amp;c=&quot;&gt;&lt;script&gt;"/g)).toHaveLength(4)
  })
})
