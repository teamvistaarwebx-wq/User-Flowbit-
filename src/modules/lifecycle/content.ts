import { FREE_SEAT_LIMIT } from '@/lib/account-types'
import { SITE_DOMAIN } from '@/lib/company'
import { DELETE_AFTER_BLOCKED_DAYS } from '@/lib/lifecycle'
import type { LifecycleNotice } from '@/lib/lifecycle-notices'
import type { OnboardingDay } from '@/lib/onboarding-steps'
import { fillTemplate } from '@/lib/console/settings-defaults'
import { BLOCKED_OPEN_PAGES, READ_ONLY_DAYS, yearlyPricingCopy } from '@/lib/plans'
import { cleanDiscountPercent, DEFAULT_FIRST_YEAR_DISCOUNT_PERCENT } from '@/lib/first-year-discount'

/**
 * The words of the lifecycle and onboarding emails (console spec 4.3, 5.5).
 * Pure: modules/lifecycle/notices and the lifecycle job send them through
 * the message pipeline. Buttons are app paths (APP_URL); the pricing link is
 * the public site.
 */

export type LifecycleMail = { subject: string; title: string; paragraphs: string[]; cta: { label: string; href: string }; inApp: string }

export const SUBSCRIPTION_HREF = '/app/settings/subscription'
export const EXPORT_HREF = '/app/settings/export'
export const PRICING_URL = `https://${SITE_DOMAIN}/pricing`

const longDate = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' })
const inDays = (days: number | null) => (days == null ? 'soon' : days <= 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`)
const EXPORT_LINE = 'You can export everything (a ZIP of JSON and CSV files) at any time from Settings → Export.'

/** Console settings the notices read: the opening-line templates, the Free seat limit and the first-year yearly discount (lib/console/settings-defaults, lib/plan-config). */
export type NoticeOptions = Readonly<{ templates?: Readonly<{ trialEnding?: string; freeEnding?: string }>; freeSeats?: number; yearlyDiscountPercent?: number }>

/** "Prices: …. Yearly plans cost 10 months' price (2 months free), and your first year is 50% off on top. …" (lib/plans yearlyPricingCopy). */
function pricesLine(opts: NoticeOptions): string {
  const percent = cleanDiscountPercent(opts.yearlyDiscountPercent ?? DEFAULT_FIRST_YEAR_DISCOUNT_PERCENT)
  return `Prices: ${PRICING_URL}. ${yearlyPricingCopy(percent)}`
}

function freeEnding(n: LifecycleNotice, workspace: string, opts: NoticeOptions): LifecycleMail {
  const when = inDays(n.lifecycle.daysLeft)
  const seats = opts.freeSeats ?? FREE_SEAT_LIMIT
  const discount = cleanDiscountPercent(opts.yearlyDiscountPercent ?? DEFAULT_FIRST_YEAR_DISCOUNT_PERCENT)
  const intro = opts.templates?.freeEnding ? [fillTemplate(opts.templates.freeEnding, { date: longDate(n.date), days: n.lifecycle.daysLeft ?? 0, workspace, discount })] : []
  return {
    subject: `Your Free plan ends ${when}: ${workspace}`,
    title: `Your Free plan ends ${when}`,
    paragraphs: [
      ...intro,
      `${workspace} has been on Flowbit's Free plan: every product for up to ${seats} people. The free months end on ${longDate(n.date)}.`,
      `Choose a plan to keep editing after that. If you don't, the workspace becomes read-only for ${READ_ONLY_DAYS} days, then it is locked, and its data is deleted ${DELETE_AFTER_BLOCKED_DAYS} days after that.`,
      pricesLine(opts),
    ],
    cta: { label: 'Choose a plan', href: SUBSCRIPTION_HREF },
    inApp: `Your Free plan ends ${when}`,
  }
}

function trialEnding(n: LifecycleNotice, workspace: string, opts: NoticeOptions): LifecycleMail {
  const when = inDays(n.lifecycle.daysLeft)
  const window = n.lifecycle.freeWindowEndsAt
  const trim = window && window.getTime() > n.date.getTime() ? [`Or trim the team to ${opts.freeSeats ?? FREE_SEAT_LIMIT} people and stay on the Free plan until ${longDate(window)}.`] : []
  const intro = opts.templates?.trialEnding ? [fillTemplate(opts.templates.trialEnding, { days: n.lifecycle.daysLeft ?? 0, date: longDate(n.date), workspace })] : []
  return {
    subject: `Your trial ends ${when}: ${workspace}`,
    title: `Your trial ends ${when}`,
    paragraphs: [...intro, `The free trial of ${workspace} ends on ${longDate(n.date)}.`, 'Choose a plan to keep editing after that. Your data stays either way.', ...trim, pricesLine(opts)],
    cta: { label: 'Choose a plan', href: SUBSCRIPTION_HREF },
    inApp: `Your trial ends ${when}`,
  }
}

function readOnly(n: LifecycleNotice, workspace: string): LifecycleMail {
  const ended = n.lifecycle.accountType === 'free' ? 'free months have' : n.lifecycle.accountType === 'trial' ? 'trial has' : 'plan has'
  return {
    subject: `${workspace} is now read-only`,
    title: `Your ${ended} ended: ${workspace} is read-only`,
    paragraphs: [
      `Everyone can still open and read everything, export data and download old payslips, but nothing can be changed.`,
      `On ${longDate(n.date)} the workspace is locked: only ${BLOCKED_OPEN_PAGES} open. Choose a plan any time to keep editing.`,
      EXPORT_LINE,
    ],
    cta: { label: 'Choose a plan', href: SUBSCRIPTION_HREF },
    inApp: `${workspace} is read-only until ${longDate(n.date)}`,
  }
}

function blocked(n: LifecycleNotice, workspace: string): LifecycleMail {
  return {
    subject: `${workspace} is locked`,
    title: `${workspace} is locked`,
    paragraphs: [
      `Only ${BLOCKED_OPEN_PAGES} open now. Choose a plan to open the workspace again; everything is where you left it.`,
      `If no plan is chosen, the workspace data is deleted on ${longDate(n.date)}. We will remind you 30, 7 and 1 days before.`,
      EXPORT_LINE,
    ],
    cta: { label: 'Export or choose a plan', href: SUBSCRIPTION_HREF },
    inApp: `${workspace} is locked. Data is deleted on ${longDate(n.date)}`,
  }
}

function deletion(n: LifecycleNotice, workspace: string): LifecycleMail {
  const when = inDays(n.lifecycle.daysLeft)
  return {
    subject: `${workspace} will be deleted ${when}`,
    title: `${workspace} will be deleted ${when}`,
    paragraphs: [
      `On ${longDate(n.date)} we delete the workspace's data: projects, people, payroll, leads, invoices and files. This cannot be undone.`,
      'To keep it, choose a plan before then. To take a copy, use Export: a ZIP of JSON and CSV files for every module.',
      "Flowbit's own GST invoices to you are kept, as the law requires.",
    ],
    cta: { label: 'Export my data', href: EXPORT_HREF },
    inApp: `${workspace} will be deleted ${when}. Export your data first`,
  }
}

const BY_KIND = { free_ending: freeEnding, trial_ending: trialEnding, read_only: readOnly, blocked, deletion } as const

export function noticeContent(notice: LifecycleNotice, workspace: string, opts: NoticeOptions = {}): LifecycleMail {
  return BY_KIND[notice.kind](notice, workspace, opts)
}

// ---------------------------------------------------------------------------
// Onboarding (Day 1, 3, 7)
// ---------------------------------------------------------------------------

export type OnboardingMail = { subject: string; title: string; paragraphs: string[]; cta: { label: string; href: string } }

const ONBOARDING: Record<OnboardingDay, (workspace: string) => OnboardingMail> = {
  1: (workspace) => ({
    subject: 'Plan your first week in Flowbit Work',
    title: 'Put your first tasks in Work',
    paragraphs: [`Day 1 in ${workspace}: add a project and a few tasks, assign them, and everyone sees what is due today.`, 'It takes two minutes: open Work → Tasks and add one.'],
    cta: { label: 'Add a task', href: '/app/work/tasks' },
  }),
  3: (workspace) => ({
    subject: 'Mark attendance in Muster',
    title: 'Start attendance in Muster',
    paragraphs: [`Day 3 in ${workspace}: add your team in Muster and mark today's attendance. Leave, late marks and payroll days follow from it.`, 'People can mark their own attendance from their phone.'],
    cta: { label: 'Open attendance', href: '/app/hr/attendance' },
  }),
  7: (workspace) => ({
    subject: 'Send your first invoice from Folio',
    title: 'Send your first GST invoice',
    paragraphs: [`Day 7 in ${workspace}: add a client and raise a GST invoice in Folio. Flowbit works out CGST/SGST or IGST and reminds the client when it is due.`, `Questions? Reply to this email or see ${PRICING_URL.replace('/pricing', '')}.`],
    cta: { label: 'Create an invoice', href: '/app/folio/invoices/new' },
  }),
}

export const onboardingContent = (day: OnboardingDay, workspace: string): OnboardingMail => ONBOARDING[day](workspace)

/** An email without a button (the workspace is gone, so there is nothing to open). */
export type PlainMail = { subject: string; title: string; paragraphs: string[] }

const OWN_INVOICES_KEPT = "Flowbit's own invoices to you are kept, as the law requires."

/**
 * The owner deleted the workspace (D4): what goes, when, and how to undo it.
 * `stage` 'deleted' is sent at once, 'reminder' 7 days before the data goes,
 * 'purged' once it has gone.
 */
export function ownerDeletionContent(stage: 'deleted' | 'reminder' | 'purged', workspace: string, purgeAt: Date, supportEmail: string): PlainMail {
  if (stage === 'purged') {
    return {
      subject: `${workspace}: data deleted`,
      title: `${workspace}'s data has been deleted`,
      paragraphs: [`As you asked, we deleted the data of ${workspace}: projects, people, payroll, leads, invoices and files. This cannot be undone.`, OWN_INVOICES_KEPT],
    }
  }
  const restore = `Until then, write to ${supportEmail} from this address if you want it back; after that it cannot be undone.`
  if (stage === 'reminder') {
    return {
      subject: `${workspace} will be deleted on ${longDate(purgeAt)}`,
      title: `${workspace} will be deleted on ${longDate(purgeAt)}`,
      paragraphs: [`You deleted ${workspace}. On ${longDate(purgeAt)} we remove its data: projects, people, payroll, leads, invoices and files.`, restore, OWN_INVOICES_KEPT],
    }
  }
  return {
    subject: `${workspace} was deleted`,
    title: `You deleted ${workspace}`,
    paragraphs: [`${workspace} is closed and nobody can open it. Its data is kept until ${longDate(purgeAt)}, then removed: projects, people, payroll, leads, invoices and files.`, restore, OWN_INVOICES_KEPT],
  }
}
