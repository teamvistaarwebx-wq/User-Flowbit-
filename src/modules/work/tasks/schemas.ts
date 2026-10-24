import { z } from 'zod'
import { checkbox, isoDate, listOf, objectId, optionalText } from '@/lib/validation'
import { COMMENT_MAX, DESCRIPTION_MAX, TASK_PRIORITIES, TASK_STATUSES } from './constants'
import { parseDuration } from './duration'

/** Zod pieces shared by the task actions (kept out of 'use server' files). */

export const statusField = z.enum(TASK_STATUSES)
export const priorityField = z.enum(TASK_PRIORITIES)
export const nullableId = objectId.nullable()
export const nullableDate = isoDate.nullable()
/** 'HH:mm', 24-hour (IST). */
export const dueTimeField = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a time like 17:30')

/** Tags from a comma-separated string or repeated fields. */
export const tagsField = z.preprocess(
  (v) => (v === undefined ? [] : Array.isArray(v) ? v : String(v).split(',')),
  z.array(z.string().trim()).transform((list) => list.filter(Boolean)),
)

/** "1h 30m", "2d", "90m" or a bare number of hours -> minutes. */
export const estimateField = z
  .string()
  .trim()
  .optional()
  .transform((v, c) => {
    if (!v) return undefined
    const minutes = parseDuration(v)
    if (minutes == null) {
      c.addIssue({ code: 'custom', message: 'Use a duration like 1h 30m, 2d or 45m' })
      return z.NEVER
    }
    return minutes
  })

export const createTaskSchema = z.object({
  title: z.string({ error: 'Title is required' }).trim().min(1, 'Title is required'),
  description: optionalText(DESCRIPTION_MAX),
  status: statusField.optional(),
  priority: priorityField.optional(),
  assigneeIds: listOf(objectId),
  startDate: isoDate.optional(),
  dueDate: isoDate.optional(),
  projectId: objectId.optional(),
  spaceId: objectId.optional(),
  folderId: objectId.optional(),
  clientId: objectId.optional(),
  milestoneId: objectId.optional(),
  tags: tagsField,
  estimate: estimateField,
  blockedReason: optionalText(1000),
  personal: checkbox,
  parentId: objectId.optional(),
})

export const patchTaskSchema = z.object({
  id: objectId,
  title: z.string().optional(),
  description: z.string().max(DESCRIPTION_MAX, 'This is too long').nullable().optional(),
  status: statusField.optional(),
  blockedReason: z.string().max(1000).optional(),
  blockedMentionIds: z.array(objectId).optional(),
  priority: priorityField.optional(),
  assigneeIds: z.array(objectId).optional(),
  startDate: nullableDate.optional(),
  dueDate: nullableDate.optional(),
  estimateMinutes: z.number().int().min(0).max(100_000).nullable().optional(),
  tags: z.array(z.string()).optional(),
  projectId: nullableId.optional(),
  spaceId: nullableId.optional(),
  folderId: nullableId.optional(),
  milestoneId: nullableId.optional(),
  clientId: nullableId.optional(),
})

export const commentBody = z.string({ error: 'Comment cannot be empty' }).trim().min(1, 'Comment cannot be empty').max(COMMENT_MAX, `Use at most ${COMMENT_MAX} characters`)
