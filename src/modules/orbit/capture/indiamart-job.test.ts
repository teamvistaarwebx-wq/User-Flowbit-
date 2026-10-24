import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
const canWrite = vi.fn(() => false)
vi.mock('@/lib/entitlements', () => ({ canWrite: (...a: unknown[]) => canWrite(...(a as [])) }))
vi.mock('@/lib/env', () => ({ serverEnv: () => ({ INDIAMART_API_URL: '' }), encryptionKey: () => 'k' }))
vi.mock('@/lib/secret-box', () => ({ openSecret: vi.fn() }))
vi.mock('@/models/orbit/LeadCapture', () => ({ LeadCapture: { find: () => ({ lean: async () => [{ orgId: 'o1' }, { orgId: 'o2' }] }) } }))
vi.mock('@/models/Org', () => ({ Org: {} }))
vi.mock('@/modules/whatsapp/platform-sender', () => ({ liveFetch: vi.fn() }))
vi.mock('./create', () => ({ captureLead: vi.fn() }))

const { LEAD_SOURCES_TIME_BUDGET_MS, runLeadSourcesJob } = await import('./indiamart-job')

describe('lead sources job time budget (L-28c)', () => {
  it('starts no workspace once the budget is spent', async () => {
    // Arrange
    const db = { raw: () => ({ find: () => ({ lean: async () => [{ _id: 'o1' }, { _id: 'o2' }] }) }) }
    let calls = 0
    const clock = () => (calls++ === 0 ? 0 : LEAD_SOURCES_TIME_BUDGET_MS + 1)

    // Act
    await runLeadSourcesJob(db as never, new Date(), clock)

    // Assert
    expect(canWrite).not.toHaveBeenCalled()
  })

  it('visits every workspace within the budget', async () => {
    const db = { raw: () => ({ find: () => ({ lean: async () => [{ _id: 'o1' }, { _id: 'o2' }] }) }) }
    await runLeadSourcesJob(db as never, new Date(), () => 0)
    expect(canWrite).toHaveBeenCalledTimes(2)
  })
})
