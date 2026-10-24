import { describe, expect, it } from 'vitest'
import { endpointSecretsRefusal, gspEndpointChanged } from './settings-rules'

const stored = { baseUrl: 'https://gsp.example.in', environment: 'sandbox', clientSecretSealed: 'x', passwordSealed: 'y' }

describe('GSP endpoint changes and stored secrets', () => {
  it('keeps stored secrets when the address and environment are unchanged', () => {
    expect(endpointSecretsRefusal(stored, { baseUrl: 'https://GSP.example.in/', environment: 'sandbox' })).toBeNull()
  })

  it('refuses a new address that would receive the stored secret and password', () => {
    expect(endpointSecretsRefusal(stored, { baseUrl: 'https://attacker.example', environment: 'sandbox' })).toMatch(/Enter the client secret and password again/)
  })

  it('refuses a new environment without the secrets entered again', () => {
    expect(endpointSecretsRefusal(stored, { baseUrl: 'https://gsp.example.in', environment: 'production', clientSecret: 'new' })).not.toBeNull()
  })

  it('accepts a new address when both secrets are entered again', () => {
    expect(endpointSecretsRefusal(stored, { baseUrl: 'https://other-gsp.example.in', environment: 'production', clientSecret: 'a', password: 'b' })).toBeNull()
  })

  it('has nothing to protect on a first save', () => {
    expect(gspEndpointChanged(null, { baseUrl: 'https://x.example', environment: 'sandbox' })).toBe(false)
    expect(endpointSecretsRefusal({ baseUrl: null, environment: 'sandbox' }, { baseUrl: 'https://x.example', environment: 'sandbox' })).toBeNull()
  })
})

describe('IRN cancel permission (L13)', () => {
  it('cancelling an IRN has its own permission, which finance has and sales does not', async () => {
    const { ALL_PERMISSIONS } = await import('@/lib/catalog')
    const { BUILTIN_ROLES } = await import('@/lib/permissions')
    expect(ALL_PERMISSIONS).toContain('einvoice.cancel')
    const roles = BUILTIN_ROLES as unknown as Record<string, { permissions: readonly string[] }>
    expect(roles.finance.permissions).toContain('einvoice.cancel')
    expect(roles.sales.permissions).not.toContain('einvoice.cancel')
    expect(roles.member.permissions).not.toContain('einvoice.cancel')
  })
})
