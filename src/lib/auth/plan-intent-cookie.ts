import 'server-only'
import { cookies } from 'next/headers'
import { secureCookies } from '@/lib/env'
import { PLAN_INTENT_COOKIE, PLAN_INTENT_MAX_AGE, parsePlanIntentQuery, planIntentQuery } from '@/lib/plan-intent'

/** Remembers the pricing-page pick until the workspace exists (createWorkspaceAction stores it on the Org). Actions and route handlers only. */
export async function rememberPlanIntent(query: string | null | undefined): Promise<void> {
  const intent = parsePlanIntentQuery(query)
  if (!intent) return
  ;(await cookies()).set(PLAN_INTENT_COOKIE, planIntentQuery(intent), {
    httpOnly: true,
    sameSite: 'lax',
    secure: secureCookies(),
    path: '/',
    maxAge: PLAN_INTENT_MAX_AGE,
  })
}

/** The remembered pick (normalized), cleared once read. */
export async function takePlanIntent(): Promise<string | null> {
  const jar = await cookies()
  const intent = parsePlanIntentQuery(jar.get(PLAN_INTENT_COOKIE)?.value)
  if (jar.has(PLAN_INTENT_COOKIE)) jar.delete(PLAN_INTENT_COOKIE)
  return intent ? planIntentQuery(intent) : null
}
