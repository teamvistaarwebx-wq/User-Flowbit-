/**
 * Auto-match a bank credit to open invoices (pure). Each open invoice is
 * scored on the amount (the balance, or the balance less 2% or 10% TDS on the
 * taxable value), the narration (invoice number, a UTR the client shared on
 * the invoice link, the client's name) and how close the date is to the due
 * date. The person confirms; nothing is recorded from a score alone.
 */

import { formatINR } from '@/lib/money'

export type OpenInvoice = Readonly<{
  id: string
  number: string
  clientId: string
  clientName: string
  entityId: string
  balancePaise: number
  /** Taxable value (before GST): what TDS is worked out on. */
  subtotalPaise: number
  issueDate: string
  dueDate: string
  /** UTRs the client shared through "I've paid" on the invoice link. */
  utrs: readonly string[]
}>

export type BankCredit = Readonly<{ date: string; amountPaise: number; narration: string; reference: string }>

export type Confidence = 'high' | 'medium' | 'low'

export type MatchSuggestion = Readonly<{
  invoiceId: string
  number: string
  clientId: string
  clientName: string
  balancePaise: number
  score: number
  confidence: Confidence
  reasons: string[]
  /** What the receipt would allocate to the invoice, and the TDS it would record. */
  amountPaise: number
  tdsPaise: number
}>

export const TDS_RATES = [2, 10] as const
const RUPEE = 100
const DAY_MS = 86_400_000
const MIN_SCORE = 25

const STOPWORDS = new Set(['pvt', 'private', 'ltd', 'limited', 'llp', 'india', 'the', 'and', 'co', 'company', 'services', 'solutions', 'technologies', 'tech', 'enterprises', 'opc', 'inc'])

const alnum = (text: string) => text.toUpperCase().replace(/[^A-Z0-9]/g, '')
const words = (text: string) => text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY_MS)

export const confidenceOf = (score: number): Confidence => (score >= 75 ? 'high' : score >= 45 ? 'medium' : 'low')

type Part = { points: number; reason?: string; amountPaise?: number; tdsPaise?: number }

function amountPart(credit: BankCredit, inv: OpenInvoice): Part {
  const amount = credit.amountPaise
  const short = inv.balancePaise - amount
  if (short <= 0 && -short <= RUPEE) return { points: 50, reason: 'Amount matches the balance', amountPaise: inv.balancePaise, tdsPaise: 0 }
  // Up to a rupee short: still the likely invoice, but it stays part-paid, so say so (write off the paise on the invoice if they are not coming).
  if (short > 0 && short <= RUPEE) return { points: 48, reason: `${formatINR(short)} short of the balance; that stays open`, amountPaise: amount, tdsPaise: 0 }
  for (const rate of TDS_RATES) {
    const tds = Math.min(inv.balancePaise, Math.round((inv.subtotalPaise * rate) / 100))
    const tolerance = Math.max(RUPEE, Math.round(inv.balancePaise * 0.002))
    if (tds > 0 && Math.abs(amount + tds - inv.balancePaise) <= tolerance) {
      // TDS takes up the rounding, so the invoice closes; a few rupees over the net stay as advance.
      const allocated = Math.min(amount, inv.balancePaise - tds)
      return { points: 42, reason: `Balance less ${rate}% TDS`, amountPaise: allocated, tdsPaise: amount <= inv.balancePaise - tds ? inv.balancePaise - amount : tds }
    }
  }
  if (amount > inv.balancePaise) return { points: 5, reason: 'More than the balance; the rest stays as advance', amountPaise: inv.balancePaise, tdsPaise: 0 }
  return { points: 5, reason: 'Part payment', amountPaise: amount, tdsPaise: 0 }
}

function narrationPart(credit: BankCredit, inv: OpenInvoice): Part[] {
  const text = `${credit.narration} ${credit.reference}`
  const compact = alnum(text)
  const parts: Part[] = []
  const number = alnum(inv.number)
  if (number.length >= 4 && compact.includes(number)) parts.push({ points: 35, reason: `${inv.number} in the narration` })
  const utr = inv.utrs.map(alnum).find((u) => u.length >= 6 && compact.includes(u))
  if (utr) parts.push({ points: 45, reason: 'UTR the client shared on the invoice link' })
  const tokens = words(inv.clientName).filter((w) => w.length >= 3 && !STOPWORDS.has(w))
  if (tokens.length) {
    const said = new Set(words(text))
    const found = tokens.filter((w) => said.has(w) || (w.length >= 5 && compact.includes(w.toUpperCase())))
    if (found.length === tokens.length) parts.push({ points: 25, reason: `${inv.clientName} in the narration` })
    else if (found.length * 2 >= tokens.length) parts.push({ points: 15, reason: `Part of ${inv.clientName} in the narration` })
  }
  return parts
}

function datePart(credit: BankCredit, inv: OpenInvoice): Part {
  if (credit.date < inv.issueDate) return { points: -30, reason: 'Received before the invoice date' }
  const fromDue = Math.abs(daysBetween(credit.date, inv.dueDate))
  if (fromDue <= 7) return { points: 10, reason: 'Close to the due date' }
  if (fromDue <= 30) return { points: 5 }
  return daysBetween(credit.date, inv.dueDate) > 120 ? { points: -5 } : { points: 0 }
}

/** Scores one invoice for a credit. */
export function scoreInvoice(credit: BankCredit, inv: OpenInvoice): MatchSuggestion {
  const amount = amountPart(credit, inv)
  const parts = [amount, ...narrationPart(credit, inv), datePart(credit, inv)]
  const score = Math.max(0, Math.min(100, parts.reduce((sum, p) => sum + p.points, 0)))
  return {
    invoiceId: inv.id,
    number: inv.number,
    clientId: inv.clientId,
    clientName: inv.clientName,
    balancePaise: inv.balancePaise,
    score,
    confidence: confidenceOf(score),
    reasons: parts.flatMap((p) => (p.reason ? [p.reason] : [])),
    amountPaise: amount.amountPaise ?? 0,
    tdsPaise: amount.tdsPaise ?? 0,
  }
}

/** The best invoices for a credit (score 25 and up), best first; ties go to the oldest due date. */
export function suggestMatches(credit: BankCredit, invoices: readonly OpenInvoice[], limit = 3): MatchSuggestion[] {
  const due = new Map(invoices.map((i) => [i.id, i.dueDate]))
  return invoices
    .filter((inv) => inv.balancePaise > 0)
    .map((inv) => scoreInvoice(credit, inv))
    .filter((s) => s.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score || (due.get(a.invoiceId) ?? '').localeCompare(due.get(b.invoiceId) ?? ''))
    .slice(0, limit)
}

/** UTR-looking tokens in a narration: 12-digit UPI/IMPS references and NEFT/RTGS UTRs (bank code + digits). */
export function extractUtrs(text: string): string[] {
  const found = text.toUpperCase().match(/\b(?:[A-Z]{4}[A-Z0-9]\d{6,17}|\d{12,22})\b/g) ?? []
  return [...new Set(found)]
}

/** A deposit that pays several invoices of one client at once. */
export type SplitSuggestion = Readonly<{
  clientId: string
  clientName: string
  invoices: ReadonlyArray<Readonly<{ invoiceId: string; number: string; amountPaise: number }>>
  totalPaise: number
  /** The client's name appears in the narration. */
  named: boolean
}>

/** Splits look at most this many invoices at once, and this many open invoices per client (oldest due first). */
export const MAX_SPLIT_INVOICES = 4
const MAX_SPLIT_CANDIDATES = 12

function combinations<T>(items: readonly T[], size: number, start = 0, picked: T[] = [], out: T[][] = []): T[][] {
  if (picked.length === size) {
    out.push([...picked])
    return out
  }
  for (let i = start; i <= items.length - (size - picked.length); i += 1) combinations(items, size, i + 1, [...picked, items[i]], out)
  return out
}

/**
 * Each invoice's balance, except that a deposit up to a rupee short of the
 * total takes the shortfall off the last (newest due) invoice, so the
 * allocations never add up to more than the deposit (the server refuses that).
 */
function withinDeposit(combo: readonly OpenInvoice[], depositPaise: number): SplitSuggestion['invoices'] {
  const over = Math.max(0, combo.reduce((sum, i) => sum + i.balancePaise, 0) - depositPaise)
  const last = combo.length - 1
  return combo.map((i, index) => ({ invoiceId: i.id, number: i.number, amountPaise: index === last ? i.balancePaise - over : i.balancePaise }))
}

/**
 * When a credit equals the sum of two to four open balances of one client
 * (within a rupee), suggests paying exactly those invoices from it. Fewer
 * invoices first, a client named in the narration first, then the oldest due
 * dates. Pure; the person still confirms.
 */
export function suggestSplits(credit: BankCredit, invoices: readonly OpenInvoice[], limit = 2): SplitSuggestion[] {
  const text = `${credit.narration} ${credit.reference}`
  const said = new Set(words(text))
  const byClient = new Map<string, OpenInvoice[]>()
  for (const inv of invoices) {
    if (inv.balancePaise <= 0 || credit.date < inv.issueDate) continue
    byClient.set(inv.clientId, [...(byClient.get(inv.clientId) ?? []), inv])
  }
  const found: Array<{ split: SplitSuggestion; oldest: string }> = []
  for (const [clientId, list] of byClient) {
    const candidates = [...list].sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, MAX_SPLIT_CANDIDATES)
    const tokens = words(candidates[0]?.clientName ?? '').filter((w) => w.length >= 3 && !STOPWORDS.has(w))
    const named = tokens.length > 0 && tokens.every((w) => said.has(w))
    for (let size = 2; size <= Math.min(MAX_SPLIT_INVOICES, candidates.length); size += 1) {
      for (const combo of combinations(candidates, size)) {
        const total = combo.reduce((sum, i) => sum + i.balancePaise, 0)
        if (Math.abs(total - credit.amountPaise) > RUPEE) continue
        found.push({
          split: { clientId, clientName: combo[0].clientName, invoices: withinDeposit(combo, credit.amountPaise), totalPaise: Math.min(total, credit.amountPaise), named },
          oldest: combo.map((i) => i.dueDate).sort()[0] ?? '',
        })
      }
    }
  }
  return found
    .sort((a, b) => a.split.invoices.length - b.split.invoices.length || Number(b.split.named) - Number(a.split.named) || a.oldest.localeCompare(b.oldest))
    .slice(0, limit)
    .map((f) => f.split)
}
