import { describe, expect, it } from 'vitest'
import { breachNoticeContent, parseWorkspaceList } from '@/modules/console/breach-notice'
import { newNumbers, numberConsentRow } from '@/modules/messaging/number-consent'
import { eraseSubject, exportSubject, identifiers, privacySteps, type EraseAction, type Match, type PrivacyCollection, type PrivacyStore, type Subject } from './core'
import { LOG_RETENTION_DAYS } from '@/lib/lifecycle'
import { RETENTION_DAYS, retentionCutoff, retentionEnabled, retentionSummary, runRetention, type RetentionStore } from './retention'

type Row = Record<string, unknown> & { orgId: string }

/**
 * Two workspaces with the same person (same email and phone) in each. The
 * store is scoped to one workspace like ctx.db: it only ever sees rows of
 * its own orgId, so erasing in A must leave B untouched.
 */
function world() {
  const rows: Record<PrivacyCollection, Row[]> = {
    Message: [
      { orgId: 'A', _id: 'm1', to: ['ravi@acme.in'], subject: 'Invoice', html: '<p>hi</p>', status: 'delivered' },
      { orgId: 'A', _id: 'm2', to: ['+919876543210'], subject: 'WhatsApp', status: 'read' },
      { orgId: 'A', _id: 'm3', to: ['other@x.in'], subject: 'Not them', status: 'sent' },
      { orgId: 'B', _id: 'm4', to: ['ravi@acme.in'], subject: 'B invoice', status: 'sent' },
    ],
    ConsentLog: [{ orgId: 'A', _id: 'c1', address: '+919876543210', action: 'opt_in' }, { orgId: 'B', _id: 'c2', address: '+919876543210', action: 'opt_in' }],
    Suppression: [{ orgId: 'A', _id: 's1', address: 'ravi@acme.in', scope: 'non_essential' }],
    WaThread: [{ orgId: 'A', _id: 't1', phone: '+919876543210' }, { orgId: 'B', _id: 't2', phone: '+919876543210' }],
    WaThreadMessage: [{ orgId: 'A', _id: 'tm1', threadId: 't1', text: 'hello' }, { orgId: 'B', _id: 'tm2', threadId: 't2', text: 'hello B' }],
    WaBotSession: [],
    Activity: [{ orgId: 'A', _id: 'a1', leadId: 'L1', note: 'called' }, { orgId: 'A', _id: 'a2', leadId: 'L2', note: 'someone else' }],
    StageEvent: [{ orgId: 'A', _id: 'e1', entityId: 'L1' }],
    Deal: [{ orgId: 'A', _id: 'd1', leadId: 'L1', title: 'Website' }],
    Notification: [],
    Brief: [],
    NotificationPrefs: [],
    PortalContact: [{ orgId: 'A', _id: 'p1', email: 'ravi@acme.in', clientId: 'C1', status: 'active' }, { orgId: 'B', _id: 'p2', email: 'ravi@acme.in', clientId: 'C9', status: 'active' }],
    PortalSession: [{ orgId: 'A', _id: 'ps1', contactId: 'p1' }, { orgId: 'B', _id: 'ps2', contactId: 'p2' }],
    PortalCode: [{ orgId: 'A', _id: 'pc1', contactId: 'p1' }],
    SequenceEnrollment: [{ orgId: 'A', _id: 'se1', leadId: 'L1', status: 'active' }, { orgId: 'A', _id: 'se2', leadId: 'L2', status: 'active' }],
  }
  const records: Row[] = [{ orgId: 'A', _id: 'L1', kind: 'lead' }, { orgId: 'B', _id: 'L1b', kind: 'lead' }]
  const matches = (row: Row, m: Match) => {
    const v = row[m.field]
    return Array.isArray(v) ? v.some((x) => m.anyOf.includes(String(x))) : m.anyOf.includes(String(v))
  }
  const storeFor = (orgId: string): PrivacyStore => ({
    find: async (c, m) => rows[c].filter((r) => r.orgId === orgId && matches(r, m)),
    apply: async (c: PrivacyCollection, m: Match, erase: Exclude<EraseAction, { kind: 'keep' }>) => {
      const hit = rows[c].filter((r) => r.orgId === orgId && matches(r, m))
      if (erase.kind === 'delete') rows[c] = rows[c].filter((r) => !hit.includes(r))
      else
        rows[c] = rows[c].map((r) => {
          if (!hit.includes(r)) return r
          const next: Row = { ...r, ...erase.set }
          for (const f of erase.unset) delete next[f]
          return next
        })
      return hit.length
    },
    eraseRecord: async (subject) => {
      const id = subject.ref.kind === 'lead' ? subject.ref.leadId : ''
      const i = records.findIndex((r) => r.orgId === orgId && r._id === id)
      if (i >= 0) records.splice(i, 1)
    },
  })
  return { rows, records, storeFor }
}

const lead: Subject = { ref: { kind: 'lead', leadId: 'L1' }, record: { companyName: 'Acme' }, ...identifiers({ emails: [' Ravi@Acme.in '], phones: ['98765 43210'] }) }

describe('per-person export and erasure (DPDP)', () => {
  it('normalises the identifiers it searches by', () => {
    expect(identifiers({ emails: [' Ravi@Acme.in ', null], phones: ['098765-43210', '+91 98765 43210', ''] })).toEqual({ emails: ['ravi@acme.in'], phones: ['+919876543210'] })
  })

  it('exports everything the workspace holds about the person, and nothing of another workspace', async () => {
    const w = world()
    const out = await exportSubject(w.storeFor('A'), lead, new Date('2026-10-08T06:00:00Z'))
    expect(out.subject).toBe('lead')
    expect(out.record).toEqual({ companyName: 'Acme' })
    expect((out.data.Message as Row[]).map((r) => r._id)).toEqual(['m1', 'm2'])
    expect((out.data.WaThreadMessage as Row[]).map((r) => r._id)).toEqual(['tm1'])
    expect((out.data.Activity as Row[]).map((r) => r._id)).toEqual(['a1'])
    expect(JSON.stringify(out)).not.toContain('B invoice')
    expect(JSON.stringify(out)).not.toContain('hello B')
    expect(out.kept.length).toBeGreaterThan(0)
  })

  it('erases in its own workspace only, keeps the opt-out and unlinks deals instead of deleting them', async () => {
    const w = world()
    const result = await eraseSubject(w.storeFor('A'), lead)
    expect(result.ok).toBe(true)
    const messages = w.rows.Message.filter((r) => r.orgId === 'A')
    expect(messages.find((r) => r._id === 'm1')).toMatchObject({ to: ['[removed]'], subject: '[removed]', status: 'delivered' })
    expect(messages.find((r) => r._id === 'm1')?.html).toBeUndefined()
    expect(messages.find((r) => r._id === 'm3')).toMatchObject({ to: ['other@x.in'] })
    expect(w.rows.WaThread.map((r) => r._id)).toEqual(['t2'])
    expect(w.rows.WaThreadMessage.map((r) => r._id)).toEqual(['tm2'])
    expect(w.rows.Activity.map((r) => r._id)).toEqual(['a2'])
    expect(w.rows.Deal[0]).toEqual({ orgId: 'A', _id: 'd1', title: 'Website' })
    expect(w.rows.Suppression).toHaveLength(1)
    expect(w.rows.ConsentLog.find((r) => r.orgId === 'A')).toMatchObject({ address: '[removed]' })
    // Workspace B: the same person, untouched.
    expect(w.rows.Message.find((r) => r._id === 'm4')).toMatchObject({ to: ['ravi@acme.in'], subject: 'B invoice' })
    expect(w.rows.ConsentLog.find((r) => r.orgId === 'B')).toMatchObject({ address: '+919876543210' })
    expect(w.records.map((r) => r._id)).toEqual(['L1b'])
  })

  it('refuses to erase an active member, and covers their own alerts and briefs', async () => {
    const member: Subject = { ref: { kind: 'member', memberId: 'M1' }, record: {}, emails: ['asha@acme.in'], phones: [], userId: 'U1', active: true }
    expect(await eraseSubject(world().storeFor('A'), member)).toEqual({ ok: false, error: expect.stringMatching(/Disable this member first/) })
    expect(privacySteps({ ...member, active: false }).map((s) => s.collection)).toEqual(expect.arrayContaining(['Notification', 'Brief', 'NotificationPrefs', 'Message']))
  })

  it("erases a client contact's portal access with its sessions and codes, in its own workspace only (R3 M9)", async () => {
    // Arrange
    const w = world()
    const contact: Subject = { ref: { kind: 'contact', clientId: 'C1', contactId: 'K1' }, record: {}, ...identifiers({ emails: ['Ravi@Acme.in'] }) }

    // Act
    const result = await eraseSubject(w.storeFor('A'), contact)

    // Assert
    expect(result).toMatchObject({ ok: true, counts: { PortalContact: 1, PortalSession: 1, PortalCode: 1 } })
    expect(w.rows.PortalContact.map((r) => r._id)).toEqual(['p2'])
    expect(w.rows.PortalSession.map((r) => r._id)).toEqual(['ps2'])
    expect(w.rows.PortalCode).toEqual([])
  })

  it("exports a client contact's portal account and a lead's sequence enrolments (R3 M9)", async () => {
    const w = world()
    const contact: Subject = { ref: { kind: 'contact', clientId: 'C1', contactId: 'K1' }, record: {}, emails: ['ravi@acme.in'], phones: [] }
    const contactOut = await exportSubject(w.storeFor('A'), contact, new Date('2026-10-08T06:00:00Z'))
    const leadOut = await exportSubject(w.storeFor('A'), lead, new Date('2026-10-08T06:00:00Z'))
    expect((contactOut.data.PortalContact as Row[]).map((r) => r._id)).toEqual(['p1'])
    expect((contactOut.data.PortalSession as Row[]).map((r) => r._id)).toEqual(['ps1'])
    expect((leadOut.data.SequenceEnrollment as Row[]).map((r) => r._id)).toEqual(['se1'])
  })

  it("deletes only the erased lead's sequence enrolments", async () => {
    const w = world()
    await eraseSubject(w.storeFor('A'), lead)
    expect(w.rows.SequenceEnrollment.map((r) => r._id)).toEqual(['se2'])
  })

  it('unlinks a client contact from activities and deals, never deleting them', () => {
    const steps = privacySteps({ ref: { kind: 'contact', clientId: 'C1', contactId: 'K1' }, record: {}, emails: [], phones: [] })
    expect(steps.filter((s) => s.collection === 'Activity' || s.collection === 'Deal').map((s) => s.erase.kind)).toEqual(['anonymise', 'anonymise'])
  })
})

describe('retention of message and processing logs', () => {
  const NOW = new Date('2027-12-01T00:00:00Z')
  const store = () => {
    const old: Record<string, number> = { Message: 4_500, AutomationRun: 10, WaChatMessage: 0 }
    const calls: string[] = []
    const s: RetentionStore = {
      count: async (t) => old[t] ?? 0,
      deleteBatch: async (t, _before, limit) => {
        const n = Math.min(limit, old[t] ?? 0)
        old[t] = (old[t] ?? 0) - n
        calls.push(`${t}:${n}`)
        return n
      },
    }
    return { s, old, calls }
  }

  it('keeps logs 13 months (at least a year), one constant with the purge', () => {
    expect(RETENTION_DAYS).toBe(395)
    expect(RETENTION_DAYS).toBe(LOG_RETENTION_DAYS)
    expect(retentionCutoff(NOW).toISOString()).toBe(new Date(NOW.getTime() - RETENTION_DAYS * 86_400_000).toISOString())
  })

  it('only counts in a dry run (the default locally and in dev)', async () => {
    const { s, calls, old } = store()
    expect(retentionEnabled({})).toBe(false)
    expect(retentionEnabled({ NODE_ENV: 'development', RETENTION_PRUNE_ENABLED: 'yes' })).toBe(false)
    const report = await runRetention(s, { apply: false, now: NOW })
    expect(calls).toEqual([])
    expect(old.Message).toBe(4_500)
    expect(report.lines.find((l) => l.target === 'Message')).toEqual({ target: 'Message', due: 4_500, deleted: 0 })
    expect(retentionSummary(report)).toMatch(/would delete .*Message 4500.*dry run/)
  })

  it('is on by default on a deployed production server, with a kill switch (D4)', () => {
    const prod = { NODE_ENV: 'production', VERCEL: '1', VERCEL_ENV: 'production' }
    expect(retentionEnabled(prod)).toBe(true)
    expect(retentionEnabled({ NODE_ENV: 'production', APP_URL: 'https://useflowbit.com' })).toBe(true)
    expect(retentionEnabled({ ...prod, RETENTION_PRUNE_ENABLED: 'false' })).toBe(false)
    expect(retentionEnabled({ ...prod, VERCEL_ENV: 'preview' })).toBe(false)
    expect(retentionEnabled({ NODE_ENV: 'production', APP_URL: 'http://localhost:3000' })).toBe(false)
  })

  it('deletes in batches when RETENTION_PRUNE_ENABLED=true, up to the per-run limit', async () => {
    const { s, calls, old } = store()
    expect(retentionEnabled({ RETENTION_PRUNE_ENABLED: 'true' })).toBe(true)
    const report = await runRetention(s, { apply: true, now: NOW, batch: 2_000, maxBatches: 2 })
    expect(calls.filter((c) => c.startsWith('Message'))).toEqual(['Message:2000', 'Message:2000'])
    expect(old.Message).toBe(500)
    expect(report.lines.find((l) => l.target === 'AutomationRun')).toEqual({ target: 'AutomationRun', due: 10, deleted: 10 })
    expect(retentionSummary(report)).toMatch(/^\[retention\] deleted/)
  })
})

describe('consent for numbers given to contacts', () => {
  it('logs a WhatsApp opt-in with source and notice version only for a new, usable number', () => {
    expect(numberConsentRow({ phone: '98765 43210', source: 'admin', where: 'client contact' })).toMatchObject({ channel: 'whatsapp', address: '+919876543210', action: 'opt_in', source: 'admin', noticeVersion: expect.any(String) })
    expect(numberConsentRow({ phone: '+91 98765 43210', previous: '9876543210', source: 'admin', where: 'client contact' })).toBeNull()
    expect(numberConsentRow({ phone: '12', source: 'admin', where: 'client contact' })).toBeNull()
    expect(newNumbers(['9876543210'], ['+919876543210', '9123456789', null])).toEqual(['+919123456789'])
  })
})

describe('breach notice to workspace owners', () => {
  it('reads workspace ids and slugs from a pasted list', () => {
    expect(parseWorkspaceList('64f1a2b3c4d5e6f708091a2b\nacme-co, vistaar\n\n<script>')).toEqual({ ids: ['64f1a2b3c4d5e6f708091a2b'], slugs: ['acme-co', 'vistaar'] })
  })

  it('states the facts in order and the 72-hour duty of the workspace', () => {
    const mail = breachNoticeContent({ reference: 'INC-2026-001', discoveredOn: '2026-10-08', whatHappened: 'A misconfigured export link.', dataAffected: 'Client names and emails.', whatWeDid: 'Revoked the link.', whatYouShouldDo: 'Tell affected clients.' }, 'Acme', 'support@useflowbit.com')
    expect(mail.subject).toBe('Security notice from Flowbit about Acme (INC-2026-001)')
    expect(mail.paragraphs[0]).toContain('8 October 2026')
    expect(mail.paragraphs.join(' ')).toContain('72 hours')
    expect(mail.paragraphs.at(-1)).toContain('support@useflowbit.com')
  })
})
