import { z } from 'zod'
import { isoDate, listOf, objectId, optionalText, requiredText } from '@/lib/validation'
import { tagsField } from '@/modules/work/tasks/schemas'
import { PROJECT_CODE_PATTERN, PROJECT_STATUSES } from './constants'

export const projectSchema = z
  .object({
    name: requiredText('Project name', 100),
    code: z
      .string()
      .trim()
      .toUpperCase()
      .optional()
      .transform((v) => v || undefined)
      .refine((v) => !v || PROJECT_CODE_PATTERN.test(v), 'Use 2–20 capital letters, numbers or hyphens'),
    clientId: objectId.optional(),
    description: optionalText(1000),
    status: z.enum(PROJECT_STATUSES).default('active'),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color must be a valid hex color').default('#818CF8'),
    startDate: isoDate.optional(),
    endDate: isoDate.optional(),
    leadId: objectId,
    memberIds: listOf(objectId),
    tags: tagsField,
  })
  .refine((v) => !v.startDate || !v.endDate || v.endDate >= v.startDate, { path: ['endDate'], message: 'End date cannot be before the start date' })

export const milestoneSchema = z.object({
  title: requiredText('Title', 120),
  dueDate: isoDate,
  description: optionalText(1000),
})
