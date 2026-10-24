import 'server-only'
import { after } from 'next/server'
import type { Types } from 'mongoose'
import { emailLayout, sendMail } from '@/lib/mail'
import type { PlanConfig } from '@/lib/plan-config'
import type { SignupUtm } from '@/lib/utm'
import { recordHouseLead } from './house-lead'
import { consoleSettings } from './settings-query'
import { welcomeContent, type WelcomeInput } from './welcome-content'

export type SignupDone = WelcomeInput & {
  orgId: Types.ObjectId
  slug: string
  email: string
  teamSize: string
  products: readonly string[]
  planIntent?: string | null
  limits?: Pick<PlanConfig, 'freeSeats' | 'trialDays'>
  utm?: SignupUtm | null
}

async function sendWelcome(input: SignupDone): Promise<void> {
  const { templates } = await consoleSettings()
  const content = welcomeContent({ ...input, template: templates.welcome })
  const mail = emailLayout({ title: content.title, paragraphs: content.paragraphs, cta: content.cta })
  const sent = await sendMail({ to: input.email, subject: content.subject, ...mail, orgId: input.orgId, kind: 'onboarding', entity: 'Org', entityId: input.orgId })
  if (!sent.ok) console.error('[console] welcome email failed', String(input.orgId), sent.error)
}

/**
 * After a workspace is created: the Day 0 email to the owner and the Lead in
 * Vistaar's own Orbit. Both run after the response; neither can fail signup.
 */
export function afterSignup(input: SignupDone): void {
  after(() => sendWelcome(input).catch((error: unknown) => console.error('[console] welcome email failed', String(input.orgId), error)))
  recordHouseLead({
    origin: 'signup',
    name: input.name,
    email: input.email,
    company: input.workspace,
    teamSize: input.teamSize,
    products: input.products,
    accountType: input.accountType,
    workspace: input.slug,
    planIntent: input.planIntent,
    utm: input.utm,
  })
}
