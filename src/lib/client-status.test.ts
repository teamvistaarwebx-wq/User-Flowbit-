import { describe, expect, it } from 'vitest'
import { CLIENT_STATUS_PLURAL, clientStatusLabel } from './client-status'

describe('client status labels (audit A8)', () => {
  it('shows a stored lead status as Prospect, never Lead', () => {
    expect(clientStatusLabel('lead')).toBe('Prospect')
    expect(CLIENT_STATUS_PLURAL.lead).toBe('Prospects')
    expect(Object.values(CLIENT_STATUS_PLURAL)).not.toContain('Leads')
  })

  it('leaves unknown statuses to the shared label', () => {
    expect(clientStatusLabel('archived')).toBeUndefined()
    expect(clientStatusLabel(null)).toBeUndefined()
  })
})
