import { FREE_SEAT_LIMIT } from '@/lib/account-types'
import { fillTemplate } from '@/lib/console/settings-defaults'
import { TRIAL_DAYS } from '@/lib/plans'

/** Day 0 onboarding email (console spec 5.5). Pure: the words; modules/console/signup sends it. */

export type WelcomeInput = {
  name: string
  workspace: string
  accountType: 'free' | 'trial'
  /** When the Free months or the trial end. */
  endsAt: Date
  /** Console Free seats and trial days (lib/plan-config); the constants when absent. */
  limits?: Readonly<{ freeSeats: number; trialDays: number }>
  /** The Console "Welcome" template ({name}), shown first. */
  template?: string
}

export type WelcomeContent = { subject: string; title: string; paragraphs: string[]; cta: { label: string; href: string } }

const longDate = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' })

export function welcomeContent(input: WelcomeInput): WelcomeContent {
  const first = input.name.trim().split(/\s+/)[0] || 'there'
  const plan =
    input.accountType === 'free'
      ? `${input.workspace} is on the Free plan: every Flowbit product for up to ${input.limits?.freeSeats ?? FREE_SEAT_LIMIT} people, free until ${longDate(input.endsAt)}.`
      : `${input.workspace} has a ${input.limits?.trialDays ?? TRIAL_DAYS}-day trial of every Flowbit product for your whole team, until ${longDate(input.endsAt)}.`
  return {
    subject: `Welcome to Flowbit, ${first}`,
    title: `Welcome to Flowbit, ${first}`,
    paragraphs: [
      ...(input.template ? [fillTemplate(input.template, { name: first, workspace: input.workspace })] : []),
      plan,
      'Three things that take five minutes and make the rest easy:',
      '1. Invite the people you work with (Settings → Members).',
      '2. Add your first project and a few tasks in Work, or your team in Muster.',
      '3. Add a client, so quotes and invoices in Folio are one click away.',
      'Reply to this email if you get stuck. A real person reads it.',
    ],
    cta: { label: 'Open your workspace', href: '/app' },
  }
}
