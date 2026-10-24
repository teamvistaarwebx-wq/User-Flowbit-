'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, fail, ok } from '@/lib/actions'
import type { Ctx } from '@/lib/ctx'
import { todayIST } from '@/lib/dates'
import { NotFoundError } from '@/lib/errors'
import { isoDate, objectId, optionalText, requiredText } from '@/lib/validation'
import { ArcRun } from '@/models/work/ArcRun'
import { Project } from '@/models/work/Project'
import { Task } from '@/models/work/Task'
import { Team } from '@/models/work/Team'
import { askClaude, askClaudeJson, type AiMiss } from './claude'
import { canAccessProject } from '../projects/access'
import { canModifyTask } from '../tasks/access'
import { getViewer } from '../tasks/viewer'
import { progressData } from './progress'
import { breakdownDraftSchema, outlineDraftSchema } from './schemas'
import { taskByKey, taskVisibility, workspaceSearch } from './search'
import { breakdownTemplate, outlineTemplate, progressText, taskShortcut } from './templates'

const W = { product: 'work', perm: 'arc.use' } as const
const TEMPLATE_NOTE = "Arc used a template because the AI service didn't respond."
const CAP_NOTE = 'This workspace has used its AI requests for this month, so Arc used a template. The count resets on the 1st.'
const PLAN_NOTE = 'AI drafting is on paid plans and trials, so Arc used a template.'
const refresh = () => revalidatePath('/app/arc')

async function record(ctx: Ctx, run: { kind: 'search' | 'outline' | 'breakdown' | 'progress'; prompt: string; input: unknown; output: unknown; source: 'ai' | 'template'; status: 'answered' | 'draft' }) {
  const doc = await ctx.db(ArcRun).create({ memberId: ctx.memberId, ...run, prompt: run.prompt.slice(0, 500) })
  return String(doc._id)
}

/** Why a template was used, when the person should know: the AI failed, or the monthly cap is reached. */
const MISS_NOTE: Partial<Record<AiMiss, string>> = { failed: TEMPLATE_NOTE, cap: CAP_NOTE, plan: PLAN_NOTE }
const sourceNote = (miss: AiMiss | null) => (miss ? MISS_NOTE[miss] : undefined)

export const arcSearch = action(
  z.object({ q: requiredText('Search', 120) }),
  async ({ q }, ctx) => {
    const taskId = await taskByKey(ctx, q)
    if (taskId) return ok(undefined, undefined, `/app/work/tasks/${taskId}`)
    const groups = await workspaceSearch(ctx, q)
    await record(ctx, { kind: 'search', prompt: q, input: { q }, output: { groups, shortcut: taskShortcut(q) }, source: 'template', status: 'answered' })
    refresh()
    return ok()
  },
  W,
)

export const draftOutline = action(
  z.object({ name: requiredText('Project name', 100), goal: requiredText('Goal', 300), startDate: isoDate.optional(), projectId: objectId.optional() }),
  async (input, ctx) => {
    const project = input.projectId ? await ctx.db(Project).findOne({ _id: input.projectId, archivedAt: null }, { name: 1, leadId: 1, memberIds: 1, createdById: 1 }).lean() : null
    // Only a project the person may open (no name leaks from a guessed id).
    if (input.projectId && (!project || !canAccessProject(String(ctx.memberId), ctx.can('projects.write'), project))) throw new NotFoundError('That project')
    const teams = await ctx.db(Team).find({}, { name: 1 }).limit(20).lean()
    const name = project?.name ?? input.name
    const ai = await askClaudeJson(ctx, outlineDraftSchema, {
      task: 'outline',
      tier: 'draft',
      system: 'You plan projects for a small Indian services company. Reply with a single JSON object and nothing else.',
      prompt: [
        `Project: ${name}`,
        `Goal: ${input.goal}`,
        teams.length ? `Teams in the workspace: ${teams.map((t) => t.name).join(', ')}` : '',
        'Return {"milestones":[{"title":string,"dueOffsetDays":number (days after the start date, increasing),"tasks":[{"title":string,"estimateMinutes":number,"priority":"low"|"medium"|"high"|"urgent"}]}]}.',
        'Use 3 to 6 milestones with 2 to 5 concrete tasks each. Keep titles short and actionable.',
      ].filter(Boolean).join('\n'),
    })
    const source = ai.ok ? 'ai' : 'template'
    const draft = ai.ok ? ai.value : outlineTemplate(name, input.goal)
    await record(ctx, { kind: 'outline', prompt: `Outline a project: ${name}`, input, output: { projectName: name, projectId: input.projectId, goal: input.goal, startDate: input.startDate ?? todayIST(), draft }, source, status: 'draft' })
    refresh()
    return ok(sourceNote(ai.ok ? null : ai.reason) ?? 'Draft ready. Review it, then Apply.')
  },
  W,
)

export const draftBreakdown = action(
  z.object({ taskId: objectId }),
  async ({ taskId }, ctx) => {
    const task = await ctx.db(Task).findOne({ _id: taskId, ...(await taskVisibility(ctx)) }, { title: 1, key: 1, description: 1, creatorId: 1, assigneeIds: 1, isPersonal: 1 }).lean()
    if (!task) throw new NotFoundError('That task')
    // Refuse before drafting, with the same rule Apply uses, so nobody reviews subtasks they cannot add.
    if (!canModifyTask(await getViewer(ctx), task)) return fail("You can't add subtasks to this task. Ask its creator or an assignee.")
    const ai = await askClaudeJson(ctx, breakdownDraftSchema, {
      task: 'breakdown',
      tier: 'draft',
      system: 'You break work into subtasks for a small team. Reply with a single JSON object and nothing else.',
      prompt: `Task: ${task.title}\nDescription: ${task.description ?? '(none)'}\nReturn {"subtasks":[{"title":string,"estimateMinutes":number}]} with 3 to 7 concrete subtasks in order.`,
    })
    const source = ai.ok ? 'ai' : 'template'
    await record(ctx, { kind: 'breakdown', prompt: `Break down ${task.key}: ${task.title}`, input: { taskId }, output: { taskId, taskKey: task.key, taskTitle: task.title, draft: ai.ok ? ai.value : breakdownTemplate(task.title, task.description) }, source, status: 'draft' })
    refresh()
    return ok(sourceNote(ai.ok ? null : ai.reason) ?? 'Suggested subtasks are ready. Review them, then Apply.')
  },
  W,
)

export const draftProgress = action(
  z.object({ period: z.enum(['this_week', 'last_week']).default('this_week'), scope: z.enum(['me', 'project', 'team']).default('me'), scopeId: objectId.optional(), note: optionalText(200) }),
  async (input, ctx) => {
    if (input.scope !== 'me' && !input.scopeId) return fail('Some fields need attention.', { scopeId: input.scope === 'project' ? 'Pick a project' : 'Pick a team' })
    const data = await progressData(ctx, input)
    const templateText = progressText(data)
    const ai = await askClaude(ctx, {
      task: 'progress',
      tier: 'cheap',
      system: 'You turn a factual work summary into a short, plain status update for an Indian team. Keep every number, name and title exactly as given. Do not add facts, guesses or praise. Use short paragraphs or bullets; no headings.',
      prompt: `Rewrite this update in under 180 words:\n\n${templateText}`,
      maxTokens: 1500,
    })
    const source = ai.ok ? 'ai' : 'template'
    await record(ctx, { kind: 'progress', prompt: `Progress update: ${data.periodLabel}, ${data.scopeLabel}`, input, output: { text: ai.ok ? ai.value : templateText, templateText, periodLabel: data.periodLabel, scopeLabel: data.scopeLabel }, source, status: 'answered' })
    refresh()
    return ok(sourceNote(ai.ok ? null : ai.reason))
  },
  W,
)

export const discardRun = action(
  z.object({ id: objectId }),
  async ({ id }, ctx) => {
    const res = await ctx.db(ArcRun).updateOne({ _id: id, memberId: ctx.memberId, status: 'draft' }, { $set: { status: 'discarded' } })
    if (!res.modifiedCount) return fail('That draft is no longer open.')
    refresh()
    return ok('Draft discarded. Nothing was created.')
  },
  W,
)

export const clearArcHistory = action(
  z.object({}),
  async (_input, ctx) => {
    await ctx.db(ArcRun).deleteMany({ memberId: ctx.memberId, status: { $ne: 'applied' } })
    refresh()
    return ok('Arc history cleared')
  },
  W,
)
