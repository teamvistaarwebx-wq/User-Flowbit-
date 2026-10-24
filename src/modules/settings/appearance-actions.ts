'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, fail, ok } from '@/lib/actions'
import { audit } from '@/lib/audit'
import { BRAND_COLOR_KEYS, brandColorsAllowed, normalizeHex, resolveTheme } from '@/lib/brand-theme'
import { Org } from '@/models/Org'
import { AVATAR_STYLE_LABEL, AVATAR_STYLES } from '@/lib/avatar-pattern'

const SUITE_ONLY = 'Brand colours are part of the Suite plan. Move to Suite in Settings → Plan & billing to use them.'

const color = (label: string) =>
  z
    .string({ error: `Choose a ${label} colour` })
    .trim()
    .transform((v, c) => {
      const hex = normalizeHex(v)
      if (!hex) c.addIssue({ code: 'custom', message: 'Use a hex colour like #BB62A5' })
      return hex ?? ''
    })

/** Primary, secondary and accent brand colours for the whole workspace (owners and admins). */
export const saveBrandColors = action(
  z.object({ primary: color('primary'), secondary: color('secondary'), accent: color('accent') }),
  async (input, ctx) => {
    if (!brandColorsAllowed(ctx.org)) return fail(SUITE_ONLY)
    const before = resolveTheme(ctx.org.theme)
    if (BRAND_COLOR_KEYS.every((k) => before[k] === input[k])) return ok('Nothing changed.')
    await Org.updateOne({ _id: ctx.orgId }, { $set: { theme: input } })
    await audit(ctx, { action: 'org.theme_updated', entity: 'Org', entityId: ctx.orgId, summary: 'Brand colours updated', changes: { before, after: input } })
    revalidatePath('/app', 'layout')
    return ok('Brand colours saved. Everyone sees them on their next page load.')
  },
  { perm: 'org.manage' },
)

/** Back to Flowbit's colours. */
export const resetBrandColors = action(
  z.object({}),
  async (_input, ctx) => {
    if (!ctx.org.theme) return ok('Already using Flowbit colours.')
    const before = resolveTheme(ctx.org.theme)
    await Org.updateOne({ _id: ctx.orgId }, { $unset: { theme: 1 } })
    await audit(ctx, { action: 'org.theme_reset', entity: 'Org', entityId: ctx.orgId, summary: 'Brand colours reset to Flowbit defaults', changes: { before, after: resolveTheme(null) } })
    revalidatePath('/app', 'layout')
    return ok('Back to Flowbit colours.')
  },
  { perm: 'org.manage' },
)

/** Avatars without a photo across the workspace: initials on a colour, or a generated pattern. */
export const saveAvatarStyle = action(
  z.object({ style: z.enum(AVATAR_STYLES) }),
  async ({ style }, ctx) => {
    const before = ctx.org.avatarStyle ?? 'initials'
    if (before === style) return ok('Nothing changed.')
    await Org.updateOne({ _id: ctx.orgId }, { $set: { avatarStyle: style } })
    await audit(ctx, { action: 'org.avatar_style_updated', entity: 'Org', entityId: ctx.orgId, summary: `Avatar style set to ${AVATAR_STYLE_LABEL[style].toLowerCase()}`, changes: { before: { avatarStyle: before }, after: { avatarStyle: style } } })
    revalidatePath('/app', 'layout')
    return ok('Avatar style saved.')
  },
  { perm: 'org.manage' },
)
