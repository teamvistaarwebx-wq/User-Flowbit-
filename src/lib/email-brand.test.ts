import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_THEME, WORKSPACE_THEME_FIELDS } from './brand-theme'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', () => ({ dbConnect: vi.fn(async () => undefined) }))
vi.mock('@/lib/env', () => ({ appUrl: (path = '') => `https://app.test${path}` }))

const findById = vi.fn()
vi.mock('@/models/Org', () => ({ Org: { findById: (...args: unknown[]) => ({ lean: async () => findById(...args) }), updateOne: vi.fn() } }))

const { brandLogoUrl, emailBrandFor } = await import('./email-brand')

const OCEAN = { primary: '#3ba7e0', secondary: '#1e3a8a', accent: '#a5e4ff' }
const ORG_ID = 'a'.repeat(24)
const LOGO_ID = 'f'.repeat(24)
const KEY = 'k'.repeat(24)

describe('emailBrandFor (R2 19.1)', () => {
  beforeEach(() => findById.mockReset())

  it('uses the brand colour while the plan allows brand colours', async () => {
    // Arrange
    findById.mockResolvedValue({ _id: ORG_ID, name: 'Vistaar', theme: OCEAN, subscription: { status: 'active', plan: 'suite' } })

    // Act
    const brand = await emailBrandFor(ORG_ID)

    // Assert
    expect(brand?.color).toBe(OCEAN.primary)
  })

  it("falls back to Flowbit's colour once the trial has ended, like the shell and PDFs", async () => {
    // Arrange
    findById.mockResolvedValue({ _id: ORG_ID, name: 'Vistaar', theme: OCEAN, subscription: { status: 'trialing', plan: 'trial', trialEndsAt: new Date('2020-01-01') } })

    // Act
    const brand = await emailBrandFor(ORG_ID)

    // Assert
    expect(brand?.color).toBe(DEFAULT_THEME.primary)
  })

  it('loads the subscription fields the plan check needs', async () => {
    // Arrange
    findById.mockResolvedValue(null)

    // Act
    await emailBrandFor(ORG_ID)

    // Assert
    expect(findById.mock.calls[0]?.[1]).toMatchObject(WORKSPACE_THEME_FIELDS)
  })
})

describe('brandLogoUrl (R2 19.4)', () => {
  it('versions the logo URL with the logo file id so a replaced logo is fetched again', async () => {
    // Arrange
    findById.mockResolvedValue({ _id: ORG_ID, name: 'Vistaar', logoFileId: LOGO_ID, brandKey: KEY, subscription: { status: 'active', plan: 'suite' } })

    // Act
    const brand = await emailBrandFor(ORG_ID)

    // Assert
    expect(brand?.logoUrl).toBe(`https://app.test/api/public/brand/${KEY}/logo?v=${LOGO_ID}`)
    expect(brandLogoUrl(KEY)).toBe(`https://app.test/api/public/brand/${KEY}/logo`)
  })
})
