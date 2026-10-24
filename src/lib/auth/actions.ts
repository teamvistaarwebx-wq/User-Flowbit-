'use server'

import { redirect } from 'next/navigation'
import { invitedPhrase, trialSizeHint } from '@/lib/lifecycle-copy'
import type { Types } from 'mongoose'
import { z } from 'zod'
import { fail, ok, publicAction, type ActionResult } from '@/lib/actions'
import { dbConnect } from '@/lib/db'
import { UserError } from '@/lib/errors'
import { signupAccountType } from '@/lib/account-types'
import { assertRateLimit, clearRateLimit, RATE_LIMITS, rateLimit, rateLimitMessage, type RateLimitScope } from '@/lib/rate-limit'
import { requestIp } from '@/lib/request'
import { safeNextPath } from '@/lib/safe-next'
import { email as emailField, checkbox, requiredText, slug as slugField } from '@/lib/validation'
import { duplicateMessage, taxIdField, trialUsedMessage } from '@/lib/signup-guard'
import { createWorkspace, freeWorkspaceTaken, hasLiveWorkspace, isSlugAvailable, TEAM_SIZES, trialTakenByBusiness, WORKSPACE_MODES } from '@/lib/workspace'
import { afterSignup } from '@/modules/console/signup'
import { BUILTIN_ROLE_KEYS } from '@/lib/permissions'
import { User } from '@/models/User'
import { acceptInvite, createInvite, inviteForEmail } from './invites'
import { hashPassword, passwordSchema, verifyPassword } from './password'
import { sendSignupCode, verifySignupCode } from './email-verification'
import { rememberPlanIntent, takePlanIntent } from './plan-intent-cookie'
import { takeSignupUtm } from './utm-cookie'
import { planConfig } from '@/modules/console/settings-query'
import { requestPasswordReset, resetPassword } from './reset'
import { createSession, destroySession, markEmailVerified, requireUser, setActiveOrg } from './session'
import { startSignIn, TWO_FACTOR_PATH } from './two-factor'

const ipKey = async (scope: RateLimitScope, id: string) => `${scope}:${await requestIp()}:${id}`
const accountKey = (email: string) => `loginAccount:${email}`

/** Counts an attempt for this IP (+ id); the refusal message when over the limit, else null. */
async function overLimit(scope: RateLimitScope, id: string): Promise<string | null> {
  const { limit, windowMs } = RATE_LIMITS[scope]
  const result = await rateLimit(await ipKey(scope, id), limit, windowMs)
  return result.ok ? null : rateLimitMessage(result.retryAfterSeconds)
}

/** Counts a sign-in attempt for the account alone (any IP). */
async function accountOverLimit(email: string): Promise<string | null> {
  const { limit, windowMs } = RATE_LIMITS.loginAccount
  const result = await rateLimit(accountKey(email), limit, windowMs)
  return result.ok ? null : rateLimitMessage(result.retryAfterSeconds)
}

/** A correct password ends the brute-force window, so only failed sign-ins pile up. */
async function forgetLoginAttempts(email: string): Promise<void> {
  await Promise.all([clearRateLimit(await ipKey('login', email)), clearRateLimit(accountKey(email))])
}

async function landingFor(userId: Types.ObjectId, next?: string) {
  return (await hasLiveWorkspace(userId)) ? safeNextPath(next, '/app') : '/onboarding'
}

// --- Sign in -----------------------------------------------------------------

const loginSchema = z.object({
  email: emailField,
  password: z.string({ error: 'Enter your password' }).min(1, 'Enter your password'),
  terms: checkbox.refine((v) => v, 'Accept the terms to continue'),
  next: z.string().optional(),
  invite: z.string().optional(),
})

export const loginAction = publicAction(loginSchema, async (input) => {
  const refused = (await overLimit('login', input.email)) ?? (await accountOverLimit(input.email))
  if (refused) return fail(refused)
  const user = await User.findOne({ email: input.email }).lean()
  const valid = await verifyPassword(input.password, user?.passwordHash)
  if (!user || !valid) {
    return fail('That email and password do not match. Check them or reset your password.', { password: 'Email or password is incorrect' })
  }
  await forgetLoginAttempts(input.email)
  // Check the invite before the session exists: a refusal must leave the visitor signed out.
  if (input.invite) await inviteForEmail(input.invite, user.email)
  // Two-factor sign-in: no session until the code (lib/auth/two-factor); the invite and `next` ride along.
  if (!(await startSignIn(user, { activeOrgId: user.lastOrgId, next: input.next, invite: input.invite }))) return ok(undefined, undefined, TWO_FACTOR_PATH)
  if (input.invite) {
    const invite = await acceptInvite(input.invite, user._id)
    await setActiveOrg(invite.orgId)
    return ok(`Welcome, ${user.name.split(' ')[0]}. You joined the workspace.`, undefined, '/app')
  }
  return ok(`Welcome back, ${user.name.split(' ')[0]}`, undefined, await landingFor(user._id, input.next))
})

// --- Sign up -----------------------------------------------------------------

const signupSchema = z.object({
  name: requiredText('Your name', 80),
  email: emailField,
  password: passwordSchema,
  terms: checkbox.refine((v) => v, 'Accept the terms to continue'),
  invite: z.string().optional(),
  /** Pricing-page pick, e.g. `plan=custom&products=work,folio` (lib/plan-intent). */
  planIntent: z.string().max(200).optional(),
})

export const signupAction = publicAction(signupSchema, async (input) => {
  if (await overLimit('signup', 'any')) return fail('Too many sign-ups from this network. Try again later.')
  const existing = await User.findOne({ email: input.email }).lean()
  if (existing?.passwordHash || existing?.googleId) {
    return fail('An account with this email already exists. Sign in instead.', { email: 'Already registered — sign in instead' })
  }
  // Checked before any account or session is created: a refused invite must not leave anyone signed in.
  const invite = input.invite ? await inviteForEmail(input.invite, input.email) : null
  // An unclaimed account exists because someone was invited; only the invite link (sent to that inbox) may claim it.
  if (existing && !invite) {
    return fail('This email has a pending invitation. Open the invite link from your email to create your password.', { email: 'Use the invite link from your email' })
  }
  const passwordHash = await hashPassword(input.password)
  const user = existing
    ? await User.findOneAndUpdate({ _id: existing._id }, { $set: { name: input.name, passwordHash } }, { returnDocument: 'after' }).lean()
    : (await User.create({ name: input.name, email: input.email, passwordHash })).toObject()
  await createSession(user!._id)
  if (invite) {
    // The invite link was opened from that inbox.
    await markEmailVerified(user!._id)
  }
  if (input.invite) {
    const invite = await acceptInvite(input.invite, user!._id)
    await setActiveOrg(invite.orgId)
    return ok('Account created. You joined the workspace.', undefined, '/app')
  }
  await rememberPlanIntent(input.planIntent)
  return ok('Account created. Now set up your workspace.', undefined, await landingFor(user!._id))
})

// --- Password reset ------------------------------------------------------------

export const forgotPasswordAction = publicAction(z.object({ email: emailField }), async ({ email }) => {
  if (await overLimit('forgotPassword', email)) return fail('We already sent a few links. Check your inbox or try again later.')
  await requestPasswordReset(email)
  return ok(`If ${email} has a Flowbit account, a reset link is on its way.`)
})

const resetSchema = z
  .object({ token: z.string().min(10), password: passwordSchema, confirm: z.string({ error: 'Repeat the password' }) })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' })

export const resetPasswordAction = publicAction(resetSchema, async (input) => {
  const refused = await overLimit('resetPassword', 'any')
  if (refused) return fail(refused)
  const userId = await resetPassword(input.token, input.password)
  // The reset link proves the person reads that inbox.
  await markEmailVerified(userId)
  // A reset proves the inbox, not the phone: two-factor sign-in still asks for the code.
  const user = await User.findById(userId, { twoFactor: 1 }).lean()
  if (user && !(await startSignIn(user))) return ok('Password changed. Enter your two-factor code to sign in.', undefined, TWO_FACTOR_PATH)
  if (!user) await createSession(userId)
  return ok('Password changed. You are signed in.', undefined, await landingFor(userId))
})

// --- Invites -------------------------------------------------------------------

/** Accept as the signed-in user (the invite page shows this when already signed in). */
export const acceptInviteAction = publicAction(z.object({ token: z.string().min(10) }), async ({ token }) => {
  const { user } = await requireUser()
  const refused = await overLimit('inviteAccept', String(user._id))
  if (refused) return fail(refused)
  const invite = await acceptInvite(token, user._id)
  await setActiveOrg(invite.orgId)
  return ok('You joined the workspace.', undefined, '/app')
})

// --- Onboarding ----------------------------------------------------------------

const onboardingSchema = z.object({
  name: requiredText('Workspace name', 60),
  slug: slugField,
  teamSize: z.enum(TEAM_SIZES, { error: 'Choose how many people will use it' }),
  mode: z.enum(WORKSPACE_MODES, { error: 'Choose how you want to work' }),
  /** Optional GSTIN or PAN: one Free workspace per business. */
  taxId: taxIdField,
  invites: z
    .array(z.object({ email: emailField, role: z.enum(BUILTIN_ROLE_KEYS).exclude(['owner']).default('member') }))
    .max(50, 'Invite at most 50 people now; add more later from Settings')
    .default([]),
})

const UNVERIFIED = 'Verify your email first: enter the six digit code we sent you.'

export const createWorkspaceAction = publicAction(onboardingSchema, async (input): Promise<ActionResult<{ slug: string }>> => {
  const { user } = await requireUser()
  if (!user.emailVerifiedAt) return fail(UNVERIFIED, { code: UNVERIFIED })
  if (!(await isSlugAvailable(input.slug))) return fail('That workspace URL is taken.', { slug: 'Already taken — try another' })
  const emails = [...new Set(input.invites.map((i) => i.email))].filter((e) => e !== user.email)
  const config = await planConfig()
  const accountType = signupAccountType({ teamSize: input.teamSize, invites: emails.length }, config.freeSeats)
  if (accountType === 'free') {
    const taken = await freeWorkspaceTaken(user._id, input.taxId)
    if (taken) return fail(duplicateMessage(taken.reason, taken.name), taken.reason === 'email' ? { teamSize: trialSizeHint(config.freeSeats) } : { taxId: 'Already has a Free workspace' })
  } else {
    // One 15-day trial per business (D5), by GSTIN, else PAN, else this verified email.
    const used = await trialTakenByBusiness(user._id, input.taxId)
    if (used) return fail(trialUsedMessage(used.reason, used.name), used.reason === 'email' ? { teamSize: 'Your business already had its trial' } : { taxId: 'Already had a trial' })
  }
  // Counted only when a workspace is about to be created, so a taken URL or a refusal does not use up the allowance.
  await assertRateLimit('workspaceCreate', String(user._id))
  const planIntent = await takePlanIntent()
  const signupUtm = await takeSignupUtm()
  const { org } = await createWorkspace(user._id, { name: input.name, slug: input.slug, teamSize: input.teamSize, mode: input.mode, planIntent, accountType, taxIds: input.taxId, limits: config, signupUtm })
  await setActiveOrg(org._id)
  const inviteCtx = { orgId: org._id, userId: user._id, user, org }
  let linkOnly = 0
  for (const email of emails) {
    const role = input.invites.find((i) => i.email === email)?.role ?? 'member'
    try {
      const { link } = await createInvite(inviteCtx, { email, role })
      if (link) linkOnly += 1
    } catch (error) {
      if (!(error instanceof UserError)) throw error
    }
  }
  afterSignup({
    orgId: org._id,
    slug: org.slug,
    name: user.name,
    email: user.email,
    workspace: org.name,
    teamSize: input.teamSize,
    products: org.enabledProducts ?? [],
    accountType,
    endsAt: new Date(org.subscription.trialEndsAt ?? Date.now()),
    planIntent,
    limits: config,
    utm: signupUtm,
  })
  const invited = invitedPhrase(emails.length, linkOnly)
  const plan = accountType === 'free' ? `You are on the Free plan for ${config.freeMonths} months, for up to ${config.freeSeats} people.` : `Your ${config.trialDays}-day trial has started.`
  return ok(`Workspace "${org.name}" created${invited}. ${plan}`, { slug: org.slug }, '/app')
})

// --- Email verification (signup code) -----------------------------------------

/** Emails a six digit code to the signed-in user's address. */
export const sendSignupCodeAction = publicAction(z.object({}), async () => {
  const { user } = await requireUser()
  if (user.emailVerifiedAt) return ok('Your email is already verified.')
  await sendSignupCode(user)
  return ok(`We sent a six digit code to ${user.email}. It lasts 10 minutes.`)
})

export const verifySignupCodeAction = publicAction(z.object({ code: z.string().trim().regex(/^\d{6}$/, 'Enter the six digit code') }), async ({ code }) => {
  const { user } = await requireUser()
  if (user.emailVerifiedAt) return ok('Your email is already verified.')
  const refused = await verifySignupCode(user, code)
  if (refused) return fail(refused, { code: refused })
  return ok('Email verified. Now set up your workspace.')
})

/** Live slug check for onboarding (debounced on the client). */
export async function checkSlugAction(value: string): Promise<{ available: boolean; message: string }> {
  const parsed = slugField.safeParse(value)
  if (!parsed.success) return { available: false, message: parsed.error.issues[0]?.message ?? 'Invalid URL' }
  await dbConnect()
  const available = await isSlugAvailable(parsed.data)
  return { available, message: available ? 'Available' : 'Already taken — try another' }
}

// --- Sign out ------------------------------------------------------------------

export async function signOutAction(): Promise<void> {
  await destroySession()
  redirect('/login')
}
