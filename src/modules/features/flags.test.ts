import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const state = vi.hoisted(() => ({ env: '', console: { whatsapp: true } as { whatsapp: boolean }, consoleFails: false, consoleReads: 0 }))

vi.mock('@/lib/env', () => ({ serverEnv: () => ({ FEATURE_WHATSAPP: state.env }) }))
vi.mock('@/modules/console/settings-query', () => ({
  consoleSettings: async () => {
    state.consoleReads += 1
    if (state.consoleFails) throw new Error('db down')
    return { features: state.console }
  },
}))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))

const { assertWhatsAppOn, requireWhatsAppPage, whatsAppEnabled } = await import('./flags')
const { UserError } = await import('@/lib/errors')
const { WHATSAPP_OFF_MESSAGE } = await import('@/lib/feature-flags')

beforeEach(() => {
  Object.assign(state, { env: '', console: { whatsapp: true }, consoleFails: false, consoleReads: 0 })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('whatsAppEnabled', () => {
  it('is off without FEATURE_WHATSAPP and never reads the Console settings', async () => {
    expect(await whatsAppEnabled()).toBe(false)
    expect(state.consoleReads).toBe(0)
  })

  it('is on with the env switch and the Console setting on', async () => {
    state.env = 'on'
    expect(await whatsAppEnabled()).toBe(true)
  })

  it('is off when the Console turns it off', async () => {
    Object.assign(state, { env: 'true', console: { whatsapp: false } })
    expect(await whatsAppEnabled()).toBe(false)
  })

  it('stays off when the Console settings cannot be read', async () => {
    Object.assign(state, { env: 'on', consoleFails: true })
    expect(await whatsAppEnabled()).toBe(false)
  })
})

describe('assertWhatsAppOn', () => {
  it('refuses with a user-facing message while off', async () => {
    await expect(assertWhatsAppOn()).rejects.toBeInstanceOf(UserError)
    await expect(assertWhatsAppOn()).rejects.toThrow(WHATSAPP_OFF_MESSAGE)
  })

  it('lets the action run while on', async () => {
    state.env = 'on'
    await expect(assertWhatsAppOn()).resolves.toBeUndefined()
  })
})

describe('requireWhatsAppPage', () => {
  it('is a 404 while off', async () => {
    await expect(requireWhatsAppPage()).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('renders while on', async () => {
    state.env = '1'
    await expect(requireWhatsAppPage()).resolves.toBeUndefined()
  })
})
