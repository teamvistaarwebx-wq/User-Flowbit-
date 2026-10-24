import { createHash } from 'node:crypto'
import { addDays, formatDate } from '@/lib/dates'
import { parseWhen } from '../dates'
import { describeMatch, resolve, type Candidate, type Match, type RecordKind } from '../find/match'
import { neverMessage, neverRuleFor } from '../never'
import { accessRefusal, type Access } from '../rules'
import { OP_RULES, OP_SCHEMAS, isPlanOp, type OpInput, type PlanOp, type Source } from './schema'

/**
 * flowbit_plan_changes without the database (pure, with injected lookups):
 * resolves every free-text name, reads the dates, checks scope ∩ role and
 * the never-allowed list, spots duplicates and repeats of the same source,
 * and sorts each change into ok / needs confirmation / refused. Saves nothing.
 */

export type ItemStatus = 'ok' | 'confirm' | 'refused'

export type PlanItem = Readonly<{
  index: number
  op: string
  status: ItemStatus
  summary: string
  notes: string[]
  /** What apply runs (ids already resolved). Null when refused. */
  payload: Record<string, unknown> | null
  idempotencyKey: string | null
  /** Already done from this source: apply skips it. */
  already: { label: string; link: string } | null
}>

export type DealConfig = Readonly<{ stages: { key: string; label: string }[]; lostReasons: { key: string; label: string }[]; wonReasons: { key: string; label: string }[] }>

export interface PlanLookups {
  find(kind: RecordKind, query: string): Promise<Match[]>
  byId(kind: RecordKind, id: string): Promise<Candidate | null>
  similarOpenTask(title: string): Promise<Match | null>
  leadByContact(email: string | undefined, phone: string | undefined): Promise<Candidate | null>
  openLeadByCompany(company: string): Promise<Candidate | null>
  idempotent(key: string): Promise<{ label: string; link: string } | null>
  dealConfig(): Promise<DealConfig>
  leadChoices(): Promise<{ sources: string[]; sectors: string[] }>
  onLeave(memberId: string, date: string): Promise<boolean>
  defaultGstRate(): Promise<number>
}

/** Records an earlier change of the same plan will create ("pending:<index>" until apply). */
export type Pending = Readonly<{ kind: RecordKind; index: number; names: readonly string[]; label: string }>

export type PlanEnv = Readonly<{ lookups: PlanLookups; access: Access; now: Date; today: string; memberId: string; pending?: readonly Pending[] }>

export const PENDING_PREFIX = 'pending:'

const STATUS_WORDS: Readonly<Record<string, string>> = {
  todo: 'todo', 'to do': 'todo', open: 'todo', pending: 'todo',
  in_progress: 'in_progress', 'in progress': 'in_progress', doing: 'in_progress', started: 'in_progress', wip: 'in_progress',
  in_review: 'in_review', review: 'in_review', 'in review': 'in_review',
  blocked: 'blocked', stuck: 'blocked', waiting: 'blocked',
  done: 'done', complete: 'done', completed: 'done', finished: 'done', closed: 'done', ho_gaya: 'done',
}
const PRIORITY_WORDS: Readonly<Record<string, string>> = { urgent: 'urgent', p1: 'urgent', critical: 'urgent', high: 'high', p2: 'high', medium: 'medium', normal: 'medium', p3: 'medium', low: 'low', p4: 'low' }

export const taskStatusOf = (raw: string | undefined) => (raw ? (STATUS_WORDS[raw.trim().toLowerCase().replace(/-/g, ' ')] ?? STATUS_WORDS[raw.trim().toLowerCase().replace(/[\s-]+/g, '_')] ?? null) : undefined)
export const priorityOf = (raw: string | undefined) => (raw ? (PRIORITY_WORDS[raw.trim().toLowerCase()] ?? null) : undefined)

const OBJECT_ID = /^[a-f0-9]{24}$/i
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

/** "source + kind": the same Slack message (or email) and the same change never apply twice. */
export function idempotencyKey(source: Source | undefined, op: string, subject: string): string | null {
  if (!source) return null
  const ref = source.ref || source.url
  if (!ref) return null
  return createHash('sha256').update([norm(source.kind), norm(ref), op, norm(subject)].join('|')).digest('hex').slice(0, 40)
}

export const sourceLabel = (source: Source | undefined): string | null => {
  if (!source) return null
  const kind = source.kind.trim()
  const name = kind.charAt(0).toUpperCase() + kind.slice(1)
  return source.ref ? `${name} ${source.ref}` : name
}

type Draft = { notes: string[]; confirm: boolean; refused: string | null }
const draft = (): Draft => ({ notes: [], confirm: false, refused: null })

type Ref = Readonly<{ id: string; name: string; link?: string }>

/** A free-text name (or a 24-hex id) to one record; notes say what was matched, and confirm/refuse when unsure. */
async function ref(env: PlanEnv, d: Draft, kind: RecordKind, query: string, opts: { missing?: string } = {}): Promise<Ref | null> {
  const q = query.trim().replace(/^id:/i, '')
  const earlier = (env.pending ?? []).find((p) => p.kind === kind && p.names.some((n) => norm(n) === norm(q)))
  if (earlier) {
    d.notes.push(`${q} → ${earlier.label} (added by change ${earlier.index + 1} of this plan)`)
    return { id: `${PENDING_PREFIX}${earlier.index}`, name: earlier.label }
  }
  if (OBJECT_ID.test(q)) {
    const found = await env.lookups.byId(kind, q)
    if (!found) d.refused = `No ${kind} with id ${q} in this workspace.`
    return found ? { id: found.id, name: found.name, link: found.link } : null
  }
  const r = resolve(await env.lookups.find(kind, q))
  if (r.status === 'none') {
    d.refused = opts.missing ?? `No ${kind} matches "${q}". Flowbit never invents records; check the name with flowbit_find.`
    return null
  }
  if (r.status === 'sure') d.notes.push(describeMatch(q, r.match))
  else if (r.status === 'ambiguous') {
    d.confirm = true
    d.notes.push(`"${q}" matches ${r.others.length + 1} ${kind}s: ${[r.match, ...r.others].map((m) => m.name).join(', ')}. Will use ${r.match.name} unless you re-plan with the exact name.`)
  } else {
    d.confirm = true
    d.notes.push(`Best guess: ${describeMatch(q, r.match)}, ${Math.round(r.match.confidence * 100)}% sure.`)
  }
  return { id: r.match.id, name: r.match.name, link: r.match.link }
}

function when(d: Draft, raw: string | undefined, env: PlanEnv, opts: { future?: boolean } = {}) {
  if (!raw) return null
  const w = parseWhen(raw, env.now)
  if (!w) {
    d.refused = `Could not read the date "${raw}". Use YYYY-MM-DD or words like kal, parso, Friday, next week.`
    return null
  }
  if (opts.future && w.date < env.today) {
    d.refused = `${formatDate(w.date)} is in the past. Pick today or a later date.`
    return null
  }
  if (w.date > addDays(env.today, 3 * 366)) {
    d.refused = `${formatDate(w.date)} is too far ahead.`
    return null
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) d.notes.push(`"${raw}" → ${w.label}${w.time ? ` ${w.time}` : ''} (IST)`)
  return w
}

type Planned = { summary: string; payload: Record<string, unknown>; subject: string }
type OpPlanner<O extends PlanOp> = (input: OpInput<O>, env: PlanEnv, d: Draft, source: Source | undefined) => Promise<Planned>

const planCreateTask: OpPlanner<'create_task'> = async (c, env, d, source) => {
  const assignee = c.assignee ? await ref(env, d, 'member', c.assignee) : null
  const project = c.project ? await ref(env, d, 'project', c.project) : null
  const client = c.client ? await ref(env, d, 'client', c.client, { missing: `No client matches "${c.client}". Flowbit never invents clients: add it in Flowbit first, or leave the client out.` }) : null
  const due = when(d, c.due, env)
  const priority = priorityOf(c.priority)
  if (priority === null) d.notes.push(`Unknown priority "${c.priority}"; using medium.`)
  const status = taskStatusOf(c.status)
  if (status === null) d.notes.push(`Unknown status "${c.status}"; using To do.`)
  if (status === 'blocked') d.refused = 'A new task cannot start blocked here. Create it, then update it with a blocked reason.'
  if (assignee && due && (await env.lookups.onLeave(assignee.id, due.date))) d.notes.push(`${assignee.name} is on leave on ${formatDate(due.date)}.`)
  const dupe = await env.lookups.similarOpenTask(c.title)
  if (dupe) {
    d.confirm = true
    d.notes.push(`Looks like a duplicate of ${dupe.name}${dupe.detail ? ` (${dupe.detail})` : ''}. Confirm to create it anyway.`)
  }
  const label = sourceLabel(source)
  return {
    subject: c.title,
    summary: `Create task "${c.title}"${assignee ? ` for ${assignee.name}` : ''}${due ? `, due ${due.label}` : ''}${client ? `, client ${client.name}` : ''}`,
    payload: {
      title: c.title,
      description: [c.description, c.note].filter(Boolean).join('\n\n') || undefined,
      assigneeIds: assignee ? [assignee.id] : [],
      projectId: project?.id,
      clientId: client?.id,
      dueDate: due?.date,
      dueTime: due?.time ?? undefined,
      priority: priority ?? 'medium',
      status: status ?? 'todo',
      tags: c.labels ?? [],
      subtasks: c.subtasks ?? [],
      origin: source ? { kind: source.kind, ref: source.ref ?? '', url: source.url ?? '', label: label ?? source.kind } : undefined,
    },
  }
}

const planUpdateTask: OpPlanner<'update_task'> = async (c, env, d) => {
  const task = await ref(env, d, 'task', c.match)
  const status = taskStatusOf(c.status)
  if (status === null) d.refused = `Unknown status "${c.status}". Use todo, in_progress, in_review, blocked or done.`
  if (status === 'blocked' && !c.blocked_reason) d.refused = 'Say why the task is blocked (blocked_reason).'
  const priority = priorityOf(c.priority)
  if (priority === null) d.refused = `Unknown priority "${c.priority}". Use urgent, high, medium or low.`
  const assignee = c.assignee ? await ref(env, d, 'member', c.assignee) : null
  const due = when(d, c.due, env)
  const patch = { status: status ?? undefined, blockedReason: c.blocked_reason, priority: priority ?? undefined, assigneeIds: assignee ? [assignee.id] : undefined, dueDate: due?.date, title: c.title }
  const changes = [status && `status → ${status}`, priority && `priority → ${priority}`, assignee && `assignee → ${assignee.name}`, due && `due → ${due.label}`, c.title && `title → "${c.title}"`, c.note && 'add a comment'].filter(Boolean)
  if (!changes.length) d.refused = 'Nothing to change on this task.'
  return { subject: `${c.match}|${changes.join(',')}`, summary: `Update ${task?.name ?? c.match}: ${changes.join(', ')}`, payload: { taskId: task?.id, taskName: task?.name, patch, comment: c.note } }
}

const planAddComment: OpPlanner<'add_comment'> = async (c, env, d) => {
  const task = await ref(env, d, 'task', c.task)
  return { subject: `${c.task}|${c.body.slice(0, 80)}`, summary: `Comment on ${task?.name ?? c.task}: "${c.body.slice(0, 80)}${c.body.length > 80 ? '…' : ''}"`, payload: { taskId: task?.id, taskName: task?.name, body: c.body } }
}

const planUpsertLead: OpPlanner<'upsert_lead'> = async (c, env, d) => {
  if (!c.email && !c.phone && !c.contact) d.notes.push('No email or phone: Flowbit can only match this lead on the company name later.')
  const existing = await env.lookups.leadByContact(c.email, c.phone)
  const { sources, sectors } = await env.lookups.leadChoices()
  const source = c.source && sources.includes(c.source) ? c.source : sources.includes('other') ? 'other' : sources[0]
  const sector = sectors.includes('other') ? 'other' : sectors[0]
  const fields = { companyName: c.company, contactName: c.contact, email: c.email, phone: c.phone, notes: c.notes, valuePaise: c.value != null ? Math.round(c.value * 100) : undefined, source, sector }
  if (existing) {
    d.notes.push(`Matched existing lead ${existing.name} on ${c.email ? 'email' : 'phone'}: it is updated, not duplicated.`)
    return { subject: `${c.email ?? c.phone ?? c.company}`, summary: `Update lead ${existing.name}`, payload: { leadId: existing.id, ...fields } }
  }
  const sameName = await env.lookups.openLeadByCompany(c.company)
  if (sameName) {
    d.confirm = true
    d.notes.push(`An open lead "${sameName.name}" already exists. Confirm to add another.`)
  }
  return { subject: `${c.email ?? c.phone ?? c.company}`, summary: `Add lead ${c.company}${c.contact ? ` (${c.contact})` : ''}`, payload: fields }
}

const ACTIVITY_TYPE: Readonly<Record<string, string>> = { call: 'call', email: 'email', meeting: 'meeting', whatsapp: 'dm', dm: 'dm', note: 'note' }

const planLogActivity: OpPlanner<'log_activity'> = async (c, env, d) => {
  const lead = await ref(env, d, 'lead', c.lead, { missing: `No lead matches "${c.lead}". Add it with upsert_lead first (in the same plan, before this change).` })
  return { subject: `${c.lead}|${c.type}|${c.summary.slice(0, 120)}`, summary: `Log ${c.type} on ${lead?.name ?? c.lead}: "${c.summary.slice(0, 80)}"`, payload: { leadId: lead?.id, leadName: lead?.name, type: ACTIVITY_TYPE[c.type] ?? 'note', notes: c.type === 'whatsapp' ? `WhatsApp: ${c.summary}` : c.summary } }
}

const planFollowup: OpPlanner<'schedule_followup'> = async (c, env, d) => {
  const lead = await ref(env, d, 'lead', c.lead, { missing: `No lead matches "${c.lead}". Add it with upsert_lead first.` })
  const on = when(d, c.on, env, { future: true })
  const owner = c.owner ? await ref(env, d, 'member', c.owner) : null
  return { subject: `${c.lead}|${on?.date ?? c.on}`, summary: `Follow up with ${lead?.name ?? c.lead} on ${on?.label ?? c.on}${owner ? ` (${owner.name})` : ''}`, payload: { leadId: lead?.id, leadName: lead?.name, dueDate: on?.date, dueTime: on?.time ?? null, title: c.title ?? 'Follow up', type: c.type, ownerId: owner?.id } }
}

const pick = (list: readonly { key: string; label: string }[], raw: string | undefined) => {
  if (!raw) return undefined
  const q = norm(raw)
  return list.find((x) => x.key === q || norm(x.label) === q) ?? list.find((x) => norm(x.label).includes(q) || q.includes(norm(x.label)))
}

const planMoveDeal: OpPlanner<'move_deal'> = async (c, env, d) => {
  const deal = await ref(env, d, 'deal', c.deal)
  const cfg = await env.lookups.dealConfig()
  let to: string | undefined
  let reasonCode: string | undefined
  if (c.status === 'won' || c.status === 'lost') {
    to = c.status
    if (!env.access.can('orbit.close')) d.refused = 'Closing a deal as won or lost needs the reviewer permission (orbit.close).'
    if (c.status === 'lost') reasonCode = pick(cfg.lostReasons, c.reason)?.key ?? 'other'
    if (c.status === 'won') reasonCode = pick(cfg.wonReasons, c.reason)?.key
    if (c.status === 'won' && c.value == null) d.notes.push('No final value given: the deal keeps its current value.')
  } else {
    const stage = pick(cfg.stages, c.stage)
    if (!stage) d.refused = `Unknown stage "${c.stage ?? ''}". Stages: ${cfg.stages.map((s) => s.label).join(', ')}.`
    to = stage?.key
  }
  const words = to === 'won' ? 'won' : to === 'lost' ? 'lost' : cfg.stages.find((s) => s.key === to)?.label ?? to
  return { subject: `${c.deal}|${to}`, summary: `Move deal ${deal?.name ?? c.deal} to ${words}${c.reason ? ` (${c.reason})` : ''}`, payload: { dealId: deal?.id, dealName: deal?.name, to, reasonCode, reasonNote: c.reason, valuePaise: c.value != null ? Math.round(c.value * 100) : undefined } }
}

async function planDocument(kind: 'invoice' | 'quote', c: OpInput<'draft_invoice'> & { valid_until?: string }, env: PlanEnv, d: Draft): Promise<Planned> {
  const client = await ref(env, d, 'client', c.client, { missing: `No client matches "${c.client}". Flowbit never invents clients: add it in Flowbit first.` })
  const date = when(d, c.date, env)
  const validUntil = kind === 'quote' ? when(d, c.valid_until, env) : null
  const gst = await env.lookups.defaultGstRate()
  const lines = c.items.map((i) => ({ description: i.name, quantity: i.qty, rate: i.rate, gstRatePercent: i.gst ?? gst, hsnSac: i.sac }))
  const total = lines.reduce((s, l) => s + l.quantity * l.rate, 0)
  d.notes.push(`Draft only: GST is worked out by Flowbit; someone reviews and ${kind === 'invoice' ? 'issues' : 'sends'} it in the app.`)
  return {
    subject: `${c.client}|${lines.map((l) => `${l.description}:${l.quantity}:${l.rate}`).join(',')}`,
    summary: `Draft ${kind} for ${client?.name ?? c.client}: ${lines.length} ${lines.length === 1 ? 'line' : 'lines'}, ₹${total.toLocaleString('en-IN')} before GST`,
    payload: { clientId: client?.id, clientName: client?.name, lines, date: date?.date ?? env.today, validUntil: validUntil?.date, notes: c.note },
  }
}

const PLANNERS: { [O in PlanOp]: OpPlanner<O> } = {
  create_task: planCreateTask,
  update_task: planUpdateTask,
  add_comment: planAddComment,
  upsert_lead: planUpsertLead,
  log_activity: planLogActivity,
  schedule_followup: planFollowup,
  move_deal: planMoveDeal,
  draft_invoice: (c, env, d) => planDocument('invoice', c, env, d),
  draft_quote: (c, env, d) => planDocument('quote', c, env, d),
}

const refused = (index: number, op: string, summary: string, reason: string): PlanItem => ({ index, op, status: 'refused', summary, notes: [reason], payload: null, idempotencyKey: null, already: null })

/** One change → one preview row. */
export async function planOne(index: number, change: Record<string, unknown>, planSource: Source | undefined, env: PlanEnv): Promise<PlanItem> {
  const op = String(change.op ?? '').trim()
  if (!isPlanOp(op)) {
    const rule = neverRuleFor(op)
    return refused(index, op, `"${op}"`, rule ? neverMessage(rule) : `Unknown change "${op}". Allowed: ${Object.keys(OP_SCHEMAS).join(', ')}.`)
  }
  const denied = accessRefusal(env.access, OP_RULES[op])
  if (denied) return refused(index, op, op.replace(/_/g, ' '), denied)
  const parsed = OP_SCHEMAS[op].safeParse(change)
  if (!parsed.success) return refused(index, op, op.replace(/_/g, ' '), parsed.error.issues.map((i) => `${i.path.join('.') || op}: ${i.message}`).join('; '))
  const source = (change.source as Source | undefined) ?? planSource
  const d = draft()
  const planned = await (PLANNERS[op] as OpPlanner<PlanOp>)(parsed.data as OpInput<PlanOp>, env, d, source)
  if (d.refused) return { ...refused(index, op, planned.summary, d.refused), notes: [d.refused, ...d.notes] }
  const key = idempotencyKey(source, op, planned.subject)
  const already = key ? await env.lookups.idempotent(key) : null
  if (already) return { index, op, status: 'ok', summary: planned.summary, notes: [`Already done from this source: ${already.label}. Nothing will change.`, ...d.notes], payload: planned.payload, idempotencyKey: key, already }
  return { index, op, status: d.confirm ? 'confirm' : 'ok', summary: planned.summary, notes: d.notes, payload: planned.payload, idempotencyKey: key, already: null }
}

/** Every change in order (later changes may rely on earlier ones, e.g. a lead added before its activity). */
export async function planChanges(changes: readonly Record<string, unknown>[], source: Source | undefined, env: PlanEnv): Promise<PlanItem[]> {
  const items: PlanItem[] = []
  let pending: readonly Pending[] = env.pending ?? []
  for (const [i, change] of changes.entries()) {
    const item = await planOne(i, change, source, { ...env, pending })
    items.push(item)
    const p = item.payload
    if (item.op === 'upsert_lead' && item.status !== 'refused' && p && !p.leadId && !item.already) {
      const names = [p.companyName, p.email, p.phone, p.contactName].filter((n): n is string => typeof n === 'string' && n.length > 0)
      pending = [...pending, { kind: 'lead', index: i, names, label: String(p.companyName) }]
    }
  }
  return items
}

export type PlanPreview = Readonly<{ ok: PlanItem[]; needs_confirmation: PlanItem[]; refused: PlanItem[]; counts: { ok: number; needs_confirmation: number; refused: number } }>

export function previewOf(items: readonly PlanItem[]): PlanPreview {
  const ok = items.filter((i) => i.status === 'ok')
  const confirm = items.filter((i) => i.status === 'confirm')
  const no = items.filter((i) => i.status === 'refused')
  return { ok, needs_confirmation: confirm, refused: no, counts: { ok: ok.length, needs_confirmation: confirm.length, refused: no.length } }
}
