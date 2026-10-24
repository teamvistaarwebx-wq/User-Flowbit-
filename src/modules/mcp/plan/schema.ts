import { z } from 'zod'
import type { Requirement } from '../rules'

/**
 * The change format of flowbit_plan_changes (docs/specs/mcp.md A4). Names are
 * free text ("Vikram", "Kalpa Studio", "ramesh@kalpa.in"), dates may be
 * Hinglish ("kal", "Friday"). Pure.
 */

export const MAX_CHANGES = 50

const text = (max: number) => z.string().trim().min(1).max(max)
const opt = (max: number) => z.string().trim().max(max).optional()

export const sourceSchema = z
  .object({
    kind: z.string().trim().min(1).max(30).describe('Where it came from: slack, email, meeting, whatsapp, notes…'),
    ref: z.string().trim().max(200).optional().describe('Channel, message id or meeting date, e.g. "#design 8 Oct" or "<message-id>"'),
    url: z.string().trim().url().max(500).optional(),
  })
  .describe('Where these changes come from. The same source + change is never applied twice.')

export type Source = z.output<typeof sourceSchema>

const itemSchema = z.object({ name: text(200), qty: z.number().positive().max(1_000_000).default(1), rate: z.number().min(0).max(100_000_000), gst: z.number().min(0).max(28).optional(), sac: opt(8) })

export const OP_SCHEMAS = {
  create_task: z.object({
    title: text(200),
    note: opt(5000),
    description: opt(5000),
    assignee: opt(120),
    project: opt(120),
    client: opt(120),
    due: opt(60),
    priority: opt(20),
    labels: z.array(z.string().trim().max(40)).max(10).optional(),
    subtasks: z.array(z.string().trim().min(1).max(200)).max(20).optional(),
    status: opt(20),
  }),
  update_task: z.object({
    match: text(200).describe('Task key (VW-42), id or title'),
    status: opt(20),
    blocked_reason: opt(1000),
    assignee: opt(120),
    due: opt(60),
    priority: opt(20),
    title: opt(200),
    note: opt(5000).describe('Added as a comment'),
  }),
  add_comment: z.object({ task: text(200), body: text(5000) }),
  upsert_lead: z.object({
    company: text(140),
    contact: opt(120),
    email: z.string().trim().email().max(200).optional(),
    phone: opt(30),
    notes: opt(2000),
    value: z.number().min(0).max(1_000_000_000).optional(),
    source: opt(40).describe('Lead source key, e.g. referral'),
  }),
  log_activity: z.object({ lead: text(200), type: z.enum(['call', 'email', 'meeting', 'whatsapp', 'note', 'dm']).default('note'), summary: text(4000) }),
  schedule_followup: z.object({ lead: text(200), on: text(60), title: opt(140), owner: opt(120), type: z.enum(['follow_up', 'call', 'email', 'dm', 'meeting']).default('follow_up') }),
  move_deal: z.object({ deal: text(200), stage: opt(40), status: z.enum(['open', 'won', 'lost']).optional(), reason: opt(300), value: z.number().min(0).max(1_000_000_000).optional() }),
  draft_invoice: z.object({ client: text(120), items: z.array(itemSchema).min(1).max(50), date: opt(60), note: opt(2000) }),
  draft_quote: z.object({ client: text(120), items: z.array(itemSchema).min(1).max(50), date: opt(60), valid_until: opt(60), note: opt(2000) }),
} as const

export type PlanOp = keyof typeof OP_SCHEMAS
export const PLAN_OPS = Object.keys(OP_SCHEMAS) as PlanOp[]
export const isPlanOp = (op: unknown): op is PlanOp => typeof op === 'string' && op in OP_SCHEMAS
export type OpInput<O extends PlanOp> = z.output<(typeof OP_SCHEMAS)[O]>

/** What each planned operation needs (scope ∩ role). */
export const OP_RULES: Readonly<Record<PlanOp, Requirement>> = {
  create_task: { scope: 'work.write', anyPerm: ['tasks.write'], write: true },
  update_task: { scope: 'work.write', anyPerm: ['tasks.write'], write: true },
  add_comment: { scope: 'work.write', anyPerm: ['tasks.write', 'tasks.read'], write: true },
  upsert_lead: { scope: 'orbit.write', anyPerm: ['leads.write'], write: true },
  log_activity: { scope: 'orbit.write', anyPerm: ['activities.write'], write: true },
  schedule_followup: { scope: 'orbit.write', anyPerm: ['activities.write'], write: true },
  move_deal: { scope: 'orbit.write', anyPerm: ['deals.write', 'orbit.close'], write: true },
  draft_invoice: { scope: 'folio.draft', anyPerm: ['invoices.write'], write: true },
  draft_quote: { scope: 'folio.draft', anyPerm: ['quotes.write'], write: true },
}

/** The tool input: a source and the list of changes (each an object with `op`). */
export const planInputShape = {
  source: sourceSchema.optional(),
  changes: z
    .array(z.looseObject({ op: z.string().trim().min(1).max(40), source: sourceSchema.optional() }))
    .min(1)
    .max(MAX_CHANGES)
    .describe(`Up to ${MAX_CHANGES} changes. ops: ${PLAN_OPS.join(', ')}`),
}

export const PLAN_TTL_MS = 30 * 60_000
