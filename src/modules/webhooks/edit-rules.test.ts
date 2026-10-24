import { describe, expect, it } from 'vitest'
import { webhookChanges, webhookChangeSummary, webhookHost } from './edit-rules'

const base = { url: 'https://hooks.zapier.com/a', description: 'Zap', events: ['task.created', 'deal.won'], active: true }

describe('editing a webhook', () => {
  it('finds nothing when only the order of events differs', () => {
    expect(webhookChanges(base, { ...base, events: ['deal.won', 'task.created'] })).toEqual([])
  })

  it('lists each changed field, so a new URL is checked again', () => {
    expect(webhookChanges(base, { ...base, url: 'https://hook.make.com/b', active: false })).toEqual(['url', 'active'])
    expect(webhookChanges(base, { ...base, events: ['task.created'] })).toEqual(['events'])
  })

  it('summarises the change for the audit log without the full URL path', () => {
    expect(webhookChangeSummary(base, { ...base, url: 'https://hook.make.com/secret-path', events: ['invoice.paid'], active: false })).toBe('URL to hook.make.com, events invoice.paid, paused')
    expect(webhookChangeSummary(base, { ...base, description: 'Sheets' })).toBe('name to "Sheets"')
  })
})

describe('webhookHost (R3 L-30b)', () => {
  it('keeps only the host, never the path or token', () => {
    expect(webhookHost('https://hooks.slack.com/services/T000/B000/secret-token')).toBe('hooks.slack.com')
    expect(webhookHost('https://hooks.zapier.com/hooks/catch/123/abc?key=s3cret')).toBe('hooks.zapier.com')
  })

  it('never echoes an unreadable URL', () => {
    expect(webhookHost('not a url with secret')).toBe('an unreadable URL')
  })
})
