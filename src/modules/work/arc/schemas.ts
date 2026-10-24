import { z } from 'zod'

export const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const

const draftTask = z.object({
  title: z.string().trim().min(1).max(200),
  estimateMinutes: z.coerce.number().int().min(0).max(10_000).default(120),
  priority: z.enum(PRIORITIES).default('medium'),
})

/** What an outline draft looks like (AI JSON is validated against this). */
export const outlineDraftSchema = z.object({
  milestones: z
    .array(z.object({ title: z.string().trim().min(1).max(120), dueOffsetDays: z.coerce.number().int().min(0).max(730), tasks: z.array(draftTask).min(1).max(8) }))
    .min(1)
    .max(8),
})
export type OutlineDraft = z.infer<typeof outlineDraftSchema>

export const breakdownDraftSchema = z.object({ subtasks: z.array(draftTask.omit({ priority: true })).min(1).max(10) })
export type BreakdownDraft = z.infer<typeof breakdownDraftSchema>

/** Edited outline the person applies. */
export const applyOutlineSchema = z.object({
  runId: z.string().regex(/^[a-f0-9]{24}$/),
  projectId: z.string().regex(/^[a-f0-9]{24}$/).optional(),
  projectName: z.string().trim().max(100).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  milestones: z
    .array(z.object({ title: z.string().trim().min(1, 'Milestone needs a title').max(120), dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), tasks: z.array(draftTask).max(12) }))
    .min(1, 'Keep at least one milestone')
    .max(12),
})

export const applyBreakdownSchema = z.object({
  runId: z.string().regex(/^[a-f0-9]{24}$/),
  subtasks: z.array(draftTask.omit({ priority: true })).min(1, 'Keep at least one subtask').max(12),
})
