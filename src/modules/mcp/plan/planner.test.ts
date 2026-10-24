import { describe, expect, it } from 'vitest'
import { rankMatches, type Candidate, type RecordKind } from '../find/match'
import type { Access } from '../rules'
import { MCP_SCOPES } from '../scopes'
import { idempotencyKey, planChanges, previewOf, type PlanEnv, type PlanLookups } from './planner'

// Friday 9 Oct 2026, 10:00 IST.
const NOW = new Date('2026-10-09T04:30:00Z')
const TODAY = '2026-10-09'

const records: Record<RecordKind, Candidate[]> = {
  member: [{ kind: 'member', id: 'aaaaaaaaaaaaaaaaaaaaaaa1', name: 'Vikram Joshi', aliases: ['vikram@v.in'] }, { kind: 'member', id: 'aaaaaaaaaaaaaaaaaaaaaaa2', name: 'Priya Sharma' }],
  client: [{ kind: 'client', id: 'bbbbbbbbbbbbbbbbbbbbbbb1', name: 'Kalpa Studio' }, { kind: 'client', id: 'bbbbbbbbbbbbbbbbbbbbbbb2', name: 'Kalpa Foods' }, { kind: 'client', id: 'bbbbbbbbbbbbbbbbbbbbbbb3', name: 'Acme Corp' }],
  project: [],
  task: [{ kind: 'task', id: 'ccccccccccccccccccccccc1', name: 'Print vendor quotes', aliases: ['VW-7'] }],
  lead: [{ kind: 'lead', id: 'ddddddddddddddddddddddd1', name: 'Kalpa Studio', aliases: ['ramesh@kalpa.in'] }],
  deal: [{ kind: 'deal', id: 'eeeeeeeeeeeeeeeeeeeeeee1', name: 'Kalpa retainer' }],
}

function lookups(over: Partial<PlanLookups> = {}): PlanLookups {
  return {
    find: async (kind, q) => rankMatches(q, records[kind]),
    byId: async (kind, id) => records[kind].find((r) => r.id === id) ?? null,
    similarOpenTask: async (title) => (title.toLowerCase().includes('print vendor') ? { ...records.task[0], confidence: 0.95, why: 'same', detail: 'VW-7' } : null),
    leadByContact: async (email) => (email === 'ramesh@kalpa.in' ? records.lead[0] : null),
    openLeadByCompany: async () => null,
    idempotent: async () => null,
    dealConfig: async () => ({ stages: [{ key: 'discovery', label: 'Discovery' }, { key: 'proposal', label: 'Proposal sent' }], lostReasons: [{ key: 'no_budget', label: 'No budget' }, { key: 'other', label: 'Other' }], wonReasons: [] }),
    leadChoices: async () => ({ sources: ['referral', 'other'], sectors: ['d2c', 'other'] }),
    onLeave: async (id, date) => id === 'aaaaaaaaaaaaaaaaaaaaaaa1' && date === '2026-10-10',
    defaultGstRate: async () => 18,
    ...over,
  }
}

const FULL = new Set(['tasks.read', 'tasks.write', 'leads.write', 'activities.write', 'deals.write', 'invoices.write', 'quotes.write', 'orbit.read', 'folio.read'])
function access(over: Partial<Access> = {}): Access {
  return { scopes: [...MCP_SCOPES], can: (p) => FULL.has(p), has: () => true, writable: true, readOnlyMessage: 'Read only', ...over }
}
const env = (over: Partial<PlanEnv> = {}): PlanEnv => ({ lookups: lookups(), access: access(), now: NOW, today: TODAY, memberId: 'm', ...over })

describe('plan: ok, confirm and refused groups', () => {
  it('sorts the spec example into the three groups', async () => {
    const items = await planChanges(
      [
        { op: 'create_task', title: 'Homepage banner revisions', assignee: 'Vikram', client: 'Kalpa Studio', due: '2026-10-12', priority: 'high' },
        { op: 'update_task', match: 'Print vendor quotes', status: 'blocked', blocked_reason: 'Waiting for vendor rates' },
        { op: 'log_activity', lead: 'ramesh@kalpa.in', type: 'call', summary: 'Wants quote for 3 months retainer' },
        { op: 'schedule_followup', lead: 'ramesh@kalpa.in', on: 'parso' },
        { op: 'draft_quote', client: 'Kalpa', items: [{ name: 'Social retainer', qty: 3, rate: 45000 }] },
        { op: 'record_payment', amount: 5000 },
        { op: 'mark_attendance', who: 'Vikram' },
      ],
      { kind: 'slack', ref: '#design 8 Oct' },
      env(),
    )
    const preview = previewOf(items)
    expect(preview.ok.map((i) => i.op)).toEqual(['create_task', 'update_task', 'log_activity', 'schedule_followup'])
    expect(preview.needs_confirmation.map((i) => i.op)).toEqual(['draft_quote'])
    expect(preview.refused.map((i) => i.op)).toEqual(['record_payment', 'mark_attendance'])
    expect(items[0].notes).toContain('Vikram → Vikram Joshi (member)')
    expect(items[0].payload).toMatchObject({ assigneeIds: ['aaaaaaaaaaaaaaaaaaaaaaa1'], clientId: 'bbbbbbbbbbbbbbbbbbbbbbb1', dueDate: '2026-10-12', priority: 'high', origin: { label: 'Slack #design 8 Oct' } })
    expect(items[4].notes.join(' ')).toMatch(/matches 2 clients/)
    expect(items[5].notes[0]).toMatch(/Recording payments: never allowed/)
    expect(items[6].notes[0]).toMatch(/Attendance changes: never allowed/)
  })

  it('reads Hinglish and relative dates in IST', async () => {
    const [kal, friday, shaam] = await planChanges(
      [
        { op: 'create_task', title: 'Logo bhejo', due: 'kal' },
        { op: 'create_task', title: 'Invoice check', due: 'by Friday' },
        { op: 'create_task', title: 'Call back', due: 'parso shaam 6 baje' },
      ],
      undefined,
      env(),
    )
    expect(kal.payload).toMatchObject({ dueDate: '2026-10-10' })
    expect(friday.payload).toMatchObject({ dueDate: '2026-10-09' })
    expect(shaam.payload).toMatchObject({ dueDate: '2026-10-11', dueTime: '18:00' })
    expect(kal.notes.join(' ')).toMatch(/"kal" → Sat/)
    expect(kal.notes.join(' ')).not.toMatch(/on leave/)
  })

  it('refuses unreadable and past follow-up dates', async () => {
    const [bad, past] = await planChanges([{ op: 'create_task', title: 'X', due: 'someday soon' }, { op: 'schedule_followup', lead: 'ramesh@kalpa.in', on: '2026-10-01' }], undefined, env())
    expect(bad.status).toBe('refused')
    expect(past.status).toBe('refused')
    expect(past.notes[0]).toMatch(/past/)
  })

  it('asks to confirm likely duplicates and warns about leave', async () => {
    const [dupe, leave] = await planChanges([{ op: 'create_task', title: 'Print vendor quotes again' }, { op: 'create_task', title: 'Banner', assignee: 'Vikram', due: 'kal' }], undefined, env())
    expect(dupe.status).toBe('confirm')
    expect(dupe.notes.join(' ')).toMatch(/duplicate of Print vendor quotes/)
    expect(leave.notes.join(' ')).toMatch(/on leave/)
  })

  it('never invents clients', async () => {
    const [item] = await planChanges([{ op: 'draft_invoice', client: 'Zebra Holdings', items: [{ name: 'Design', qty: 1, rate: 1000 }] }], undefined, env())
    expect(item.status).toBe('refused')
    expect(item.notes[0]).toMatch(/never invents clients/)
  })

  it('upserts a lead on email instead of duplicating it', async () => {
    const [item] = await planChanges([{ op: 'upsert_lead', company: 'Kalpa Studio Pvt Ltd', email: 'ramesh@kalpa.in' }], undefined, env())
    expect(item.status).toBe('ok')
    expect(item.payload).toMatchObject({ leadId: 'ddddddddddddddddddddddd1' })
  })

  it('lets a later change use a lead added earlier in the same plan', async () => {
    const items = await planChanges([{ op: 'upsert_lead', company: 'Nimbus Labs', email: 'hi@nimbus.in' }, { op: 'log_activity', lead: 'hi@nimbus.in', summary: 'Intro call' }], undefined, env())
    expect(items.map((i) => i.status)).toEqual(['ok', 'ok'])
    expect(items[1].payload).toMatchObject({ leadId: 'pending:0' })
  })

  it('closing deals needs orbit.close; stages and reasons resolve from settings', async () => {
    const [won, moved] = await planChanges([{ op: 'move_deal', deal: 'Kalpa retainer', status: 'won' }, { op: 'move_deal', deal: 'Kalpa retainer', stage: 'proposal sent' }], undefined, env())
    expect(won.status).toBe('refused')
    expect(moved.payload).toMatchObject({ to: 'proposal' })
    const closer = env({ access: access({ can: (p) => FULL.has(p) || p === 'orbit.close' }) })
    const [lost] = await planChanges([{ op: 'move_deal', deal: 'Kalpa retainer', status: 'lost', reason: 'no budget' }], undefined, closer)
    expect(lost.payload).toMatchObject({ to: 'lost', reasonCode: 'no_budget' })
  })
})

describe('plan: scope ∩ role', () => {
  it('refuses when the token lacks the scope', async () => {
    const [item] = await planChanges([{ op: 'create_task', title: 'X' }], undefined, env({ access: access({ scopes: ['work.read'] }) }))
    expect(item.status).toBe('refused')
    expect(item.notes[0]).toMatch(/scope work.write/)
  })

  it('refuses when the role lacks the permission even with the scope', async () => {
    const [item] = await planChanges([{ op: 'draft_invoice', client: 'Acme', items: [{ name: 'A', qty: 1, rate: 1 }] }], undefined, env({ access: access({ can: (p) => p === 'tasks.write' }) }))
    expect(item.status).toBe('refused')
    expect(item.notes[0]).toMatch(/role/)
  })

  it('refuses writes on a read-only workspace', async () => {
    const [item] = await planChanges([{ op: 'create_task', title: 'X' }], undefined, env({ access: access({ writable: false }) }))
    expect(item.notes[0]).toBe('Read only')
  })
})

describe('plan: idempotency', () => {
  it('keys on source + change and marks repeats as already done', async () => {
    const source = { kind: 'slack', ref: '#design 1696' }
    expect(idempotencyKey(source, 'create_task', 'Banner')).toBe(idempotencyKey({ kind: 'Slack', ref: '#design  1696' }, 'create_task', 'banner'))
    expect(idempotencyKey(source, 'create_task', 'Banner')).not.toBe(idempotencyKey(source, 'create_task', 'Logo'))
    expect(idempotencyKey(undefined, 'create_task', 'Banner')).toBeNull()
    const [item] = await planChanges([{ op: 'create_task', title: 'Banner' }], source, env({ lookups: lookups({ idempotent: async () => ({ label: 'VW-9 Banner', link: '/app/work/tasks/x' }) }) }))
    expect(item.already).toMatchObject({ label: 'VW-9 Banner' })
    expect(item.notes[0]).toMatch(/Already done from this source/)
  })
})
