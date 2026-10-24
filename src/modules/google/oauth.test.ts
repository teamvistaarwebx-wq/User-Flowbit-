import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/env', () => ({ appUrl: (p = '') => `https://app.test${p}`, serverEnv: () => ({ GOOGLE_CLIENT_ID: 'c' }) }))

describe('integrationReturnPath', () => {
  it('keeps an in-app path with its query', async () => {
    const { integrationReturnPath } = await import('./oauth')
    expect(integrationReturnPath('/app/work/meetings?schedule=1')).toBe('/app/work/meetings?schedule=1')
    expect(integrationReturnPath('/app/work/meetings/abc?edit=1')).toBe('/app/work/meetings/abc?edit=1')
  })

  it('refuses anything outside the app or off the site (no open redirect)', async () => {
    const { integrationReturnPath } = await import('./oauth')
    for (const next of [null, undefined, '', '/login', '/apple', 'https://evil.test/app/x', '//evil.test/app/x', '/\\evil.test/app/x', '/app/../login']) {
      expect(integrationReturnPath(next)).toBeUndefined()
    }
  })
})
