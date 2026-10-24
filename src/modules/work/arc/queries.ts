import 'server-only'
import type { Ctx } from '@/lib/ctx'
import { ArcRun } from '@/models/work/ArcRun'
import { Project } from '@/models/work/Project'
import { Task } from '@/models/work/Task'
import { Team } from '@/models/work/Team'
import { canModifyTask } from '../tasks/access'
import { getViewer } from '../tasks/viewer'
import { aiEnabled } from './claude'
import { aiAllowanceFor } from './usage'
import { projectVisibility, taskVisibility, type SearchGroups } from './search'
import type { BreakdownDraft, OutlineDraft } from './schemas'

const HISTORY = 10

export type ArcRunView =
  | { id: string; kind: 'search'; prompt: string; createdAt: string; status: string; source: string; groups: SearchGroups; shortcut: { label: string; href: string } | null }
  | { id: string; kind: 'outline'; prompt: string; createdAt: string; status: string; source: string; projectName: string; projectId?: string; goal: string; startDate: string; draft: OutlineDraft; appliedHref?: string }
  | { id: string; kind: 'breakdown'; prompt: string; createdAt: string; status: string; source: string; taskId: string; taskKey: string; taskTitle: string; draft: BreakdownDraft; appliedHref?: string }
  | { id: string; kind: 'progress'; prompt: string; createdAt: string; status: string; source: string; text: string; postHref?: string }

/** The member's last 10 Arc exchanges, oldest first (chat order). */
export async function recentRuns(ctx: Ctx): Promise<ArcRunView[]> {
  const runs = await ctx.db(ArcRun).find({ memberId: ctx.memberId }).sort({ createdAt: -1 }).limit(HISTORY).lean()
  return runs.reverse().map((r): ArcRunView => {
    const base = { id: String(r._id), prompt: r.prompt, createdAt: r.createdAt.toISOString(), status: r.status, source: r.source }
    const o = (r.output ?? {}) as Record<string, unknown>
    const applied = r.applied
    switch (r.kind) {
      case 'outline':
        return { ...base, kind: 'outline', projectName: String(o.projectName ?? ''), projectId: o.projectId ? String(o.projectId) : undefined, goal: String(o.goal ?? ''), startDate: String(o.startDate ?? ''), draft: o.draft as OutlineDraft, appliedHref: applied?.projectId ? `/app/work/projects/${applied.projectId}` : undefined }
      case 'breakdown':
        return { ...base, kind: 'breakdown', taskId: String(o.taskId ?? ''), taskKey: String(o.taskKey ?? ''), taskTitle: String(o.taskTitle ?? ''), draft: o.draft as BreakdownDraft, appliedHref: r.status === 'applied' ? `/app/work/tasks/${o.taskId}` : undefined }
      case 'progress':
        return { ...base, kind: 'progress', text: String(o.text ?? ''), postHref: applied?.postId ? `/app/work/posts/${applied.postId}` : undefined }
      default:
        return { ...base, kind: 'search', groups: (o.groups ?? {}) as SearchGroups, shortcut: (o.shortcut as { label: string; href: string } | null) ?? null }
    }
  })
}

/** Picker data for the quick actions. Break down lists only tasks the member may add subtasks to (same rule as Apply). */
export async function arcOptions(ctx: Ctx) {
  const [visible, viewer, projects, teams, allowance] = await Promise.all([
    ctx.can('tasks.write') ? ctx.db(Task).find({ $and: [await taskVisibility(ctx), { status: { $ne: 'done' }, parentId: null }] }, { title: 1, key: 1, creatorId: 1, assigneeIds: 1, isPersonal: 1 }).sort({ updatedAt: -1 }).limit(400).lean() : [],
    getViewer(ctx),
    ctx.can('projects.read') ? ctx.db(Project).find({ ...projectVisibility(ctx), status: { $nin: ['completed', 'cancelled'] } }, { name: 1, code: 1 }).sort({ name: 1 }).lean() : [],
    ctx.db(Team).find({}, { name: 1 }).sort({ name: 1 }).lean(),
    aiAllowanceFor(ctx),
  ])
  const tasks = visible.filter((t) => canModifyTask(viewer, t)).slice(0, 150)
  return {
    // Free has a cap of 0: say "templates", not "drafts with Claude".
    ai: aiEnabled() && allowance.cap > 0,
    tasks: tasks.map((t) => ({ value: String(t._id), label: t.title, hint: t.key })),
    projects: projects.map((p) => ({ value: String(p._id), label: p.name, hint: p.code })),
    teams: teams.map((t) => ({ value: String(t._id), label: t.name })),
  }
}
