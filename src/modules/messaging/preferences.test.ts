import { describe, expect, it } from 'vitest'
import { EVENT_GROUPS, groupForEvent } from './events'
import { EMPTY_PERSONAL_PREFS, EMPTY_WORKSPACE_PREFS, effectiveQuietHours, isFixed, resolveChannels, setOverride, workspaceChannels, type PersonalPrefs, type WorkspacePrefs } from './preferences'

const workspace = (groups: WorkspacePrefs['groups'] = []): WorkspacePrefs => ({ ...EMPTY_WORKSPACE_PREFS, groups })
const personal = (patch: Partial<PersonalPrefs> = {}): PersonalPrefs => ({ ...EMPTY_PERSONAL_PREFS, ...patch })
const withWhatsApp = { inapp: true, email: true, whatsapp: true }

describe('groupForEvent', () => {
  it('maps exact events before area wildcards', () => {
    expect(groupForEvent('orbit.followup_due').key).toBe('followups')
    expect(groupForEvent('orbit.deal_won').key).toBe('sales')
    expect(groupForEvent('payroll.payslip_published').key).toBe('payslips')
    expect(groupForEvent('payroll.released').key).toBe('team')
  })

  it('falls back to the in-app-only group for unknown or missing events', () => {
    expect(groupForEvent('mystery.thing').key).toBe('other')
    expect(groupForEvent(undefined).key).toBe('other')
  })

  it('has unique group keys', () => {
    expect(new Set(EVENT_GROUPS.map((g) => g.key)).size).toBe(EVENT_GROUPS.length)
  })
})

describe('resolveChannels', () => {
  it('uses Flowbit defaults when nobody changed anything', () => {
    expect(resolveChannels('task_assigned', workspace(), personal())).toEqual({ inapp: true, email: true, whatsapp: false })
    expect(resolveChannels('task_updates', workspace(), personal())).toEqual({ inapp: true, email: false, whatsapp: false })
  })

  it('applies the workspace default over Flowbit default', () => {
    const ws = workspace([{ group: 'task_updates', email: true }])
    expect(resolveChannels('task_updates', ws, personal()).email).toBe(true)
  })

  it('lets a personal override win over the workspace default', () => {
    const ws = workspace([{ group: 'approvals', email: true }])
    const me = personal({ groups: [{ group: 'approvals', email: false }] })
    expect(resolveChannels('approvals', ws, me).email).toBe(false)
  })

  it('treats a null personal value as "follow the workspace"', () => {
    const ws = workspace([{ group: 'money', email: true }])
    const me = personal({ groups: [{ group: 'money', email: null }] })
    expect(resolveChannels('money', ws, me).email).toBe(true)
  })

  it('payslip alerts go by WhatsApp only when chosen (as a no-amount "ready" note); security and account notices never', () => {
    const ws = workspace([{ group: 'payslips', whatsapp: true }])
    const me = personal({ groups: [{ group: 'payslips', whatsapp: true }] })
    expect(resolveChannels('payslips', workspace(), personal(), withWhatsApp).whatsapp).toBe(false)
    expect(resolveChannels('payslips', ws, me, withWhatsApp).whatsapp).toBe(true)
    expect(isFixed('payslips', 'whatsapp')).toBe(false)
    const all = workspace([{ group: 'security', whatsapp: true }, { group: 'account', whatsapp: true }])
    expect(resolveChannels('security', all, personal(), withWhatsApp).whatsapp).toBe(false)
    expect(resolveChannels('account', all, personal(), withWhatsApp).whatsapp).toBe(false)
  })

  it('always emails security notices even when someone switched email off', () => {
    const ws = workspace([{ group: 'security', email: false }])
    const me = personal({ groups: [{ group: 'security', email: false }] })
    expect(resolveChannels('security', ws, me).email).toBe(true)
    expect(workspaceChannels(EVENT_GROUPS.find((g) => g.key === 'security')!, ws).email).toBe(true)
  })

  it('keeps WhatsApp off until the workspace can deliver it', () => {
    const me = personal({ groups: [{ group: 'approvals', whatsapp: true }] })
    expect(resolveChannels('approvals', workspace(), me).whatsapp).toBe(false)
    expect(resolveChannels('approvals', workspace(), me, withWhatsApp).whatsapp).toBe(true)
  })
})

describe('effectiveQuietHours', () => {
  it('follows the workspace by default, can be custom, and can be off', () => {
    const ws: WorkspacePrefs = { groups: [], quietHours: { enabled: true, start: '22:00', end: '07:00' } }
    expect(effectiveQuietHours(ws, personal())).toEqual(ws.quietHours)
    expect(effectiveQuietHours(ws, personal({ quietMode: 'custom', quietHours: { enabled: true, start: '20:00', end: '09:00' } }))?.start).toBe('20:00')
    expect(effectiveQuietHours(ws, personal({ quietMode: 'off' }))).toBeNull()
    expect(effectiveQuietHours({ ...ws, quietHours: { ...ws.quietHours, enabled: false } }, personal())).toBeNull()
  })
})

describe('setOverride', () => {
  it('returns a new list and leaves the input untouched', () => {
    const list = [{ group: 'money', email: true }]
    const next = setOverride(list, 'money', 'inapp', false)
    expect(next).toEqual([{ group: 'money', email: true, inapp: false }])
    expect(list).toEqual([{ group: 'money', email: true }])
  })

  it('drops the row once every channel follows the default again', () => {
    expect(setOverride([{ group: 'money', email: true }], 'money', 'email', null)).toEqual([])
  })
})

describe('notification grid rows', () => {
  it('locks the fixed cells and keeps WhatsApp off in the workspace grid until it is connected', async () => {
    const { workspaceGridRows, personalGridRows } = await import('./grid-rows')
    const rows = workspaceGridRows(workspace([{ group: 'money', email: true }, { group: 'approvals', whatsapp: true }]))
    expect(rows.find((r) => r.group === 'security')!.cells.whatsapp).toEqual({ on: false, fixed: true, overridden: false })
    expect(rows.find((r) => r.group === 'approvals')!.cells.whatsapp.on).toBe(false)
    const connected = workspaceGridRows(workspace([{ group: 'approvals', whatsapp: true }]), withWhatsApp)
    expect(connected.find((r) => r.group === 'approvals')!.cells.whatsapp).toEqual({ on: true, fixed: false, overridden: true })
    expect(rows.find((r) => r.group === 'security')!.cells.email).toMatchObject({ on: true, fixed: true })
    expect(rows.find((r) => r.group === 'money')!.cells.email).toEqual({ on: true, fixed: false, overridden: true })
    const mine = personalGridRows(workspace([{ group: 'money', email: true }]), personal({ groups: [{ group: 'money', email: false }] }))
    expect(mine.find((r) => r.group === 'money')!.cells.email).toEqual({ on: false, fixed: false, overridden: true })
  })
})
