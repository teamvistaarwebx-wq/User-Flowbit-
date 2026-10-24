import { FREE_MONTHS, FREE_SEAT_LIMIT } from '@/lib/account-types'
import { PLAN_PRICES, TRIAL_DAYS } from '@/lib/plans'
import { DEFAULT_FIRST_YEAR_DISCOUNT_PERCENT, MAX_FIRST_YEAR_DISCOUNT_PERCENT } from '@/lib/first-year-discount'
import { DEFAULT_WA_RATES, DEFAULT_WA_TEMPLATES, mergeWaRates, mergeWaTemplates, type WaRates, type WaTemplateRegistry } from '@/modules/whatsapp/templates'
import { DEFAULT_WALLET_SETTINGS, mergeWalletSettings, type WalletSettings } from '@/modules/wallet/rules'
import { DEFAULT_PLATFORM_FEATURES, mergePlatformFeatures, type PlatformFeatures } from '@/lib/feature-flags'
import { DEFAULT_AI_CAPS, mergeAiCaps, type AiCaps } from '@/lib/ai-caps'
import { DEFAULT_MEETING_CAPS, mergeMeetingCaps, type MeetingCaps } from '@/lib/meeting-caps'
import { HANDOVER_STEPS, type HandoverStep } from './handover'
import { DEFAULT_TAX_RULES, mergeTaxRules, type TaxRules } from '@/modules/muster/tax/rules'

/**
 * Console settings (console spec 7.2 "Staff and Settings"): prices, limits,
 * message templates and help links that staff edit without a code change.
 * Stored in the single ConsoleSettings document. Pure.
 *
 * The product reads them through modules/console/settings-query (once per
 * request): prices and limits as lib/plan-config (quotes, checkouts, new
 * bills, entitlements' Free seats, trial and Free length, the Sales trial
 * extension and the weekly setup cap), the templates as the opening line of
 * the matching emails, the help links on the Setup guide, and the WhatsApp
 * rate card and wallet settings. Missing or bad values fall back to the
 * lib/plans defaults.
 */

export const TEMPLATE_KEYS = ['trialEnding', 'freeEnding', 'paymentDue', 'welcome'] as const
export type TemplateKey = (typeof TEMPLATE_KEYS)[number]
export const TEMPLATE_LABEL: Record<TemplateKey, string> = { trialEnding: 'Trial ending', freeEnding: 'Free plan ending', paymentDue: 'Payment due', welcome: 'Welcome' }

export type ConsoleSettingsValues = {
  /** Rupees, ex-GST, per month (the shape of lib/plans PLAN_PRICES). */
  prices: Record<string, number>
  /** `yearlyDiscountPercent`: percent off a workspace's first yearly invoice (0–90; 0 switches it off). */
  limits: { freeSeats: number; freeMonths: number; trialDays: number; salesExtensionDays: number; setupsPerWeek: number; yearlyDiscountPercent: number }
  templates: Record<TemplateKey, string>
  /** Help video links per Setup guide step; '#' until the videos are published. */
  helpLinks: Record<HandoverStep, string>
  /** WhatsApp A templates (approved in Interakt by the owner) and the cost per message, rupees ex-GST. */
  whatsapp: { templates: WaTemplateRegistry; rates: WaRates }
  /** WhatsApp B wallet: Flowbit's price per message (paise), the BYO platform fee, free messages per plan, the low-balance alert. */
  wallet: WalletSettings
  /** Platform feature switches (lib/feature-flags); each also needs its env switch on. */
  features: PlatformFeatures
  /** Arc AI requests a month per workspace, by account type (lib/ai-caps). */
  ai: { caps: AiCaps }
  /** Meetings AI transcription hours a month (lib/meeting-caps): Free, Trial, paid per seat. */
  meetings: { caps: MeetingCaps }
  /** Salary TDS slabs, rebates, surcharge, cess and deduction caps (modules/muster/tax/rules), edited when a Finance Act changes them. */
  tax: TaxRules
}

/** PLAN_PRICES as "plan key: rupees per unit per month". */
const flatPrices = (): Record<string, number> => Object.fromEntries(Object.values(PLAN_PRICES).map((p) => [p.key, p.monthlyPaise / 100]))

export function defaultConsoleSettings(): ConsoleSettingsValues {
  return {
    prices: flatPrices(),
    limits: { freeSeats: FREE_SEAT_LIMIT, freeMonths: FREE_MONTHS, trialDays: TRIAL_DAYS, salesExtensionDays: 15, setupsPerWeek: 5, yearlyDiscountPercent: DEFAULT_FIRST_YEAR_DISCOUNT_PERCENT },
    templates: {
      trialEnding: 'Your Flowbit trial ends in {days} days. Choose a plan to keep everything running.',
      freeEnding: 'Your free months of Flowbit end on {date}. Pick a plan to keep going.',
      paymentDue: 'Your Flowbit invoice {number} for {amount} is due on {date}.',
      welcome: 'Welcome to Flowbit, {name}. Your setup guide is on Home.',
    },
    helpLinks: Object.fromEntries(HANDOVER_STEPS.map((s) => [s, '#'])) as Record<HandoverStep, string>,
    whatsapp: { templates: DEFAULT_WA_TEMPLATES, rates: DEFAULT_WA_RATES },
    wallet: DEFAULT_WALLET_SETTINGS,
    features: DEFAULT_PLATFORM_FEATURES,
    ai: { caps: DEFAULT_AI_CAPS },
    meetings: { caps: DEFAULT_MEETING_CAPS },
    tax: DEFAULT_TAX_RULES,
  }
}

/**
 * A template with its {placeholders} filled. Unknown placeholders stay as
 * typed, so a typo shows in the email instead of vanishing.
 */
export function fillTemplate(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match))
}

/** Upper bounds for limits that have one (others only need to be whole and not negative). */
const LIMIT_MAX: Partial<Record<keyof ConsoleSettingsValues['limits'], number>> = { yearlyDiscountPercent: MAX_FIRST_YEAR_DISCOUNT_PERCENT }

const isSafeHref = (value: string) => value === '#' || /^https:\/\/[^\s]+$/i.test(value) || /^\/[^\s/][^\s]*$/.test(value)

/** Stored values merged over the defaults; unknown keys dropped, bad values replaced by the default. */
export function mergeConsoleSettings(stored: Partial<ConsoleSettingsValues> | null | undefined): ConsoleSettingsValues {
  const base = defaultConsoleSettings()
  if (!stored) return base
  const prices = Object.fromEntries(Object.entries(base.prices).map(([k, v]) => [k, Number.isFinite(stored.prices?.[k]) && (stored.prices?.[k] ?? -1) >= 0 ? Number(stored.prices?.[k]) : v]))
  const limits = Object.fromEntries(Object.entries(base.limits).map(([k, v]) => {
    const got = (stored.limits as Record<string, unknown> | undefined)?.[k]
    const max = LIMIT_MAX[k as keyof ConsoleSettingsValues['limits']] ?? Number.MAX_SAFE_INTEGER
    return [k, typeof got === 'number' && Number.isInteger(got) && got >= 0 && got <= max ? got : v]
  })) as ConsoleSettingsValues['limits']
  const templates = Object.fromEntries(TEMPLATE_KEYS.map((k) => [k, typeof stored.templates?.[k] === 'string' && stored.templates[k].trim() ? stored.templates[k].trim() : base.templates[k]])) as ConsoleSettingsValues['templates']
  const helpLinks = Object.fromEntries(HANDOVER_STEPS.map((k) => [k, typeof stored.helpLinks?.[k] === 'string' && isSafeHref(stored.helpLinks[k]) ? stored.helpLinks[k] : base.helpLinks[k]])) as ConsoleSettingsValues['helpLinks']
  const whatsapp = { templates: mergeWaTemplates(stored.whatsapp?.templates), rates: mergeWaRates(stored.whatsapp?.rates) }
  return { prices, limits, templates, helpLinks, whatsapp, wallet: mergeWalletSettings(stored.wallet), features: mergePlatformFeatures(stored.features), ai: { caps: mergeAiCaps(stored.ai?.caps) }, meetings: { caps: mergeMeetingCaps(stored.meetings?.caps) }, tax: mergeTaxRules(stored.tax) }
}

export { isSafeHref }
