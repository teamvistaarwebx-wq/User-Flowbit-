import { firstName } from '@/lib/utils'
import type { CustomerTemplateKey } from './customer-templates'

/**
 * Team alerts on WhatsApp B (pure): which approved template an in-app alert
 * becomes, and its values. The rules that never bend:
 *   - payslips: only "your payslip is ready" (payslip_ready), never an
 *     amount, never the PDF; the title and body are not used at all;
 *   - any other payroll event: a generic "payroll update" line, no figures;
 *   - security and Flowbit-account notices never go from a workspace number.
 * Everything else uses the alert's own title.
 */

export type AlertLike = Readonly<{ event?: string | null; title: string; href?: string | null; action?: Readonly<{ kind: string }> | null }>

export type AlertTemplate = Readonly<{ key: CustomerTemplateKey; values: Record<string, string>; buttonValue: string }>

const NEVER = ['security.', 'subscription.', 'platform.']
const MAX_LINE = 200

/** A one-line value WhatsApp accepts (no new lines; trimmed to 200 characters). */
const line = (text: string): string => {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > MAX_LINE ? `${flat.slice(0, MAX_LINE - 1)}…` : flat
}

/** The URL button suffix for an in-app link ('/app/work/tasks/1' → 'app/work/tasks/1'); Flowbit's home when none. */
export const hrefSuffix = (href: string | null | undefined): string => (href && href.startsWith('/') && !href.startsWith('//') ? href.slice(1) : 'app')

export function alertTemplateFor(alert: AlertLike, who: { name: string; business: string }): AlertTemplate | null {
  const event = alert.event ?? ''
  if (!event || NEVER.some((prefix) => event.startsWith(prefix))) return null
  const name = firstName(who.name || 'there')
  if (event === 'payroll.payslip_published') return { key: 'payslip_ready', values: { name, business: who.business }, buttonValue: 'app/me/payslips' }
  if (event === 'letter.issued') return null
  // Greetings are marketing: only the approved marketing greeting template, never a utility one.
  if (event.startsWith('greetings.')) return { key: 'greeting', values: { name, wish: line(alert.title) }, buttonValue: 'app' }
  if (event.startsWith('payroll.')) return { key: 'task_alert', values: { name, update: 'there is a payroll update waiting for you in Flowbit.' }, buttonValue: hrefSuffix(alert.href) }
  const title = line(alert.title)
  const buttonValue = hrefSuffix(alert.href)
  if (event.startsWith('meeting.')) return { key: 'meeting_reminder', values: { name, meeting: title }, buttonValue }
  if (event.startsWith('leave.') && /approved|rejected/.test(event)) return { key: 'leave_decision', values: { name, decision: title }, buttonValue }
  if (/\.(requested|submitted|correction_requested|compoff_requested|bank_changed|change_requested)$/.test(event)) return { key: 'approval_pending', values: { name, item: title }, buttonValue }
  // Task alerts that can be acted on carry Mark done / Snooze 1 day.
  if (alert.action?.kind === 'task') return { key: 'task_due', values: { name, task: title }, buttonValue }
  return { key: 'task_alert', values: { name, update: title }, buttonValue }
}
