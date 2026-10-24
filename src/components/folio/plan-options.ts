import 'server-only'
import type { Ctx } from '@/lib/ctx'
import { Project } from '@/models/work/Project'
import { builderOptions } from '@/modules/folio/invoices/builder-data'
import type { PlanValues } from './PlanForm'

/** Select options for the plan form, plus blank values. */
export async function planFormOptions(ctx: Ctx, includeClientId?: string) {
  const [options, projects] = await Promise.all([
    builderOptions(ctx, { includeClientId }),
    ctx.has('work') ? ctx.db(Project).find({ status: { $nin: ['completed', 'cancelled'] } }, { name: 1, code: 1 }).sort({ name: 1 }).lean() : [],
  ])
  return {
    ready: options.entities.length > 0,
    clients: options.clients.map((c) => ({ value: c.id, label: c.name })),
    entities: options.entities.map((e) => ({ value: e.id, label: `${e.code} · ${e.name}`, kind: e.kind })),
    projects: projects.map((p) => ({ value: String(p._id), label: p.code ? `${p.code} · ${p.name}` : p.name })),
    taxRates: options.taxRates,
    defaultEntityId: options.entities.find((e) => e.isDefault)?.id ?? options.entities[0]?.id ?? '',
  }
}

export const blankPlan = (entityId: string, clientId = ''): PlanValues => ({ clientId, entityId, workProjectId: '', name: '', description: '', hsnSac: '', totalValue: '', gstRatePercent: '18', startDate: '', targetEndDate: '', status: 'active', notes: '', milestones: [] })
