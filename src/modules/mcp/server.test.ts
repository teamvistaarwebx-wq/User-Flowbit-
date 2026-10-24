import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/env', async (orig) => ({ ...(await orig<typeof import('@/lib/env')>()), appUrl: (p = '') => `https://app.flowbit.test${p}` }))

const calls: string[] = []
const spy = (name: string, value: unknown) => vi.fn(async () => {
  calls.push(name)
  return value
})

vi.mock('./tools/reads', () => ({
  listTasks: spy('listTasks', { count: 1, tasks: [{ id: 't1', title: 'Banner', link: 'https://app.flowbit.test/app/work/tasks/t1' }] }),
  getTask: spy('getTask', { id: 't1' }),
  listProjects: spy('listProjects', { count: 0, projects: [] }),
  myDay: spy('myDay', { date: '2026-10-09', sections: [] }),
  listLeads: spy('listLeads', { count: 0, leads: [] }),
  getLead: spy('getLead', { id: 'l1' }),
  pipelineSummary: spy('pipelineSummary', { open_deals: 0 }),
  receivables: spy('receivables', { total_due: 0 }),
  getInvoice: spy('getInvoice', { id: 'i1' }),
  statementFor: spy('statementFor', { client: 'Acme' }),
  directory: spy('directory', { count: 1, people: [{ name: 'Vikram', pan: 'ABCDE1234F', bank: { account: '123' }, salary: 90000, title: 'Designer' }] }),
  whoIsOut: spy('whoIsOut', { out: [] }),
}))
vi.mock('./tools/context', () => ({
  whoami: (s: { personName: string; clientName: string; scopes: string[] }) => ({ user: { name: s.personName }, app: s.clientName, scopes: s.scopes }),
  find: spy('find', { candidates: [] }),
  workspaceContext: spy('workspaceContext', { workspace: 'Acme Agency' }),
}))
vi.mock('./tools/single', () => ({ singleChange: vi.fn(async (_s: unknown, _l: unknown, op: string) => {
  calls.push(`single:${op}`)
  return { status: 'done', op }
}) }))
vi.mock('./plan/run', () => ({
  planForSession: vi.fn(async () => {
    calls.push('plan')
    return { ok: [{ index: 0, op: 'create_task', summary: 'Create task "Banner"' }], needs_confirmation: [], refused: [], counts: { ok: 1, needs_confirmation: 0, refused: 0 }, plan_id: 'pln_test123', expires_at: '2026-10-09T05:00:00.000Z', next_step: 'Ask first' }
  }),
  applyPlan: vi.fn(async (_s: unknown, planId: string) => {
    calls.push(`apply:${planId}`)
    return { batch_id: '0123456789abcdef01234567', applied: 1, skipped: 0, failed: 0, lines: [{ index: 0, op: 'create_task', status: 'done', summary: 'Banner', link: 'https://app.flowbit.test/app/work/tasks/t9' }], undo: 'Undo within 7 days' }
  }),
  undoMcpBatch: vi.fn(async () => ({ label: 'x', removed: 1, restored: 0, kept: 0 })),
}))

import { MCP_SCOPES, type McpScope } from './scopes'

const ALL_PERMS = new Set(['tasks.read', 'tasks.write', 'projects.read', 'orbit.read', 'leads.write', 'activities.write', 'deals.write', 'folio.read', 'invoices.write', 'quotes.write', 'people.read'])

function session(scopes: readonly McpScope[] = MCP_SCOPES, perms: ReadonlySet<string> = ALL_PERMS, opts: { readOnly?: boolean } = {}) {
  return {
    ctx: {
      can: (p: string) => perms.has(p),
      has: () => true,
      entitlements: { readOnly: Boolean(opts.readOnly), readOnlyMessage: 'This workspace is read-only.' },
      user: { name: 'Sanskaar via Claude', email: 's@v.in' },
      userId: 'u1',
    },
    scopes,
    clientName: 'Claude',
    grantId: 'g1',
    personName: 'Sanskaar',
  }
}

async function connect(s = session()) {
  const { buildMcpServer } = await import('./server')
  const { memoryLimitStore } = await import('./limits')
  const server = buildMcpServer(s as never, { limits: memoryLimitStore() })
  const [a, b] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'smoke', version: '1.0.0' })
  await Promise.all([server.connect(a), client.connect(b)])
  return client
}

const TOOLS = [
  'flowbit_whoami', 'flowbit_find', 'flowbit_plan_changes', 'flowbit_apply_plan', 'flowbit_undo_batch',
  'work_list_tasks', 'work_get_task', 'work_create_task', 'work_update_task', 'work_add_comment', 'work_list_projects', 'work_my_day',
  'orbit_list_leads', 'orbit_get_lead', 'orbit_upsert_lead', 'orbit_log_activity', 'orbit_schedule_followup', 'orbit_move_deal', 'orbit_pipeline_summary',
  'folio_receivables', 'folio_get_invoice', 'folio_draft_invoice', 'folio_draft_quote', 'folio_client_statement',
  'people_directory', 'people_who_is_out',
]

/** Minimal valid arguments per tool, and the scope and role permission it needs. */
const CASES: Record<string, { args: Record<string, unknown>; scope: McpScope; perm: string; alsoRemove?: string[] }> = {
  work_list_tasks: { args: {}, scope: 'work.read', perm: 'tasks.read' },
  work_get_task: { args: { task_id: 'a'.repeat(24) }, scope: 'work.read', perm: 'tasks.read' },
  work_list_projects: { args: {}, scope: 'work.read', perm: 'projects.read' },
  work_my_day: { args: {}, scope: 'work.read', perm: 'tasks.read' },
  work_create_task: { args: { title: 'Banner' }, scope: 'work.write', perm: 'tasks.write' },
  work_update_task: { args: { task: 'VW-1', status: 'done' }, scope: 'work.write', perm: 'tasks.write' },
  orbit_list_leads: { args: {}, scope: 'orbit.read', perm: 'orbit.read' },
  orbit_get_lead: { args: { lead_id: 'a'.repeat(24) }, scope: 'orbit.read', perm: 'orbit.read' },
  orbit_pipeline_summary: { args: {}, scope: 'orbit.read', perm: 'orbit.read' },
  orbit_upsert_lead: { args: { company: 'Kalpa' }, scope: 'orbit.write', perm: 'leads.write' },
  orbit_log_activity: { args: { lead: 'Kalpa', summary: 'Call' }, scope: 'orbit.write', perm: 'activities.write' },
  orbit_schedule_followup: { args: { lead: 'Kalpa', on: 'kal' }, scope: 'orbit.write', perm: 'activities.write' },
  folio_receivables: { args: {}, scope: 'folio.read', perm: 'folio.read' },
  folio_get_invoice: { args: { invoice: 'INV/1' }, scope: 'folio.read', perm: 'folio.read' },
  folio_client_statement: { args: { client_id: 'a'.repeat(24) }, scope: 'folio.read', perm: 'folio.read' },
  folio_draft_invoice: { args: { client: 'Acme', items: [{ name: 'Design', rate: 1000 }] }, scope: 'folio.draft', perm: 'invoices.write' },
  folio_draft_quote: { args: { client: 'Acme', items: [{ name: 'Design', rate: 1000 }] }, scope: 'folio.draft', perm: 'quotes.write' },
  people_directory: { args: {}, scope: 'people.read', perm: 'people.read', alsoRemove: ['tasks.read', 'leave.read'] },
  people_who_is_out: { args: { days: 7 }, scope: 'people.read', perm: 'people.read', alsoRemove: ['tasks.read', 'leave.read'] },
  work_add_comment: { args: { task: 'VW-1', body: 'Done @Vikram' }, scope: 'work.write', perm: 'tasks.write', alsoRemove: ['tasks.read'] },
  orbit_move_deal: { args: { deal: 'Kalpa retainer', stage: 'proposal' }, scope: 'orbit.write', perm: 'deals.write', alsoRemove: ['orbit.close'] },
}

beforeEach(() => {
  calls.length = 0
})

describe('MCP protocol smoke test (SDK client in process)', () => {
  it('lists every tool from the spec with hints, and the resources and prompts', async () => {
    const client = await connect()
    const { tools } = await client.listTools()
    expect(tools.map((t) => t.name).sort()).toEqual([...TOOLS].sort())
    const byName = new Map(tools.map((t) => [t.name, t]))
    expect(byName.get('work_list_tasks')?.annotations?.readOnlyHint).toBe(true)
    expect(byName.get('work_update_task')?.annotations?.destructiveHint).toBe(true)
    expect(byName.get('work_create_task')?.annotations?.readOnlyHint).toBe(false)
    expect(byName.get('flowbit_plan_changes')?.inputSchema.properties).toHaveProperty('changes')
    const { resources } = await client.listResources()
    expect(resources.map((r) => r.uri).sort()).toEqual(['flowbit://guide/updating', 'flowbit://me/today', 'flowbit://workspace/context'])
    const guide = await client.readResource({ uri: 'flowbit://guide/updating' })
    expect(JSON.stringify(guide.contents)).toContain('Never possible through AI apps')
    const { prompts } = await client.listPrompts()
    expect(prompts.map((p) => p.name).sort()).toEqual(['client-update', 'collections-review', 'daily-standup', 'followups-today', 'update-from-notes'])
    const prompt = await client.getPrompt({ name: 'update-from-notes', arguments: { notes: 'Vikram: banner kal tak' } })
    expect(JSON.stringify(prompt.messages)).toContain('flowbit_plan_changes')
  })

  it('calls whoami, plans and applies', async () => {
    const client = await connect()
    const me = await client.callTool({ name: 'flowbit_whoami', arguments: {} })
    expect(me.structuredContent).toMatchObject({ user: { name: 'Sanskaar' }, app: 'Claude' })
    const plan = await client.callTool({ name: 'flowbit_plan_changes', arguments: { source: { kind: 'slack', ref: '#design' }, changes: [{ op: 'create_task', title: 'Banner', due: 'kal' }] } })
    expect(plan.isError).toBeFalsy()
    expect(plan.structuredContent).toMatchObject({ plan_id: 'pln_test123', counts: { ok: 1 } })
    const applied = await client.callTool({ name: 'flowbit_apply_plan', arguments: { plan_id: 'pln_test123' } })
    expect(applied.structuredContent).toMatchObject({ applied: 1, batch_id: '0123456789abcdef01234567' })
    expect(calls).toEqual(['plan', 'apply:pln_test123'])
  })

  it('refuses more than 50 changes in one plan at the schema', async () => {
    const client = await connect()
    const res = await client.callTool({ name: 'flowbit_plan_changes', arguments: { changes: Array.from({ length: 51 }, (_, i) => ({ op: 'create_task', title: `T${i}` })) } })
    expect(res.isError).toBe(true)
    expect(calls).toEqual([])
  })

  it('never returns salary, PAN or bank fields', async () => {
    const client = await connect()
    const res = await client.callTool({ name: 'people_directory', arguments: {} })
    const text = JSON.stringify(res)
    expect(text).toContain('Designer')
    expect(text).not.toContain('ABCDE1234F')
    expect(text).not.toContain('90000')
    expect(text).not.toMatch(/"bank"/)
  })
})

describe('scope ∩ role on every tool', () => {
  it('covers every scoped tool', () => {
    expect(Object.keys(CASES).sort()).toEqual(TOOLS.filter((t) => !t.startsWith('flowbit_')).sort())
  })

  for (const [name, c] of Object.entries(CASES)) {
    it(`${name}: needs scope ${c.scope} and permission ${c.perm}`, async () => {
      const ok = await connect()
      const allowed = await ok.callTool({ name, arguments: c.args })
      expect(allowed.isError, JSON.stringify(allowed.content)).toBeFalsy()

      calls.length = 0
      const noScope = await connect(session(MCP_SCOPES.filter((s) => s !== c.scope)))
      const refusedScope = await noScope.callTool({ name, arguments: c.args })
      expect(refusedScope.isError).toBe(true)
      expect(JSON.stringify(refusedScope.content)).toContain(c.scope)

      const removed = new Set([c.perm, ...(c.alsoRemove ?? [])])
      const perms = new Set([...ALL_PERMS].filter((p) => !removed.has(p)))
      const noRole = await connect(session(MCP_SCOPES, perms))
      const refusedRole = await noRole.callTool({ name, arguments: c.args })
      expect(refusedRole.isError).toBe(true)
      expect(JSON.stringify(refusedRole.content)).toMatch(/role/)
      expect(calls).toEqual([])
    })
  }

  it('refuses writes while the workspace is read-only but still reads', async () => {
    const client = await connect(session(MCP_SCOPES, ALL_PERMS, { readOnly: true }))
    const write = await client.callTool({ name: 'work_create_task', arguments: { title: 'X' } })
    expect(write.isError).toBe(true)
    expect(JSON.stringify(write.content)).toContain('read-only')
    const read = await client.callTool({ name: 'work_list_tasks', arguments: {} })
    expect(read.isError).toBeFalsy()
  })
})
