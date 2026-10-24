import { formatDate } from '@/lib/dates'
import { formatINR } from '@/lib/money'
import type { ReminderTone } from './schedule'

/**
 * Reminder text (folio.md 6.14, port of lib/reminders/compose.ts). Pure:
 * returns paragraphs; the server wraps them with emailLayout for HTML.
 */

export type PayTo = { bankName?: string | null; accountLast4?: string | null; ifsc?: string | null; upiId?: string | null }

export type ReminderInput = {
  tone: ReminderTone
  daysOverdue: number
  invoiceNumber: string
  issueDate: string
  dueDate: string
  balancePaise: number
  recipientName?: string | null
  /** Entity signatory, else the workspace name. */
  sender: string
  /** Entity trade name, else legal name. */
  company: string
  supportEmail?: string | null
  payTo?: PayTo | null
}

export type ComposedEmail = { subject: string; paragraphs: string[]; text: string }

const firstNameOf = (name?: string | null) => (name ?? '').trim().split(/\s+/)[0] ?? ''

function subjectFor(r: ReminderInput, amount: string): string {
  if (r.tone === 'advance_notice') return `${r.company}: invoice ${r.invoiceNumber} due ${formatDate(r.dueDate)}`
  if (r.tone === 'due_today') return `${r.company}: invoice ${r.invoiceNumber} is due today`
  if (r.tone === 'final') return `Final reminder: invoice ${r.invoiceNumber} — ${amount} outstanding`
  return `Reminder: invoice ${r.invoiceNumber} — ${amount} outstanding`
}

function openingFor(r: ReminderInput, amount: string): string {
  const base = `invoice ${r.invoiceNumber} for ${amount}`
  const due = formatDate(r.dueDate)
  switch (r.tone) {
    case 'advance_notice':
      return `A quick note that ${base} falls due on ${due}.`
    case 'due_today':
      return `A quick note that ${base} is due today.`
    case 'polite':
      return `Just checking in: ${base} was due on ${due} and is showing as unpaid on our side.`
    case 'firm':
      return `Our records show ${base} is now ${r.daysOverdue} days past its due date of ${due}.`
    case 'final':
      return `${base.charAt(0).toUpperCase()}${base.slice(1)} is ${r.daysOverdue} days overdue. This is our final reminder before we escalate the account.`
  }
}

const CLOSINGS: Record<ReminderTone, string> = {
  advance_notice: 'No action needed if it is already scheduled — this is just a heads-up.',
  due_today: 'If it is already scheduled for today, please ignore this note.',
  polite: 'If it has been paid in the last day or two, do let us know the reference and we will match it.',
  firm: 'Could you confirm the payment date? If something is holding it up, tell us and we will sort it out.',
  final: 'Please confirm when this will be settled, or let us know who we should be speaking to.',
}

function payToLine(p?: PayTo | null): string | null {
  if (!p || (!p.bankName && !p.upiId)) return null
  const parts = [p.bankName, p.accountLast4 ? `A/c ending ${p.accountLast4}` : null, p.ifsc ? `IFSC ${p.ifsc}` : null, p.upiId ? `UPI ${p.upiId}` : null].filter(Boolean)
  return `Pay to: ${parts.join(' · ')}`
}

export function composeReminderEmail(r: ReminderInput): ComposedEmail {
  const amount = formatINR(r.balancePaise)
  const first = firstNameOf(r.recipientName)
  const paragraphs = [
    first ? `Hi ${first},` : 'Hello,',
    openingFor(r, amount),
    [`Invoice: ${r.invoiceNumber}`, `Dated: ${formatDate(r.issueDate)}`, `Due: ${formatDate(r.dueDate)}`, `Amount outstanding: ${amount}`].join('\n'),
    payToLine(r.payTo),
    CLOSINGS[r.tone],
    ['Thanks,', r.sender, r.company, r.supportEmail].filter(Boolean).join('\n'),
  ].filter((p): p is string => Boolean(p))
  return { subject: subjectFor(r, amount), paragraphs, text: paragraphs.join('\n\n') }
}

export function composeReminderWhatsApp(r: ReminderInput): string {
  const amount = formatINR(r.balancePaise)
  const first = firstNameOf(r.recipientName)
  const hi = first ? `Hi ${first}` : 'Hello'
  if (r.tone === 'advance_notice') return `${hi}, a heads-up from ${r.company}: invoice ${r.invoiceNumber} for ${amount} is due on ${formatDate(r.dueDate)}. — ${r.sender}`
  if (r.tone === 'due_today') return `${hi}, invoice ${r.invoiceNumber} for ${amount} from ${r.company} is due today. — ${r.sender}`
  const ago = r.daysOverdue === 1 ? '1 day ago' : `${r.daysOverdue} days ago`
  return `${hi}, invoice ${r.invoiceNumber} for ${amount} from ${r.company} was due on ${formatDate(r.dueDate)} (${ago}). Could you let us know when it will be settled? — ${r.sender}`
}

/** wa.me link: digits only; 10 digits get India's 91; fewer than 10 → null. */
export function whatsappLink(phone: string | null | undefined, message: string): string | null {
  const digits = (phone ?? '').replace(/\D/g, '')
  if (digits.length < 10) return null
  const full = digits.length === 10 ? `91${digits}` : digits
  return `https://wa.me/${full}?text=${encodeURIComponent(message)}`
}

/** Splits an edited body back into paragraphs (blank-line separated). */
export const paragraphsOf = (body: string): string[] =>
  body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
