'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, fail, ok, type ActionResult } from '@/lib/actions'
import { audit } from '@/lib/audit'
import { formatINR } from '@/lib/money'
import { objectId, paiseInt } from '@/lib/validation'
import { emitPaymentReceived } from '@/modules/automations/folio-events'
import { cancelStaleLinks } from '@/modules/payments/link-service'
import { BANK_PRESETS, MAP_FIELDS, type ColumnMap } from './presets'
import { mapFromPicks } from './parse'
import { confirmMatch, confirmSplit, MAX_SPLIT, expenseFromTxn, importStatement, previewStatement, setIgnored, undoStatement } from './service'

/** Folio → Bank: statement import, matching credits to invoices, debits to expenses, undo. */

const W = { product: 'folio', perm: 'receipts.write' } as const
const E = { product: 'folio', perm: 'expenses.write' } as const
const BASE = '/app/folio/bank'
const PREVIEW_ROWS = 25

const refresh = () => {
  for (const path of [BASE, '/app/folio', '/app/folio/receipts', '/app/folio/invoices', '/app/folio/expenses', '/app/folio/pnl']) revalidatePath(path)
}

const fileSchema = z.object({
  file: z.instanceof(File, { error: 'Choose the statement file' }),
  entityId: objectId,
  preset: z.enum(BANK_PRESETS).default('auto'),
  bankAccountId: z.string().optional(),
  ...Object.fromEntries(MAP_FIELDS.map((f) => [`map_${f}`, z.string().max(200).optional()])),
})

type FileInput = z.output<typeof fileSchema>

/** The person's column picks for "Other bank" (by header text), else null (the preset maps). */
function picksOf(input: FileInput, headers: readonly string[] | null): ColumnMap | null {
  const record = input as Record<string, unknown>
  const picks = Object.fromEntries(MAP_FIELDS.flatMap((f) => (typeof record[`map_${f}`] === 'string' ? [[f, record[`map_${f}`] as string]] : [])))
  return Object.keys(picks).length && headers ? mapFromPicks(headers, picks) : null
}

async function statementInput(input: FileInput, headers: readonly string[] | null = null) {
  return { fileName: input.file.name, bytes: Buffer.from(await input.file.arrayBuffer()), entityId: input.entityId, preset: input.preset, map: picksOf(input, headers) }
}

export type PreviewRow = { line: number; date: string; narration: string; direction: 'credit' | 'debit'; amountPaise: number; duplicate: boolean }
export type PreviewResult = { preset: string; headers: string[]; mapping: Record<string, string>; total: number; fresh: number; duplicates: number; skipped: number; credits: number; debits: number; rows: PreviewRow[] }

/** Reads the file and shows what would be imported (duplicates marked). Writes nothing. */
export const previewStatementAction = action(
  fileSchema,
  async (input, ctx): Promise<ActionResult<PreviewResult>> => {
    // The first read finds the header row; the column picks (if any) are then applied by header text.
    const first = await previewStatement(ctx, await statementInput(input))
    const headers = 'error' in first ? null : first.headers
    const preview = picksOf(input, headers) ? await previewStatement(ctx, await statementInput(input, headers)) : first
    if ('error' in preview) return fail(preview.error)
    const dupes = new Set(preview.duplicateHashes)
    const fresh = preview.txns.filter((t) => !dupes.has(t.rowHash))
    const mapping = Object.fromEntries(MAP_FIELDS.map((f) => [f, preview.map[f] >= 0 ? (preview.headers[preview.map[f]] ?? '') : '']))
    return ok(undefined, {
      preset: preview.preset,
      headers: preview.headers.filter(Boolean),
      mapping,
      total: preview.txns.length,
      fresh: fresh.length,
      duplicates: preview.txns.length - fresh.length,
      skipped: preview.skipped,
      credits: fresh.filter((t) => t.direction === 'credit').length,
      debits: fresh.filter((t) => t.direction === 'debit').length,
      rows: preview.txns.slice(0, PREVIEW_ROWS).map((t) => ({ line: t.line, date: t.date, narration: t.narration, direction: t.direction, amountPaise: t.amountPaise, duplicate: dupes.has(t.rowHash) })),
    })
  },
  W,
)

export const importStatementAction = action(
  fileSchema,
  async (input, ctx) => {
    const first = await previewStatement(ctx, await statementInput(input))
    const headers = 'error' in first ? null : first.headers
    const result = await importStatement(ctx, { ...(await statementInput(input, headers)), bankAccountId: input.bankAccountId || null })
    await audit(ctx, { action: 'bank_statement.imported', entity: 'BankStatement', entityId: result.id, product: 'folio', summary: `Imported a bank statement (${input.file.name}): ${result.imported} rows, ${result.duplicates} already in`, meta: { preset: result.preset, credits: result.credits, debits: result.debits } })
    refresh()
    const dupes = result.duplicates ? ` ${result.duplicates} already imported were skipped.` : ''
    return ok(`${result.imported} rows imported: ${result.credits} money in, ${result.debits} money out.${dupes}`)
  },
  W,
)

export const confirmMatchAction = action(
  z.object({ txnId: objectId, invoiceId: objectId, amountPaise: paiseInt, tdsPaise: paiseInt.default(0), score: z.number().int().min(0).max(100).nullable().default(null) }),
  async (input, ctx) => {
    const result = await confirmMatch(ctx, input)
    await cancelStaleLinks(ctx, [input.invoiceId])
    await audit(ctx, { action: 'receipt.recorded', entity: 'FolioReceipt', entityId: result.receipt.id, product: 'folio', summary: `Recorded ${result.receipt.number} from the bank statement: ${formatINR(result.txn.amountPaise)} matched to ${result.invoiceNumber}`, meta: { bankTxnId: input.txnId, score: input.score, tdsPaise: input.tdsPaise } })
    await emitPaymentReceived(ctx.orgId, { receiptId: result.receipt.id, receiptNumber: result.receipt.number, clientId: result.clientId, receivedOn: result.txn.date, allocations: [{ invoiceId: input.invoiceId, amountPaise: result.allocatedPaise }] })
    refresh()
    const advance = result.receipt.unallocatedPaise > 0 ? ` ${formatINR(result.receipt.unallocatedPaise)} is held as advance credit.` : ''
    return ok(`${result.receipt.number} recorded against ${result.invoiceNumber}.${advance}`)
  },
  W,
)

/** One deposit across several invoices of one client (the manual split, or an accepted split suggestion). */
export const confirmSplitAction = action(
  z.object({
    txnId: objectId,
    allocations: z.array(z.object({ invoiceId: objectId, amountPaise: paiseInt, tdsPaise: paiseInt.default(0) })).min(1, 'Allocate the deposit to at least one invoice').max(MAX_SPLIT),
    score: z.number().int().min(0).max(100).nullable().default(null),
  }),
  async (input, ctx) => {
    const result = await confirmSplit(ctx, input)
    await cancelStaleLinks(ctx, result.allocations.map((a) => a.invoiceId))
    const numbers = result.invoiceNumbers.join(', ')
    await audit(ctx, { action: 'receipt.recorded', entity: 'FolioReceipt', entityId: result.receipt.id, product: 'folio', summary: `Recorded ${result.receipt.number} from the bank statement: ${formatINR(result.txn.amountPaise)} split across ${numbers}`, meta: { bankTxnId: input.txnId, invoices: result.allocations.length } })
    await emitPaymentReceived(ctx.orgId, { receiptId: result.receipt.id, receiptNumber: result.receipt.number, clientId: result.clientId, receivedOn: result.txn.date, allocations: result.allocations.map((a) => ({ invoiceId: a.invoiceId, amountPaise: a.amountPaise })) })
    refresh()
    const advance = result.receipt.unallocatedPaise > 0 ? ` ${formatINR(result.receipt.unallocatedPaise)} is held as advance credit.` : ''
    return ok(`${result.receipt.number} recorded across ${result.allocations.length} invoices (${numbers}).${advance}`)
  },
  W,
)

export const expenseFromTxnAction = action(
  z.object({ txnId: objectId, categoryId: objectId, vendor: z.string().trim().max(120).optional() }),
  async (input, ctx) => {
    const result = await expenseFromTxn(ctx, input)
    await audit(ctx, { action: 'folio_expense.created', entity: 'FolioExpense', entityId: result.expenseId, product: 'folio', summary: `Expense from the bank statement: ${formatINR(result.txn.amountPaise)} · ${result.category}` })
    refresh()
    return ok(`Booked as ${result.category}.`)
  },
  E,
)

export const ignoreTxnAction = action(
  z.object({ txnId: objectId, ignored: z.boolean() }),
  async (input, ctx) => {
    await setIgnored(ctx, input.txnId, input.ignored)
    revalidatePath(BASE)
    return ok(input.ignored ? 'Ignored. It stays out of the queue.' : 'Back in the queue.')
  },
  W,
)

export const undoStatementAction = action(
  z.object({ statementId: objectId }),
  async ({ statementId }, ctx) => {
    const result = await undoStatement(ctx, statementId)
    await audit(ctx, { action: 'bank_statement.undone', entity: 'BankStatement', entityId: statementId, product: 'folio', summary: `Undid a bank statement import: ${result.rows} rows removed, ${result.receipts} receipts cancelled, ${result.expenses} expenses deleted` })
    refresh()
    return ok(`Undone: ${result.rows} rows removed, ${result.receipts} receipts cancelled, ${result.expenses} expenses deleted.`)
  },
  W,
)
