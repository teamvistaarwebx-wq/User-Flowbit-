import type { ProductKey } from '@/lib/catalog'

/**
 * The "Get started" checklist on Home for owners and admins (pure): five
 * first steps, done from the workspace's real data (sample rows do not
 * count) or its usage events. Shown for the first 30 days, until every
 * available step is done, or until someone dismisses it.
 */

export const CHECKLIST_STEPS = ['invite', 'project', 'task', 'checkin', 'invoice'] as const
export type ChecklistStep = (typeof CHECKLIST_STEPS)[number]
export const CHECKLIST_WINDOW_DAYS = 30
export const INVITES_NEEDED = 2
const DAY_MS = 86_400_000

export type ChecklistFacts = Readonly<{
  /** Invites waiting to be accepted (accepted ones are teammates). */
  invites: number
  /** Active members other than the owner. */
  teammates: number
  projects: number
  tasks: number
  checkins: number
  invoices: number
  /** Usage kinds the workspace has recorded at least once (UsageEvent). */
  usage: ReadonlySet<string>
}>

type StepDef = Readonly<{ label: string; hint: string; href: string; product?: ProductKey; done: (f: ChecklistFacts) => boolean }>

export const STEP_DEFS: Readonly<Record<ChecklistStep, StepDef>> = {
  invite: { label: `Invite ${INVITES_NEEDED} people`, hint: 'Work is better with the team in it.', href: '/app/settings/members?invite=1', done: (f) => f.invites + f.teammates >= INVITES_NEEDED },
  project: { label: 'Create a project', hint: 'Group the work for one client or goal.', href: '/app/work/projects?new=1', product: 'work', done: (f) => f.projects > 0 },
  task: { label: 'Add a task', hint: 'Give it a due date and an owner.', href: '/app/work/tasks', product: 'work', done: (f) => f.tasks > 0 || f.usage.has('task_created') },
  checkin: { label: 'Check in', hint: 'Use Check in in the side panel or on your phone.', href: '/app/me/attendance', product: 'muster', done: (f) => f.checkins > 0 || f.usage.has('attendance_marked') },
  invoice: { label: 'Draft an invoice', hint: 'GST-ready, with a UPI QR for quick payment.', href: '/app/folio/invoices/new', product: 'folio', done: (f) => f.invoices > 0 || f.usage.has('invoice_issued') },
}

export type ChecklistItem = { key: ChecklistStep; label: string; hint: string; href: string; done: boolean }
export type ChecklistProgress = { items: ChecklistItem[]; done: number; total: number; complete: boolean }

/** The steps this workspace can do (its products) with their state. */
export function checklistProgress(facts: ChecklistFacts, products: readonly ProductKey[]): ChecklistProgress {
  const items = CHECKLIST_STEPS.filter((k) => !STEP_DEFS[k].product || products.includes(STEP_DEFS[k].product!)).map((key) => {
    const def = STEP_DEFS[key]
    return { key, label: def.label, hint: def.hint, href: def.href, done: def.done(facts) }
  })
  const done = items.filter((i) => i.done).length
  return { items, done, total: items.length, complete: done === items.length }
}

/** Show it to owners and admins in the first 30 days, until complete or dismissed. */
export function showChecklist(input: { canManage: boolean; createdAt: Date; now: Date; dismissedAt?: Date | null; complete: boolean }): boolean {
  if (!input.canManage || input.dismissedAt || input.complete) return false
  return input.now.getTime() - input.createdAt.getTime() < CHECKLIST_WINDOW_DAYS * DAY_MS
}
