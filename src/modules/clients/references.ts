import 'server-only'
import type { Types } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { FolioBillingPlan } from '@/models/folio/BillingPlan'
import { FolioRetainer } from '@/models/folio/Retainer'
import { Activity } from '@/models/orbit/Activity'
import { Deal } from '@/models/orbit/Deal'
import { Lead } from '@/models/orbit/Lead'
import { Project } from '@/models/work/Project'
import { Task } from '@/models/work/Task'
import { folioCountForClient } from '@/modules/orbit/folio-links'

export type WorkModels = { Project: typeof Project; Task: typeof Task }

/**
 * Work's models for client roll-ups and the delete guard. Imported directly:
 * a failed lookup must surface as an error, never as "0 projects" that lets a
 * referenced client be deleted.
 */
export async function workModels(): Promise<WorkModels> {
  return { Project, Task }
}

export type ClientRefs = { leads: number; deals: number; projects: number; tasks: number; invoices: number; quotes: number; receipts: number; retainers: number; billingPlans: number; followUps: number }

/** Planned Orbit follow-ups logged on the client itself (not on one of its leads or deals). */
export const clientOnlyActivity = (clientId: Types.ObjectId) => ({ clientId, leadId: null, dealId: null })

/**
 * Everything across products that points at a client (delete guard). Retainers and billing plans count too:
 * an orphaned one keeps forecasting revenue and fails every recurring draft run.
 */
export async function clientReferences(ctx: Ctx, clientId: Types.ObjectId): Promise<ClientRefs> {
  const work = await workModels()
  const [leads, deals, projects, tasks, folio, retainers, billingPlans, followUps] = await Promise.all([
    ctx.db(Lead).countDocuments({ clientId }),
    ctx.db(Deal).countDocuments({ clientId }),
    work ? ctx.db(work.Project).countDocuments({ clientId }) : 0,
    work ? ctx.db(work.Task).countDocuments({ clientId }) : 0,
    folioCountForClient(ctx, clientId),
    ctx.db(FolioRetainer).countDocuments({ clientId }),
    ctx.db(FolioBillingPlan).countDocuments({ clientId }),
    ctx.db(Activity).countDocuments({ ...clientOnlyActivity(clientId), status: 'planned' }),
  ])
  return { leads, deals, projects, tasks, ...folio, retainers, billingPlans, followUps }
}

const NOUNS: [keyof ClientRefs, string][] = [
  ['invoices', 'invoice'], ['quotes', 'quote'], ['receipts', 'receipt'], ['retainers', 'retainer'], ['billingPlans', 'billing plan'],
  ['projects', 'project'], ['tasks', 'task'], ['deals', 'deal'], ['leads', 'lead'], ['followUps', 'open follow-up'],
]

/** "2 invoices and 1 project" or '' when nothing references it. */
export function describeRefs(refs: ClientRefs): string {
  const parts = NOUNS.filter(([k]) => refs[k] > 0).map(([k, noun]) => `${refs[k]} ${refs[k] === 1 ? noun : `${noun}s`}`)
  if (!parts.length) return ''
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}
