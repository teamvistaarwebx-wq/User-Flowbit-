import 'server-only'
import { unstable_rethrow } from 'next/navigation'
import { z } from 'zod'
import type { Permission, ProductKey, FeatureKey } from '@/lib/catalog'
import { getCtx, isBlocked, type Ctx } from '@/lib/ctx'
import { dbConnect } from '@/lib/db'
import { UserError } from '@/lib/errors'

import type { ActionErrorCode, ActionResult } from '@/lib/action-types'
import { actionInput } from '@/lib/form-data'
import { localeOfUser } from '@/lib/i18n'
import { localiseResult } from '@/lib/i18n/server-messages'

export type { ActionResult }
export { actionInput, formDataToObject } from '@/lib/form-data'

export type ActionOptions = {
  perm?: Permission
  /** Any one of these permissions. */
  anyPerm?: Permission[]
  product?: ProductKey
  feature?: FeatureKey
  /** Allow while the workspace is read-only (e.g. choosing a plan). */
  allowReadOnly?: boolean
  /** Allow while the workspace is blocked (subscription, checkout, own preferences, deleting it). */
  allowBlocked?: boolean
  /** Allow for an admin who must still set up two-factor sign-in (the enrolment itself, profile, sign-out). */
  allowWithout2fa?: boolean
  /** Return the message in the member's language (employee self-service actions; lib/i18n/server-messages). */
  localise?: boolean
}

export const TWO_FACTOR_MESSAGE = 'This workspace requires two-factor sign-in for owners and admins. Set it up in Settings → Security first.'

const BLOCKED_MESSAGE = 'This workspace is paused. An owner can restore access in Settings → Plan & billing.'

// A blank required field arrives as undefined; say so plainly instead of zod's "expected string, received undefined".
// Schema-level messages (e.g. { error: 'Full name is required' }) still win over this default.
z.config({ customError: (iss) => (iss.code === 'invalid_type' && iss.input === undefined ? 'This field is required.' : undefined) })

export const ok = <T = void>(message?: string, data?: T, redirect?: string): ActionResult<T> => ({ ok: true, message, data, redirect })
export const fail = (error: string, fieldErrors?: Record<string, string>, code?: ActionErrorCode): ActionResult<never> => ({ ok: false, error, fieldErrors, ...(code ? { code } : {}) })

/** First message per field path ('contacts.0.email'). */
export function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path.join('.')
    if (key && !out[key]) out[key] = issue.message
  }
  return out
}

/** Turns a thrown error into `{ ok: false }`: zod field errors, UserError messages, or a logged generic message. */
export function toResultError(error: unknown, scope: string): ActionResult<never> {
  if (error instanceof z.ZodError) return fail('Some fields need attention.', fieldErrorsFrom(error))
  if (error instanceof UserError) return fail(error.message, error.fieldErrors, error.code)
  console.error(`[action:${scope}]`, error)
  return fail('Something went wrong on our side. Please try again in a moment.')
}

/**
 * Wraps a server action: parses FormData or a plain object with `schema`,
 * builds the member ctx, checks permission / product / feature / read-only,
 * and converts known errors into `{ ok: false }`. Redirects pass through.
 *
 *   export const createClient = action(clientSchema, async (input, ctx) => { ...; return ok('Client added') }, { perm: 'clients.write' })
 */
export function action<S extends z.ZodType, O = void>(
  schema: S,
  fn: (input: z.output<S>, ctx: Ctx) => Promise<ActionResult<O>>,
  opts: ActionOptions = {},
): (input: FormData | z.input<S>) => Promise<ActionResult<O>> {
  return async (input) => {
    let ctx: Ctx | null = null
    const result = await (async (): Promise<ActionResult<O>> => {
      try {
        ctx = await getCtx()
        if (!ctx) return fail('Your session has ended. Sign in again to continue.')
        const refusal = gateRefusal(ctx, opts)
        if (refusal) return refusal
        const parsed = schema.safeParse(actionInput(input))
        if (!parsed.success) return fail('Some fields need attention.', fieldErrorsFrom(parsed.error))
        return await fn(parsed.data, ctx)
      } catch (error) {
        unstable_rethrow(error)
        return toResultError(error, fn.name || 'anonymous')
      }
    })()
    const user = (ctx as Ctx | null)?.user
    return opts.localise && user ? localiseResult(result, localeOfUser(user)) : result
  }
}

/** The checks `action()` makes before it runs (blocked, product, feature, permission, read-only); throws ForbiddenError / ReadOnlyError like they do. */
function gateRefusal(ctx: Ctx, opts: ActionOptions): ActionResult<never> | null {
  if (ctx.twoFactorMissing && !opts.allowWithout2fa) return fail(TWO_FACTOR_MESSAGE)
  if (isBlocked(ctx) && !opts.allowBlocked) return fail(BLOCKED_MESSAGE)
  if (opts.product) ctx.assertProduct(opts.product)
  if (opts.feature && !ctx.hasFeature(opts.feature)) return fail('Your plan does not include this feature. An owner can upgrade in Settings → Plan & billing.')
  if (opts.perm) ctx.assert(opts.perm)
  if (opts.anyPerm && !ctx.canAny(...opts.anyPerm)) return fail("You don't have permission to do that. Ask a workspace admin for access.")
  if (!opts.allowReadOnly) ctx.assertWritable()
  return null
}

/**
 * Runs `fn` for a member context built without a browser (an approval link
 * from an email, a WhatsApp button or the employee bot) behind exactly the
 * checks `action()` makes, so no channel can do more than the app allows.
 */
export async function runChecked<O>(ctx: Ctx, opts: ActionOptions, fn: (ctx: Ctx) => Promise<ActionResult<O>>, scope = 'checked'): Promise<ActionResult<O>> {
  try {
    const refusal = gateRefusal(ctx, opts)
    if (refusal) return refusal
    return await fn(ctx)
  } catch (error) {
    unstable_rethrow(error)
    return toResultError(error, scope)
  }
}

/** Like `action` but without a signed-in member (login, signup, password reset). */
export function publicAction<S extends z.ZodType, O = void>(
  schema: S,
  fn: (input: z.output<S>) => Promise<ActionResult<O>>,
): (input: FormData | z.input<S>) => Promise<ActionResult<O>> {
  return async (input) => {
    try {
      await dbConnect()
      const parsed = schema.safeParse(actionInput(input))
      if (!parsed.success) return fail('Some fields need attention.', fieldErrorsFrom(parsed.error))
      return await fn(parsed.data)
    } catch (error) {
      unstable_rethrow(error)
      return toResultError(error, fn.name || 'public')
    }
  }
}
