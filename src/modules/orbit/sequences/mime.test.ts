import { describe, expect, it } from 'vitest'
import { buildMime } from './mime'

describe('buildMime', () => {
  const raw = buildMime({ to: 'asha@kiran.in', subject: 'Namaste — quick question', html: '<p>Hi</p>', text: 'Hi', headers: { 'List-Unsubscribe': '<https://app/u/t>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }, boundary: 'b1' })

  it('carries the unsubscribe headers and both parts', () => {
    expect(raw).toContain('List-Unsubscribe: <https://app/u/t>\r\n')
    expect(raw).toContain('List-Unsubscribe-Post: List-Unsubscribe=One-Click\r\n')
    expect(raw).toContain('Content-Type: multipart/alternative; boundary="b1"')
    expect(raw).toContain(Buffer.from('<p>Hi</p>').toString('base64'))
    expect(raw.trimEnd().endsWith('--b1--')).toBe(true)
  })

  it('encodes a non-ASCII subject and strips line breaks from headers', () => {
    expect(raw).toContain(`Subject: =?UTF-8?B?${Buffer.from('Namaste — quick question').toString('base64')}?=`)
    const evil = buildMime({ to: 'a@b.in\r\nBcc: x@y.in', subject: 's', html: 'h', text: 't', headers: {} })
    expect(evil).not.toMatch(/\r\nBcc:/)
  })
})
