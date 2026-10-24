import { describe, expect, it } from 'vitest'
import { checkDealTransition, type DealTransitionInput } from './dealStage'

const now = new Date('2026-10-01T06:00:00Z')
const stages = [
  { key: 'discovery', label: 'Discovery', probability: 20 },
  { key: 'proposal', label: 'Proposal sent', probability: 40 },
  { key: 'negotiation', label: 'Negotiation', probability: 70 },
]
const input = (over: Partial<DealTransitionInput> = {}): DealTransitionInput => ({
  deal: { stage: 'discovery', status: 'open' },
  to: 'negotiation',
  can: { write: true, close: false, isOwner: true },
  stages,
  activeLostReasons: ['price_too_high', 'other'],
  activeWonReasons: ['proof'],
  via: 'move',
  now,
  ...over,
})
const fail = (r: ReturnType<typeof checkDealTransition>) => (r.ok ? '' : r.error)

describe('checkDealTransition', () => {
  it('moves between open stages in any direction and sets the stage probability', () => {
    const fwd = checkDealTransition(input())
    expect(fwd.ok && fwd.patch.probability).toBe(70)
    const back = checkDealTransition(input({ deal: { stage: 'negotiation', status: 'open' }, to: 'discovery' }))
    expect(back.ok && back.patch.probability).toBe(20)
    expect(fail(checkDealTransition(input({ can: { write: true, close: false, isOwner: false } })))).toMatch(/owner or a reviewer/)
  })

  it('needs close to win or lose, and a reason to lose', () => {
    expect(fail(checkDealTransition(input({ to: 'won', via: 'win' })))).toMatch(/Only a reviewer/)
    const closer = { write: true, close: true, isOwner: false }
    const won = checkDealTransition(input({ to: 'won', via: 'win', can: closer, wonReason: 'proof' }))
    expect(won.ok && won.patch).toMatchObject({ status: 'won', probability: 100, closedAt: now, wonReason: 'proof' })
    expect(fail(checkDealTransition(input({ to: 'lost', via: 'lose', can: closer })))).toMatch(/Pick a reason/)
    expect(fail(checkDealTransition(input({ to: 'lost', via: 'lose', can: closer, reasonCode: 'other' })))).toMatch(/note/)
    const lost = checkDealTransition(input({ to: 'lost', via: 'lose', can: closer, reasonCode: 'price_too_high', reasonNote: 'Under 1L' }))
    expect(lost.ok && lost.patch).toMatchObject({ status: 'lost', probability: 0, lostReason: { code: 'price_too_high', note: 'Under 1L' } })
  })

  it('reopens to the last open stage and clears the reasons', () => {
    const closed = { stage: 'lost', status: 'lost' as const, closedAt: now }
    expect(fail(checkDealTransition(input({ deal: closed, via: 'reopen', to: '' })))).toMatch(/closed/)
    const r = checkDealTransition(input({ deal: closed, via: 'reopen', to: '', reopenTo: 'proposal', can: { write: true, close: true, isOwner: false } }))
    expect(r.ok && r.patch).toMatchObject({ stage: 'proposal', status: 'open', probability: 40, closedAt: null, lostReason: null, wonReason: null })
  })
})
