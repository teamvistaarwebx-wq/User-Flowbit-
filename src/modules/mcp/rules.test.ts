import { describe, expect, it } from 'vitest'
import { mcpRefusal, MCP_FREE_REFUSAL, MCP_OFF_REFUSAL, MCP_TWO_FACTOR_REFUSAL, viaName } from './access'
import { parseWhen } from './dates'
import { MCP_LIMITS, memoryLimitStore, requestRefusal, writeRefusal } from './limits'
import { isSensitiveKey, neverRuleFor, redact } from './never'
import { PLAN_OPS } from './plan/schema'
import { resourceSections, undoAccessRefusal } from './rules'
import { grantableScopes, parseScopes } from './scopes'

describe('never-allowed list', () => {
  it.each([
    ['mark_attendance', 'attendance'], ['update_attendance', 'attendance'], ['run_payroll', 'payroll'], ['update_salary', 'payroll'],
    ['issue_invoice', 'invoice_issue'], ['void_invoice', 'invoice_issue'], ['send_invoice', 'invoice_issue'], ['record_payment', 'payments'], ['add_receipt', 'payments'],
    ['delete_task', 'delete'], ['remove_lead', 'delete'], ['change_role', 'roles'], ['invite_member', 'roles'], ['update_settings', 'settings'], ['change_billing', 'billing'], ['upgrade_subscription', 'billing'],
  ])('refuses %s (%s)', (op, key) => {
    expect(neverRuleFor(op)?.key).toBe(key)
  })

  it('lets every allowed operation through', () => {
    for (const op of PLAN_OPS) expect(neverRuleFor(op), op).toBeNull()
  })
})

describe('sensitive fields', () => {
  it('drops salary, PAN, bank and secrets at any depth and keeps the rest', () => {
    const out = redact({ name: 'Vikram', company: 'Kalpa', pan: 'ABCDE1234F', bank: { ifsc: 'X' }, nested: [{ salaryPaise: 1, accountNumber: '9', title: 'Lead' }], tokenHash: 'h', expansion: 'ok' })
    expect(out).toEqual({ name: 'Vikram', company: 'Kalpa', nested: [{ title: 'Lead' }], expansion: 'ok' })
    expect(isSensitiveKey('companyName')).toBe(false)
    expect(isSensitiveKey('aadhaar')).toBe(true)
  })
})

describe('plans and switches', () => {
  const base = { accountType: 'paid' as const, access: 'full' as const }
  it('allows paid, trial and house accounts; refuses Free, switched off and blocked', () => {
    expect(mcpRefusal(base, true)).toBeNull()
    expect(mcpRefusal({ ...base, accountType: 'trial' }, true)).toBeNull()
    expect(mcpRefusal({ ...base, accountType: 'internal' }, true)).toBeNull()
    expect(mcpRefusal({ ...base, accountType: 'free' }, true)).toBe(MCP_FREE_REFUSAL)
    expect(mcpRefusal(base, false)).toBe(MCP_OFF_REFUSAL)
    expect(mcpRefusal({ ...base, access: 'blocked' }, true)).toMatch(/paused/)
    expect(mcpRefusal({ ...base, access: 'read_only' as never }, true)).toBeNull()
    expect(viaName('Sanskaar', 'Claude')).toBe('Sanskaar via Claude')
    // An owner or admin who has not set up a required 2FA cannot connect or use AI apps.
    expect(mcpRefusal(base, true, true)).toBe(MCP_TWO_FACTOR_REFUSAL)
    expect(mcpRefusal(base, true, false)).toBeNull()
  })

  it('intersects requested scopes with the role', () => {
    const employee = { permissions: new Set(['tasks.read', 'tasks.write']), products: ['work', 'muster'] }
    expect(grantableScopes(parseScopes('work.read work.write folio.draft payroll.run'), employee)).toEqual(['work.read', 'work.write'])
    expect(grantableScopes([], employee)).toEqual(['work.read', 'work.write', 'people.read'])
    const noWork = { permissions: new Set(['tasks.read']), products: ['muster'] }
    expect(grantableScopes(['work.read'], noWork)).toEqual([])
  })
})

describe('limits', () => {
  it('rate limits each connection per minute', async () => {
    const store = memoryLimitStore()
    for (let i = 0; i < MCP_LIMITS.requestsPerMinute; i++) expect(await requestRefusal(store, 'g1')).toBeNull()
    expect(await requestRefusal(store, 'g1')).toMatchObject({ message: expect.stringMatching(/Too many/) })
    expect(await requestRefusal(store, 'g2')).toBeNull()
  })

  it('caps one apply at 50 changes and the workspace per day, all or nothing', async () => {
    const store = memoryLimitStore()
    expect(await writeRefusal(store, 'o1', 51)).toMatch(/At most 50/)
    const now = new Date('2026-10-09T06:00:00Z')
    for (let i = 0; i < MCP_LIMITS.dailyWritesPerWorkspace / 50; i++) expect(await writeRefusal(store, 'o1', 50, now)).toBeNull()
    expect(await writeRefusal(store, 'o1', 1, now)).toMatch(/today's limit/)
    expect(await writeRefusal(store, 'o1', 1, new Date('2026-10-10T06:00:00Z'))).toBeNull()
    expect(await writeRefusal(store, 'o2', 1, now)).toBeNull()
  })
})

describe('Hinglish dates via MCP (IST)', () => {
  // Friday 9 Oct 2026, 23:00 IST: still Friday in India although it is 17:30 UTC.
  const late = new Date('2026-10-09T17:30:00Z')
  it.each([
    ['aaj', '2026-10-09', null], ['kal', '2026-10-10', null], ['parso', '2026-10-11', null], ['kal shaam 6 baje', '2026-10-10', '18:00'],
    ['Monday', '2026-10-12', null], ['agle hafte', '2026-10-12', null], ['15 Oct', '2026-10-15', null], ['by friday', '2026-10-09', null],
    ['2026-11-01', '2026-11-01', null], ['3 din baad', '2026-10-12', null],
  ])('%s → %s', (text, date, time) => {
    expect(parseWhen(text, late)).toMatchObject({ date, time })
  })

  it('refuses words that are not dates', () => {
    expect(parseWhen('soon', late)).toBeNull()
    expect(parseWhen('2026-02-30', late)).toBeNull()
  })
})

describe('resources and undo need the scope as well as the role (night check)', () => {
  const access = (scopes: string[], opts: { writable?: boolean; perms?: string[] } = {}) => ({
    scopes: scopes as never,
    can: (p: string) => (opts.perms ?? ['tasks.read', 'tasks.write', 'orbit.read', 'leads.write', 'folio.read', 'invoices.write']).includes(p),
    has: () => true,
    writable: opts.writable ?? true,
    readOnlyMessage: 'read-only',
  })

  it('shows only the sections of products the connection has a scope for', () => {
    expect(resourceSections(access(['people.read']))).toEqual({ work: false, orbit: false, folio: false, myDay: false, followups: false })
    expect(resourceSections(access(['work.read']))).toMatchObject({ work: true, orbit: false, folio: false, myDay: true, followups: false })
    expect(resourceSections(access(['work.read', 'orbit.read', 'folio.draft']))).toMatchObject({ work: true, orbit: true, folio: true, followups: true })
  })

  it('lets only the applying connection undo, with the write scope for each record type', () => {
    const batch = { grantId: 'g1', models: ['Task', 'TaskComment'] }
    expect(undoAccessRefusal(access(['work.read', 'work.write']), batch, 'g1')).toBeNull()
    expect(undoAccessRefusal(access(['work.read', 'work.write']), batch, 'g2')).toMatch(/Only the app connection/)
    expect(undoAccessRefusal(access(['work.read']), batch, 'g1')).toMatch(/scope work.write/)
    expect(undoAccessRefusal(access(['people.read']), { grantId: 'g1', models: ['Lead'] }, 'g1')).toMatch(/orbit.write/)
    expect(undoAccessRefusal(access(['work.write'], { perms: ['tasks.read'] }), batch, 'g1')).toMatch(/role/)
    expect(undoAccessRefusal(access(['work.write'], { writable: false }), batch, 'g1')).toBe('read-only')
    expect(undoAccessRefusal(access(['work.write']), { grantId: 'g1', models: ['Payslip'] }, 'g1')).toMatch(/cannot be undone/)
  })
})
