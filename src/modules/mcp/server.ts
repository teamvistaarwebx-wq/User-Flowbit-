import 'server-only'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { appUrl } from '@/lib/env'
import { APP_VERSION } from '@/lib/version'
import { RECORD_KINDS } from './find/match'
import { SERVER_INSTRUCTIONS } from './guide'
import type { LimitStore } from './limits'
import { applyPlan, planForSession, undoMcpBatch } from './plan/run'
import { planInputShape, sourceSchema, type Source } from './plan/schema'
import { registerPrompts } from './prompts'
import { registerResources } from './resources'
import { resourceSections } from './rules'
import type { McpSession } from './session'
import { find, whoami } from './tools/context'
import { buildAccess } from './tools/access'
import { defineTool } from './tools/define'
import * as reads from './tools/reads'
import { singleChange } from './tools/single'

/**
 * Flowbit's MCP server (docs/specs/mcp.md A3), built per request for one
 * verified session (stateless Streamable HTTP). Every tool checks the token
 * scope and the person's current role; writes go through the same module
 * functions as the app, with audit "<name> via <app>" and undo for 7 days.
 */

export type ServerDeps = Readonly<{ limits: LimitStore }>

const id = z.string().trim().min(1).max(200)
const date = z.string().trim().max(60)
const opt = (max: number) => z.string().trim().max(max).optional()
const confirm = z.boolean().optional().describe('Only after the person agreed to a needs_confirmation answer')
const source = sourceSchema.optional()

function commonTools(server: McpServer, s: McpSession, deps: ServerDeps) {
  defineTool(server, s, { name: 'flowbit_whoami', title: 'Who am I in Flowbit', description: 'The signed-in person, workspace, role, allowed scopes, limits and what is never allowed.', input: {}, req: null, kind: 'read' }, async () => whoami(s))
  defineTool(
    server,
    s,
    { name: 'flowbit_find', title: 'Find records', description: 'Fuzzy search across members, clients, projects, tasks, leads and deals by name, email, phone, task key or project code. Returns candidates with a confidence 0–1. Always find before you create.', input: { query: z.string().trim().min(1).max(200), kinds: z.array(z.enum(RECORD_KINDS)).max(6).optional(), limit: z.number().int().min(1).max(10).optional() }, req: null, kind: 'read' },
    async (a) => find(s, a.query, a.kinds, a.limit ?? 5),
  )
  defineTool(
    server,
    s,
    { name: 'flowbit_plan_changes', title: 'Plan changes (preview, saves nothing)', description: 'Send every change at once (from Slack, email or notes). Flowbit matches names, reads dates in IST (Hinglish too), checks permissions and duplicates, and returns a preview in three groups (ok, needs_confirmation, refused) with a plan_id valid for 30 minutes. Nothing is saved.', input: planInputShape, req: null, kind: 'read' },
    async (a) => planForSession(s, a.changes as Record<string, unknown>[], a.source as Source | undefined),
  )
  defineTool(
    server,
    s,
    { name: 'flowbit_apply_plan', title: 'Apply a confirmed plan', description: 'Only after the person said yes to the preview. Applies the plan as one batch (at most 50 changes) and returns links. Needs-confirmation items run only when their index is in confirm.', input: { plan_id: z.string().trim().min(8).max(60), confirm: z.array(z.number().int().min(0).max(49)).max(50).optional() }, req: null, kind: 'create' },
    async (a) => applyPlan(s, a.plan_id, a.confirm ?? [], deps.limits),
  )
  defineTool(
    server,
    s,
    { name: 'flowbit_undo_batch', title: 'Undo a batch', description: 'Undo a batch this connection applied (within 7 days): removes what it created (drafts only while still drafts) and puts back what it changed.', input: { batch_id: z.string().trim().length(24) }, req: null, kind: 'update' },
    async (a) => undoMcpBatch(s.ctx, a.batch_id, s.ctx.user.name, { onlyMemberUserId: s.ctx.userId, access: { check: buildAccess(s), grantId: s.grantId } }),
  )
}

function workTools(server: McpServer, s: McpSession, deps: ServerDeps) {
  const read = { scope: 'work.read', anyPerm: ['tasks.read'] } as const
  defineTool(
    server,
    s,
    { name: 'work_list_tasks', title: 'List tasks', description: 'Open tasks you can see, with filters. Status defaults to not done.', input: { assignee_id: opt(24), mine: z.boolean().optional(), project_id: opt(24), client_id: opt(24), status: z.enum(['todo', 'in_progress', 'in_review', 'blocked', 'done']).optional(), priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(), due_from: opt(10), due_to: opt(10), overdue: z.boolean().optional(), limit: z.number().int().min(1).max(100).optional() }, req: read, kind: 'read' },
    async (a) => reads.listTasks(s.ctx, { assignee: a.assignee_id, mine: a.mine, projectId: a.project_id, clientId: a.client_id, status: a.status, priority: a.priority, dueFrom: a.due_from, dueTo: a.due_to, overdue: a.overdue, limit: a.limit }),
  )
  defineTool(server, s, { name: 'work_get_task', title: 'Get a task', description: 'One task with subtasks, checklist, the last 20 comments, blocker and time logged.', input: { task_id: z.string().trim().length(24) }, req: read, kind: 'read' }, async (a) => reads.getTask(s.ctx, a.task_id))
  defineTool(server, s, { name: 'work_list_projects', title: 'List projects', description: 'Projects you can see with health, progress and lead.', input: { status: opt(20) }, req: { scope: 'work.read', anyPerm: ['projects.read'] }, kind: 'read' }, async (a) => reads.listProjects(s.ctx, a.status))
  defineTool(server, s, { name: 'work_my_day', title: 'My day', description: 'My tasks due today, overdue items, blocked work and today’s meetings: the same as the daily brief.', input: {}, req: read, kind: 'read' }, async () => reads.myDay(s.ctx, { followups: resourceSections(buildAccess(s)).followups }))
  const write = { scope: 'work.write', anyPerm: ['tasks.write'], write: true } as const
  defineTool(
    server,
    s,
    { name: 'work_create_task', title: 'Create one task', description: 'One task. Names are matched (assignee, project, client); due may be "kal", "Friday", "2026-10-12". For several tasks use flowbit_plan_changes.', input: { title: z.string().trim().min(1).max(200), description: opt(5000), assignee: opt(120), project: opt(120), client: opt(120), due: date.optional(), priority: opt(20), labels: z.array(z.string().max(40)).max(10).optional(), subtasks: z.array(z.string().min(1).max(200)).max(20).optional(), source, confirm }, req: write, kind: 'create' },
    async ({ confirm: ok, source: src, ...change }) => singleChange(s, deps.limits, 'create_task', change, { confirm: ok, source: src }),
  )
  defineTool(
    server,
    s,
    { name: 'work_update_task', title: 'Update a task', description: 'Change status, assignee, due date, priority or title; mark blocked with a reason. Never deletes.', input: { task: z.string().trim().min(1).max(200).describe('Task key (VW-42), id or title'), status: opt(20), blocked_reason: opt(1000), assignee: opt(120), due: date.optional(), priority: opt(20), title: opt(200), note: opt(5000), confirm }, req: write, kind: 'update' },
    async ({ confirm: ok, task, ...rest }) => singleChange(s, deps.limits, 'update_task', { match: task, ...rest }, { confirm: ok }),
  )
  defineTool(
    server,
    s,
    { name: 'work_add_comment', title: 'Comment on a task', description: 'Add a comment; @FirstName mentions notify that person.', input: { task: z.string().trim().min(1).max(200), body: z.string().trim().min(1).max(5000), confirm }, req: { scope: 'work.write', anyPerm: ['tasks.write', 'tasks.read'], write: true }, kind: 'create' },
    async (a) => singleChange(s, deps.limits, 'add_comment', { task: a.task, body: a.body }, { confirm: a.confirm }),
  )
}

function orbitTools(server: McpServer, s: McpSession, deps: ServerDeps) {
  const read = { scope: 'orbit.read', anyPerm: ['orbit.read'] } as const
  defineTool(
    server,
    s,
    { name: 'orbit_list_leads', title: 'List leads', description: 'Leads you can see. Filters: stage, owner, source, follow-up due, text.', input: { stage: opt(30), owner_id: opt(24), source: opt(40), followup_due: z.enum(['overdue', 'today', 'week']).optional(), query: opt(120), limit: z.number().int().min(1).max(100).optional() }, req: read, kind: 'read' },
    async (a) => reads.listLeads(s.ctx, { stage: a.stage, ownerId: a.owner_id, source: a.source, followupDue: a.followup_due, query: a.query, limit: a.limit }),
  )
  defineTool(server, s, { name: 'orbit_get_lead', title: 'Get a lead', description: 'A lead with its activity history.', input: { lead_id: z.string().trim().length(24) }, req: read, kind: 'read' }, async (a) => reads.getLead(s.ctx, a.lead_id))
  defineTool(server, s, { name: 'orbit_pipeline_summary', title: 'Pipeline summary', description: 'Open pipeline value by stage and deals closing this week.', input: {}, req: read, kind: 'read' }, async () => reads.pipelineSummary(s.ctx))
  defineTool(
    server,
    s,
    { name: 'orbit_upsert_lead', title: 'Create or update a lead', description: 'Matched on email or phone, so no duplicate is made.', input: { company: z.string().trim().min(1).max(140), contact: opt(120), email: z.string().trim().email().max(200).optional(), phone: opt(30), notes: opt(2000), value: z.number().min(0).max(1_000_000_000).optional(), source: opt(40), confirm }, req: { scope: 'orbit.write', anyPerm: ['leads.write'], write: true }, kind: 'create', idempotent: true },
    async ({ confirm: ok, ...change }) => singleChange(s, deps.limits, 'upsert_lead', change, { confirm: ok }),
  )
  defineTool(
    server,
    s,
    { name: 'orbit_log_activity', title: 'Log an activity', description: 'Log a call, email, meeting, WhatsApp or note on a lead: "Spoke with Ramesh, wants a quote".', input: { lead: z.string().trim().min(1).max(200), type: z.enum(['call', 'email', 'meeting', 'whatsapp', 'note', 'dm']).optional(), summary: z.string().trim().min(1).max(4000), confirm }, req: { scope: 'orbit.write', anyPerm: ['activities.write'], write: true }, kind: 'create' },
    async ({ confirm: ok, ...change }) => singleChange(s, deps.limits, 'log_activity', change, { confirm: ok }),
  )
  defineTool(
    server,
    s,
    { name: 'orbit_schedule_followup', title: 'Schedule a follow-up', description: 'Set a follow-up date (and owner) on a lead.', input: { lead: z.string().trim().min(1).max(200), on: z.string().trim().min(1).max(60), title: opt(140), owner: opt(120), type: z.enum(['follow_up', 'call', 'email', 'dm', 'meeting']).optional(), confirm }, req: { scope: 'orbit.write', anyPerm: ['activities.write'], write: true }, kind: 'create' },
    async ({ confirm: ok, ...change }) => singleChange(s, deps.limits, 'schedule_followup', change, { confirm: ok }),
  )
  defineTool(
    server,
    s,
    { name: 'orbit_move_deal', title: 'Move a deal', description: "Move a deal to another stage, or close it as won (with value) or lost (with reason). Closing needs the reviewer permission.", input: { deal: z.string().trim().min(1).max(200), stage: opt(40), status: z.enum(['open', 'won', 'lost']).optional(), reason: opt(300), value: z.number().min(0).max(1_000_000_000).optional(), confirm }, req: { scope: 'orbit.write', anyPerm: ['deals.write', 'orbit.close'], write: true }, kind: 'update' },
    async ({ confirm: ok, ...change }) => singleChange(s, deps.limits, 'move_deal', change, { confirm: ok }),
  )
}

const item = z.object({ name: z.string().trim().min(1).max(200), qty: z.number().positive().max(1_000_000).optional(), rate: z.number().min(0).max(100_000_000), gst: z.number().min(0).max(28).optional(), sac: opt(8) })

function folioTools(server: McpServer, s: McpSession, deps: ServerDeps) {
  const read = { scope: 'folio.read', anyPerm: ['folio.read'] } as const
  defineTool(server, s, { name: 'folio_receivables', title: 'Receivables', description: 'Who owes how much, aging buckets and the top overdue clients and invoices.', input: {}, req: read, kind: 'read' }, async () => reads.receivables(s.ctx))
  defineTool(server, s, { name: 'folio_get_invoice', title: 'Get an invoice', description: 'One invoice (by id or number) with its status and payments.', input: { invoice: id }, req: read, kind: 'read' }, async (a) => reads.getInvoice(s.ctx, a.invoice))
  defineTool(server, s, { name: 'folio_client_statement', title: 'Client statement', description: 'A client’s ledger summary (statement of account).', input: { client_id: z.string().trim().length(24), from: opt(10), to: opt(10) }, req: read, kind: 'read' }, async (a) => reads.statementFor(s.ctx, a.client_id, { from: a.from, to: a.to }))
  defineTool(
    server,
    s,
    { name: 'folio_draft_invoice', title: 'Draft an invoice', description: 'Creates a DRAFT invoice only (no number). GST is worked out by Flowbit; a person reviews and issues it in the app. Issuing, payments and voiding are never available here.', input: { client: z.string().trim().min(1).max(120), items: z.array(item).min(1).max(50), date: date.optional(), note: opt(2000), confirm }, req: { scope: 'folio.draft', anyPerm: ['invoices.write'], write: true }, kind: 'create' },
    async ({ confirm: ok, items, ...rest }) => singleChange(s, deps.limits, 'draft_invoice', { ...rest, items: items.map((i) => ({ ...i, qty: i.qty ?? 1 })) }, { confirm: ok }),
  )
  defineTool(
    server,
    s,
    { name: 'folio_draft_quote', title: 'Draft a quote', description: 'Creates a draft quote. A person sends it from Flowbit.', input: { client: z.string().trim().min(1).max(120), items: z.array(item).min(1).max(50), date: date.optional(), valid_until: date.optional(), note: opt(2000), confirm }, req: { scope: 'folio.draft', anyPerm: ['quotes.write'], write: true }, kind: 'create' },
    async ({ confirm: ok, items, ...rest }) => singleChange(s, deps.limits, 'draft_quote', { ...rest, items: items.map((i) => ({ ...i, qty: i.qty ?? 1 })) }, { confirm: ok }),
  )
}

function peopleTools(server: McpServer, s: McpSession) {
  defineTool(server, s, { name: 'people_directory', title: 'Team directory', description: 'Name, title, department, manager, teams and email. Never salary, PAN or bank details.', input: { query: opt(120) }, req: { scope: 'people.read' }, kind: 'read' }, async (a) => reads.directory(s.ctx, a.query))
  defineTool(server, s, { name: 'people_who_is_out', title: 'Who is out', description: 'Who is on approved leave today or in the next days, so you do not assign work to them.', input: { days: z.number().int().min(0).max(31).optional().describe('0 = today only; 7 = this week') }, req: { scope: 'people.read', product: null }, kind: 'read' }, async (a) => reads.whoIsOut(s.ctx, a.days ?? 0))
}

export function buildMcpServer(session: McpSession, deps: ServerDeps): McpServer {
  const server = new McpServer({ name: 'flowbit', title: 'Flowbit', version: APP_VERSION, websiteUrl: appUrl('') }, { instructions: SERVER_INSTRUCTIONS, capabilities: { tools: {}, resources: {}, prompts: {} } })
  commonTools(server, session, deps)
  workTools(server, session, deps)
  orbitTools(server, session, deps)
  folioTools(server, session, deps)
  peopleTools(server, session)
  registerResources(server, session)
  registerPrompts(server)
  return server
}
