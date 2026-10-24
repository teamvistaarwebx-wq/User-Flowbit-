import 'server-only'
import type { Ctx } from '@/lib/ctx'
import { BankStatement } from '@/models/folio/BankStatement'
import { BankTxn } from '@/models/folio/BankTxn'
import { FolioExpenseCategory } from '@/models/folio/ExpenseCategory'
import { undoRefusal } from '@/modules/imports/batch'
import { payeeOf, suggestCategory, type CategoryOption } from './categorise'
import { suggestSplits, type MatchSuggestion, type SplitSuggestion } from './match'
import { openInvoicesFor, releaseStuckRows, suggestMatches } from './service'

/** The reconciliation page's data: statements, the queue with suggestions, recent decisions. */

const QUEUE_LIMIT = 100
const RECENT_LIMIT = 20

export type StatementRow = { id: string; fileName: string; entityId: string; range: string; imported: number; duplicates: number; by: string; at: Date; status: 'done' | 'undone'; canUndo: boolean }
export type CreditRow = { id: string; entityId: string; date: string; narration: string; reference: string; amountPaise: number; suggestions: MatchSuggestion[]; splits: SplitSuggestion[] }
export type DebitRow = { id: string; entityId: string; date: string; narration: string; amountPaise: number; payee: string; categoryId: string | null }
export type ResolvedRow = { id: string; date: string; narration: string; direction: 'credit' | 'debit'; amountPaise: number; status: string; receiptId: string | null; expenseId: string | null }
export type InvoiceOption = { id: string; entityId: string; clientId: string; clientName: string; number: string; dueDate: string; label: string; balancePaise: number }

export async function bankQueue(ctx: Pick<Ctx, 'db'>, entityId: string | null) {
  const scope = entityId ? { entityId } : {}
  await releaseStuckRows(ctx).catch((error: unknown) => console.error('[bank] releasing stuck rows failed', error))
  const [statements, waiting, resolved, categories] = await Promise.all([
    ctx.db(BankStatement).find(scope).sort({ createdAt: -1 }).limit(15).lean(),
    ctx.db(BankTxn).find({ ...scope, status: 'unmatched' }).sort({ date: -1 }).limit(QUEUE_LIMIT * 2).lean(),
    ctx.db(BankTxn).find({ ...scope, status: { $in: ['matched', 'expense', 'ignored'] } }).sort({ resolvedAt: -1 }).limit(RECENT_LIMIT).lean(),
    ctx.db(FolioExpenseCategory).find({ isActive: true }, { name: 1 }).sort({ position: 1 }).lean(),
  ])
  const entityIds = [...new Set(waiting.filter((t) => t.direction === 'credit').map((t) => String(t.entityId)))]
  const invoicesByEntity = new Map(await Promise.all(entityIds.map(async (id) => [id, await openInvoicesFor(ctx, id)] as const)))
  const categoryOptions: CategoryOption[] = categories.map((c) => ({ id: String(c._id), name: c.name }))

  const credits: CreditRow[] = waiting
    .filter((t) => t.direction === 'credit')
    .slice(0, QUEUE_LIMIT)
    .map((t) => ({
      id: String(t._id),
      entityId: String(t.entityId),
      date: t.date,
      narration: t.narration,
      reference: t.reference,
      amountPaise: t.amountPaise,
      suggestions: suggestMatches({ date: t.date, amountPaise: t.amountPaise, narration: t.narration, reference: t.reference }, invoicesByEntity.get(String(t.entityId)) ?? []),
      splits: suggestSplits({ date: t.date, amountPaise: t.amountPaise, narration: t.narration, reference: t.reference }, invoicesByEntity.get(String(t.entityId)) ?? []),
    }))
  const debits: DebitRow[] = waiting
    .filter((t) => t.direction === 'debit')
    .slice(0, QUEUE_LIMIT)
    .map((t) => ({ id: String(t._id), entityId: String(t.entityId), date: t.date, narration: t.narration, amountPaise: t.amountPaise, payee: payeeOf(t.narration), categoryId: suggestCategory(t.narration, categoryOptions)?.id ?? null }))
  const invoices: InvoiceOption[] = [...invoicesByEntity.values()].flat().map((i) => ({ id: i.id, entityId: i.entityId, clientId: i.clientId, clientName: i.clientName, number: i.number, dueDate: i.dueDate, label: `${i.number} · ${i.clientName}`, balancePaise: i.balancePaise }))

  return {
    statements: statements.map((s): StatementRow => ({
      id: String(s._id),
      fileName: s.fileName,
      entityId: String(s.entityId),
      range: s.fromDate && s.toDate ? `${s.fromDate} – ${s.toDate}` : '',
      imported: s.imported,
      duplicates: s.duplicates,
      by: s.createdByName,
      at: s.createdAt,
      status: s.status === 'undone' ? 'undone' : 'done',
      canUndo: undoRefusal(s) === null,
    })),
    credits,
    debits,
    resolved: resolved.map((t): ResolvedRow => ({ id: String(t._id), date: t.date, narration: t.narration, direction: t.direction, amountPaise: t.amountPaise, status: t.status, receiptId: t.receiptId ? String(t.receiptId) : null, expenseId: t.expenseId ? String(t.expenseId) : null })),
    invoices,
    categories: categoryOptions,
    waitingTotal: waiting.length,
  }
}
