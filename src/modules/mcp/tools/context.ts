import 'server-only'
import { Types } from 'mongoose'
import { appUrl } from '@/lib/env'
import { PRODUCTS } from '@/lib/catalog'
import { FolioEntity } from '@/models/folio/Entity'
import { Project } from '@/models/work/Project'
import { Space } from '@/models/work/Space'
import { getFolioSettings, taxRatesOf } from '@/modules/folio/settings/queries'
import { getOrbitSettings } from '@/modules/orbit/settings'
import { projectAccessMatch } from '@/modules/work/projects/access'
import { PRIORITY_LABEL, STATUS_LABEL, TASK_PRIORITIES, TASK_STATUSES } from '@/modules/work/tasks/constants'
import { candidatesFor } from '../data/candidates'
import { rankMatches, RECORD_KINDS, resolve, type RecordKind } from '../find/match'
import { MCP_LIMITS } from '../limits'
import { NEVER_RULES } from '../never'
import { resourceSections } from '../rules'
import { SCOPE_DEFS } from '../scopes'
import { buildAccess } from './access'
import type { McpSession } from '../session'

/** whoami, flowbit_find and flowbit://workspace/context. */

export function whoami(session: McpSession) {
  const { ctx } = session
  return {
    user: { name: session.personName, email: ctx.user.email },
    workspace: { name: ctx.org.name, slug: ctx.org.slug ?? null, plan: ctx.entitlements.accountTypeLabel, read_only: ctx.entitlements.readOnly, products: ctx.entitlements.products.map((p) => PRODUCTS[p].name) },
    role: ctx.roleLabel,
    app: session.clientName,
    scopes: session.scopes.map((s) => ({ scope: s, allows: SCOPE_DEFS[s].label })),
    never_allowed: NEVER_RULES.map((r) => r.label),
    limits: MCP_LIMITS,
    flowbit_url: appUrl('/app'),
  }
}

/** Kinds each scope lets the AI search. Members are searchable with any scope (to assign and mention). */
const KIND_SCOPE: Readonly<Record<RecordKind, readonly string[]>> = {
  member: ['work.read', 'work.write', 'orbit.read', 'orbit.write', 'people.read', 'folio.read', 'folio.draft'],
  client: ['work.read', 'orbit.read', 'folio.read', 'folio.draft', 'work.write', 'orbit.write'],
  project: ['work.read', 'work.write'],
  task: ['work.read', 'work.write'],
  lead: ['orbit.read', 'orbit.write'],
  deal: ['orbit.read', 'orbit.write'],
}

export async function find(session: McpSession, query: string, kinds: readonly RecordKind[] | undefined, limit: number) {
  const allowed = (kinds?.length ? kinds : RECORD_KINDS).filter((k) => KIND_SCOPE[k].some((s) => session.scopes.includes(s as never)))
  const results = await Promise.all(allowed.map(async (kind) => rankMatches(query, await candidatesFor(session.ctx, kind, query), limit)))
  const matches = results.flat().sort((a, b) => b.confidence - a.confidence).slice(0, limit * 2)
  const verdict = resolve(matches)
  return {
    query,
    searched: allowed,
    best: verdict.status === 'none' ? null : { ...verdict.match, sure: verdict.status === 'sure' },
    ambiguous: verdict.status === 'ambiguous',
    candidates: matches.map((m) => ({ kind: m.kind, id: m.id, name: m.name, detail: m.detail ?? null, confidence: m.confidence, why: m.why, link: m.link ?? null })),
    note: verdict.status === 'none' ? 'No match. Do not invent this record; ask the person.' : verdict.status === 'sure' ? null : 'Not sure: ask the person which one they mean.',
  }
}

export async function workspaceContext(session: McpSession) {
  const { ctx } = session
  // Each section needs a scope of its product on this connection, as well as the role.
  const { work, orbit, folio } = resourceSections(buildAccess(session))
  const [projects, spaces, orbitCfg, entities, folioSettings] = await Promise.all([
    work && ctx.can('projects.read') ? ctx.db(Project).find({ $and: [projectAccessMatch(String(ctx.memberId), ctx.can('projects.write'), (x) => new Types.ObjectId(x)), { archivedAt: null, status: { $ne: 'completed' } }] }, { name: 1, code: 1 }).limit(100).lean() : [],
    work ? ctx.db(Space).find({ archivedAt: null }, { name: 1 }).limit(50).lean() : [],
    orbit ? getOrbitSettings(ctx) : null,
    folio ? ctx.db(FolioEntity).find({ isActive: true }, { code: 1, legalName: 1, tradeName: 1, kind: 1 }).lean() : [],
    folio ? getFolioSettings(ctx) : null,
  ])
  return {
    workspace: ctx.org.name,
    products_on: ctx.entitlements.products.map((p) => PRODUCTS[p].name),
    today_ist: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }),
    timezone: 'Asia/Kolkata (IST)',
    work: work ? { task_statuses: TASK_STATUSES.map((s) => ({ key: s, label: STATUS_LABEL[s] })), priorities: TASK_PRIORITIES.map((p) => ({ key: p, label: PRIORITY_LABEL[p] })), projects: projects.map((p) => ({ code: p.code, name: p.name })), spaces: spaces.map((s) => s.name) } : null,
    orbit: orbitCfg
      ? { lead_stages: ['new', 'contacted', 'engaged', 'meeting_booked', 'meeting_done', 'converted', 'lost', 'disqualified'], deal_stages: orbitCfg.dealStages.map((s) => ({ key: s.key, label: s.label, probability: s.probability })), lead_sources: orbitCfg.sources.filter((s) => s.active).map((s) => ({ key: s.key, label: s.label })), lost_reasons: orbitCfg.lostReasons.filter((r) => r.active).map((r) => r.label) }
      : null,
    folio: folioSettings ? { firms: entities.map((e) => ({ code: e.code, name: e.tradeName || e.legalName, gst: e.kind === 'gst' })), gst_rates: taxRatesOf(folioSettings), drafts_only: true } : null,
  }
}
