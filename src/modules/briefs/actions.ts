'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, fail, ok } from '@/lib/actions'
import type { Ctx } from '@/lib/ctx'
import { todayIST } from '@/lib/dates'
import { NotFoundError } from '@/lib/errors'
import { hhmm, objectId } from '@/lib/validation'
import { Brief } from '@/models/messaging/Brief'
import { TASK_PRIORITIES } from '@/modules/work/tasks/constants'
import { allowedSections, presetFor, presetSections } from './catalog'
import { BRIEF_FREQUENCIES, DEFAULT_BRIEF_DAYS } from './schedule'
import { sendBrief } from './send'

/** Profile → Briefs: each person's own briefs (create, edit, delete, preview). */

const PATH = '/app/settings/profile/briefs'
const MAX_BRIEFS = 5
// A brief only changes what reaches the person, so it works in a read-only workspace too.
const OWN = { allowReadOnly: true } as const

const briefSchema = z.object({
  id: objectId,
  name: z.string().trim().min(1, 'Give the brief a name').max(60),
  enabled: z.boolean(),
  time: hhmm,
  frequency: z.enum(BRIEF_FREQUENCIES),
  days: z.array(z.number().int().min(0).max(6)).max(7),
  weekday: z.number().int().min(0).max(6),
  channels: z.object({ inapp: z.boolean(), email: z.boolean() }),
  sections: z.array(z.string().max(40)).max(30),
  priorities: z.array(z.enum(TASK_PRIORITIES)).max(4),
  projectIds: z.array(objectId).max(20),
  scope: z.enum(['assigned', 'created', 'watching']),
  skipIfEmpty: z.boolean(),
})

const own = async (ctx: Ctx, id: string) => {
  const brief = await ctx.db(Brief).findOne({ _id: id, userId: ctx.userId }).lean()
  if (!brief) throw new NotFoundError('That brief')
  return brief
}

export const createBrief = action(
  z.object({ name: z.string().trim().max(60).optional() }),
  async ({ name }, ctx) => {
    const count = await ctx.db(Brief).countDocuments({ userId: ctx.userId })
    if (count >= MAX_BRIEFS) return fail(`You can keep up to ${MAX_BRIEFS} briefs.`)
    const first = count === 0
    const brief = await ctx.db(Brief).create({
      userId: ctx.userId,
      memberId: ctx.memberId,
      name: name || (first ? 'Morning brief' : 'End-of-day wrap'),
      time: first ? '08:30' : '18:30',
      days: [...DEFAULT_BRIEF_DAYS],
      frequency: 'daily',
      channels: { inapp: true, email: true, whatsapp: false },
      sections: presetSections(presetFor(ctx), ctx),
      skipIfEmpty: true,
    })
    revalidatePath(PATH)
    return ok(`${brief.name} created.`, { id: String(brief._id) })
  },
  OWN,
)

export const updateBrief = action(
  briefSchema,
  async (input, ctx) => {
    await own(ctx, input.id)
    if (input.enabled && !input.channels.inapp && !input.channels.email) return fail('Pick at least one place to get the brief: in-app or email.')
    if (input.frequency === 'daily' && !input.days.length) return fail('Pick at least one day.')
    const sections = allowedSections(input.sections, ctx)
    if (!sections.length) return fail('Pick at least one section.')
    await ctx.db(Brief).updateOne(
      { _id: input.id, userId: ctx.userId },
      {
        $set: {
          name: input.name,
          enabled: input.enabled,
          time: input.time,
          frequency: input.frequency,
          days: [...new Set(input.days)].sort(),
          weekday: input.weekday,
          'channels.inapp': input.channels.inapp,
          'channels.email': input.channels.email,
          sections,
          filters: { priorities: input.priorities, projectIds: input.projectIds, tags: [], scope: input.scope },
          skipIfEmpty: input.skipIfEmpty,
        },
      },
    )
    revalidatePath(PATH)
    return ok(`${input.name} saved.`)
  },
  OWN,
)

export const deleteBrief = action(
  z.object({ id: objectId }),
  async ({ id }, ctx) => {
    const brief = await own(ctx, id)
    await ctx.db(Brief).deleteOne({ _id: id, userId: ctx.userId })
    revalidatePath(PATH)
    return ok(`${brief.name} deleted.`)
  },
  OWN,
)

export const previewBrief = action(
  z.object({ id: objectId }),
  async ({ id }, ctx) => {
    const brief = await own(ctx, id)
    if (!brief.channels?.inapp && !brief.channels?.email) return fail('Turn on in-app or email for this brief first.')
    const outcome = await sendBrief(ctx, brief, { today: todayIST(), preview: true })
    return ok(`Preview sent (${outcome.channels.join(' and ')}). Your schedule is unchanged.`)
  },
  OWN,
)
