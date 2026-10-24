import 'server-only'
import Papa from 'papaparse'
import { randomUUID } from 'node:crypto'
import { Types } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { todayIST } from '@/lib/dates'
import { NotFoundError, UserError } from '@/lib/errors'
import { formatINR } from '@/lib/money'
import { readXlsx } from '@/lib/xlsx-read'
import { Client } from '@/models/Client'
import { BankStatement } from '@/models/folio/BankStatement'
import { BankTxn } from '@/models/folio/BankTxn'
import { DocEvent } from '@/models/folio/DocEvent'
import { FolioExpense } from '@/models/folio/Expense'
import { FolioExpenseCategory } from '@/models/folio/ExpenseCategory'
import { Invoice } from '@/models/folio/Invoice'
import { clientLabel, loadEntity } from '@/modules/folio/context'
import { closeReceipt, recordReceipt } from '@/modules/folio/receipts/service'
import { undoRefusal, undoUntilFrom } from '@/modules/imports/batch'
import { modeOf, payeeOf } from './categorise'
import { extractUtrs, suggestMatches, type OpenInvoice } from './match'
import { parseStatement, type ParsedStatement } from './parse'
import type { BankPreset, ColumnMap } from './presets'

/**
 * Folio → Bank (server): read a statement, import its new rows, match
 * credits to open invoices through the Folio receipt code, book debits as
 * expenses, and undo a whole statement.
 */

export const MAX_STATEMENT_BYTES = 3 * 1024 * 1024

/** The file's rows as text, CSV or XLSX. Errors are sentences for the person importing. */
export function readStatementRows(fileName: string, bytes: Buffer): string[][] | { error: string } {
  if (!bytes.length) return { error: 'The file is empty.' }
  if (bytes.length > MAX_STATEMENT_BYTES) return { error: 'That file is larger than 3 MB. Download one month at a time.' }
  const name = fileName.toLowerCase()
  if (name.endsWith('.xlsx')) {
    try {
      return readXlsx(bytes)
    } catch (error) {
      console.warn('[bank] unreadable xlsx', error)
      return { error: 'That Excel file could not be read. Save it as .xlsx or .csv and try again.' }
    }
  }
  if (name.endsWith('.xls')) return { error: 'Old .xls files cannot be read. Open it in Excel and save it as .xlsx or .csv.' }
  if (name.endsWith('.csv') || name.endsWith('.txt')) {
    const parsed = Papa.parse<string[]>(bytes.toString('utf8').replace(/^﻿/, ''), { skipEmptyLines: 'greedy' })
    return parsed.data.map((row) => row.map((c) => (c ?? '').trim()))
  }
  return { error: 'Upload the statement as .csv or .xlsx.' }
}

export type StatementInput = { fileName: string; bytes: Buffer; entityId: string; preset: BankPreset; map: ColumnMap | null }

export type StatementPreview = ParsedStatement & { duplicateHashes: string[] }

/** Parses the file and marks rows already imported (by row hash). Writes nothing. */
export async function previewStatement(ctx: Pick<Ctx, 'db' | 'orgId'>, input: StatementInput): Promise<StatementPreview | { error: string }> {
  await loadEntity(ctx, input.entityId)
  const rows = readStatementRows(input.fileName, input.bytes)
  if ('error' in rows) return rows
  const parsed = parseStatement(rows, input.entityId, { preset: input.preset, map: input.map })
  if ('error' in parsed) return parsed
  const existing = await ctx.db(BankTxn).find({ rowHash: { $in: parsed.txns.map((t) => t.rowHash) } }, { rowHash: 1 }).lean()
  return { ...parsed, duplicateHashes: existing.map((e) => e.rowHash) }
}

const isDuplicateKey = (error: unknown) => typeof error === 'object' && error !== null && (error as { code?: number }).code === 11000

/** Imports the new rows as one statement. Rows already in (same hash) are skipped, even under a race. */
export async function importStatement(ctx: Pick<Ctx, 'db' | 'orgId' | 'memberId' | 'user'>, input: StatementInput & { bankAccountId?: string | null }) {
  const entity = await loadEntity(ctx, input.entityId, { active: true })
  if (input.bankAccountId && !(entity.bankAccounts ?? []).some((b) => String(b._id) === input.bankAccountId)) throw new UserError(`That bank account does not belong to ${entity.code}.`, { bankAccountId: 'Pick one of this entity’s accounts' })
  const preview = await previewStatement(ctx, input)
  if ('error' in preview) throw new UserError(preview.error)
  const known = new Set(preview.duplicateHashes)
  const fresh = preview.txns.filter((t) => !known.has(t.rowHash))
  const dates = preview.txns.map((t) => t.date).sort()
  const now = new Date()
  const statement = await ctx.db(BankStatement).create({
    entityId: entity._id,
    bankAccountId: input.bankAccountId || null,
    preset: preview.preset,
    fileName: input.fileName.slice(0, 200),
    fromDate: dates[0],
    toDate: dates[dates.length - 1],
    rows: preview.txns.length,
    undoUntil: undoUntilFrom(now),
    createdBy: ctx.memberId,
    createdByName: ctx.user.name,
  })
  let imported = 0
  let credits = 0
  for (const t of fresh) {
    try {
      await ctx.db(BankTxn).create({ statementId: statement._id, entityId: entity._id, bankAccountId: input.bankAccountId || null, line: t.line, date: t.date, narration: t.narration, reference: t.reference, direction: t.direction, amountPaise: t.amountPaise, balancePaise: t.balancePaise, rowHash: t.rowHash })
      imported += 1
      if (t.direction === 'credit') credits += 1
    } catch (error) {
      if (!isDuplicateKey(error)) throw error
    }
  }
  const duplicates = preview.txns.length - imported
  await ctx.db(BankStatement).updateOne({ _id: statement._id }, { $set: { imported, duplicates, credits, debits: imported - credits } })
  return { id: String(statement._id), imported, duplicates, credits, debits: imported - credits, preset: preview.preset }
}

/** Open (issued or part-paid) invoices of one entity with what matching needs. */
export async function openInvoicesFor(ctx: Pick<Ctx, 'db'>, entityId: Types.ObjectId | string): Promise<OpenInvoice[]> {
  const invoices = await ctx.db(Invoice).find({ entityId, status: { $in: ['issued', 'part_paid'] }, balancePaise: { $gt: 0 } }, { number: 1, clientId: 1, entityId: 1, balancePaise: 1, taxablePaise: 1, issueDate: 1, dueDate: 1 }).sort({ dueDate: 1 }).limit(1000).lean()
  if (!invoices.length) return []
  const [clients, events] = await Promise.all([
    ctx.db(Client).find({ _id: { $in: [...new Set(invoices.map((i) => String(i.clientId)))] } }, { name: 1, displayName: 1 }).lean(),
    ctx.db(DocEvent).find({ kind: 'invoice', docId: { $in: invoices.map((i) => i._id) }, utr: { $nin: [null, ''] } }, { docId: 1, utr: 1 }).lean(),
  ])
  const clientName = new Map(clients.map((c) => [String(c._id), clientLabel(c)]))
  const utrs = new Map<string, string[]>()
  for (const e of events) utrs.set(String(e.docId), [...(utrs.get(String(e.docId)) ?? []), e.utr ?? ''])
  return invoices.map((i) => ({
    id: String(i._id),
    number: i.number ?? '',
    clientId: String(i.clientId),
    clientName: clientName.get(String(i.clientId)) ?? '',
    entityId: String(i.entityId),
    balancePaise: i.balancePaise ?? 0,
    subtotalPaise: i.taxablePaise ?? 0,
    issueDate: i.issueDate,
    dueDate: i.dueDate,
    utrs: utrs.get(String(i._id)) ?? [],
  }))
}

type TxnDoc = NonNullable<Awaited<ReturnType<typeof loadTxn>>>
const loadTxn = (ctx: Pick<Ctx, 'db'>, id: string) => ctx.db(BankTxn).findById(id).lean()

/** A claim (a row in `matching`) older than this belongs to a request that crashed or timed out, and is released. */
export const STALE_CLAIM_MS = 5 * 60_000

const staleBefore = (now: Date) => new Date(now.getTime() - STALE_CLAIM_MS)

/** Rows in `matching` whose claim went stale (or predates claim times). */
const staleMatching = (now: Date) => ({ status: 'matching', $or: [{ claimedAt: null }, { claimedAt: { $lt: staleBefore(now) } }] })

type Claimed = TxnDoc & { claimToken: string }

/**
 * Claims an unmatched row (or one whose claim went stale) for one resolution,
 * so two clicks cannot make two receipts. The statement must not be being
 * undone: the row is claimed first and the statement checked after, so an
 * undo that starts in between sees the claim and waits.
 */
async function claim(ctx: Pick<Ctx, 'db'>, id: string, direction: 'credit' | 'debit', now: Date = new Date()): Promise<Claimed> {
  const claimToken = randomUUID()
  const txn = await ctx.db(BankTxn).findOneAndUpdate(
    { _id: id, direction, $or: [{ status: 'unmatched' }, staleMatching(now)] },
    { $set: { status: 'matching', claimToken, claimedAt: now } },
    { returnDocument: 'after' },
  ).lean()
  if (!txn) {
    const current = await loadTxn(ctx, id)
    if (!current) throw new NotFoundError('That bank row')
    throw new UserError(current.status === 'matching' ? 'That row is being matched right now.' : `That row is already ${current.status === 'ignored' ? 'ignored' : current.status === 'expense' ? 'booked as an expense' : 'matched'}.`)
  }
  const statement = await ctx.db(BankStatement).findById(txn.statementId, { status: 1 }).lean()
  if (!statement || statement.status !== 'done') {
    await release(ctx, txn._id, claimToken)
    throw new UserError('This statement is being undone, so its rows cannot be matched.')
  }
  return { ...txn, claimToken }
}

/** Gives the row back to the queue, only while this claim still holds it. */
const release = (ctx: Pick<Ctx, 'db'>, id: Types.ObjectId, claimToken: string) =>
  ctx.db(BankTxn).updateOne({ _id: id, status: 'matching', claimToken }, { $set: { status: 'unmatched', claimToken: null, claimedAt: null } })

/** Settles a claimed row; false when the claim was lost meanwhile (taken over as stale, or the row was undone). */
const settle = async (ctx: Pick<Ctx, 'db'>, txn: Claimed, set: Record<string, unknown>): Promise<boolean> => {
  const res = await ctx.db(BankTxn).updateOne({ _id: txn._id, status: 'matching', claimToken: txn.claimToken }, { $set: { ...set, claimToken: null, claimedAt: null } })
  return res.modifiedCount === 1
}

const LOST_CLAIM = 'That bank row changed while it was being matched (it was undone or taken over). Nothing was booked; reload and try again.'

/** Puts rows stuck in `matching` (a crash or timeout mid-match) back in the queue. */
export async function releaseStuckRows(ctx: Pick<Ctx, 'db'>, now: Date = new Date()): Promise<number> {
  const res = await ctx.db(BankTxn).updateMany(staleMatching(now), { $set: { status: 'unmatched', claimToken: null, claimedAt: null } })
  return res.modifiedCount ?? 0
}

export type ConfirmMatchInput = { txnId: string; invoiceId: string; amountPaise: number; tdsPaise: number; score: number | null }

export type SplitAllocation = { invoiceId: string; amountPaise: number; tdsPaise: number }
export type ConfirmSplitInput = { txnId: string; allocations: SplitAllocation[]; score: number | null }

/** Most invoices one deposit may be split across. */
export const MAX_SPLIT = 20

/**
 * The person confirmed a credit → invoice: records a receipt (mode bank
 * transfer, UTR as the reference) with that allocation through the Folio
 * receipt service; anything above the allocation stays as advance credit.
 */
export async function confirmMatch(ctx: Ctx, input: ConfirmMatchInput) {
  const result = await confirmSplit(ctx, { txnId: input.txnId, allocations: [{ invoiceId: input.invoiceId, amountPaise: input.amountPaise, tdsPaise: input.tdsPaise }], score: input.score })
  return { receipt: result.receipt, invoiceNumber: result.invoiceNumbers[0] ?? '', clientId: result.clientId, txn: result.txn, allocatedPaise: result.allocations[0]?.amountPaise ?? 0 }
}

/**
 * One deposit across several invoices of one client: a single receipt with
 * an allocation per invoice (amount and TDS each). The allocations may not
 * add up to more than the deposit; what is left stays as advance credit.
 */
export async function confirmSplit(ctx: Ctx, input: ConfirmSplitInput) {
  const wanted = input.allocations.filter((a) => a.amountPaise + a.tdsPaise > 0)
  if (!wanted.length) throw new UserError('Allocate the deposit to at least one invoice.')
  if (wanted.length > MAX_SPLIT) throw new UserError(`Split a deposit across at most ${MAX_SPLIT} invoices.`)
  if (new Set(wanted.map((a) => a.invoiceId)).size !== wanted.length) throw new UserError('Each invoice can appear once in a split.')
  const txn = await claim(ctx, input.txnId, 'credit')
  try {
    const invoices = await ctx.db(Invoice).find({ _id: { $in: wanted.map((a) => a.invoiceId) } }, { clientId: 1, entityId: 1, number: 1 }).lean()
    const byId = new Map(invoices.map((i) => [String(i._id), i]))
    const missing = wanted.find((a) => !byId.has(a.invoiceId))
    if (missing) throw new NotFoundError('That invoice')
    const first = byId.get(wanted[0].invoiceId)!
    if (invoices.some((i) => String(i.entityId) !== String(txn.entityId))) throw new UserError('That invoice is billed by another entity than this bank account’s.')
    if (invoices.some((i) => String(i.clientId) !== String(first.clientId))) throw new UserError('A split can only cover invoices of one client. Record the rest separately.')
    const allocations = wanted.map((a) => ({ invoiceId: a.invoiceId, amountPaise: Math.max(0, a.amountPaise), tdsPaise: Math.max(0, a.tdsPaise) }))
    const allocated = allocations.reduce((sum, a) => sum + a.amountPaise, 0)
    if (allocated > txn.amountPaise) throw new UserError(`The allocations add up to ${formatINR(allocated)}, more than the deposit of ${formatINR(txn.amountPaise)}.`)
    const reference = (extractUtrs(`${txn.reference} ${txn.narration}`)[0] ?? txn.reference ?? '').slice(0, 80) || undefined
    const receipt = await recordReceipt(ctx, {
      clientId: String(first.clientId),
      entityId: String(txn.entityId),
      receivedOn: txn.date > todayIST() ? todayIST() : txn.date,
      amountPaise: txn.amountPaise,
      mode: 'bank_transfer',
      reference,
      bankAccountId: txn.bankAccountId ? String(txn.bankAccountId) : undefined,
      notes: `From the bank statement: ${txn.narration}`.slice(0, 1000),
      allocations,
    })
    const invoiceIds = allocations.map((a) => byId.get(a.invoiceId)!._id)
    if (!(await settle(ctx, txn, { status: 'matched', receiptId: new Types.ObjectId(receipt.id), invoiceId: invoiceIds[0], invoiceIds, matchScore: input.score, resolvedAt: new Date(), resolvedBy: ctx.memberId }))) {
      await closeReceipt(ctx, receipt.id, { status: 'cancelled', reason: 'The bank row changed while it was being matched' })
      throw new UserError(LOST_CLAIM)
    }
    return { receipt, invoiceNumbers: allocations.map((a) => byId.get(a.invoiceId)?.number ?? ''), clientId: String(first.clientId), txn, allocations }
  } catch (error) {
    await release(ctx, txn._id, txn.claimToken)
    throw error
  }
}

export type ExpenseFromTxnInput = { txnId: string; categoryId: string; vendor?: string }

/** Books a debit as an expense (paid from the bank, mode read from the narration). */
export async function expenseFromTxn(ctx: Ctx, input: ExpenseFromTxnInput) {
  const txn = await claim(ctx, input.txnId, 'debit')
  try {
    const category = await ctx.db(FolioExpenseCategory).findById(input.categoryId).lean()
    if (!category || !category.isActive) throw new UserError('Choose an active expense category.', { categoryId: 'Choose a category' })
    const expense = await ctx.db(FolioExpense).create({
      entityId: txn.entityId,
      categoryId: category._id,
      date: txn.date,
      vendor: (input.vendor?.trim() || payeeOf(txn.narration)).slice(0, 120),
      description: txn.narration.slice(0, 300),
      amountPaise: txn.amountPaise,
      mode: modeOf(txn.narration),
      paidFrom: 'bank',
      bankAccountId: txn.bankAccountId ?? null,
      reference: (txn.reference || extractUtrs(txn.narration)[0] || '').slice(0, 80) || null,
      createdBy: ctx.memberId,
    })
    if (!(await settle(ctx, txn, { status: 'expense', expenseId: expense._id, resolvedAt: new Date(), resolvedBy: ctx.memberId }))) {
      await ctx.db(FolioExpense).deleteOne({ _id: expense._id })
      throw new UserError(LOST_CLAIM)
    }
    return { expenseId: String(expense._id), category: category.name, txn }
  } catch (error) {
    await release(ctx, txn._id, txn.claimToken)
    throw error
  }
}

/** Ignore (an own-account transfer) or bring an ignored row back to the queue. */
export async function setIgnored(ctx: Pick<Ctx, 'db' | 'memberId'>, txnId: string, ignored: boolean): Promise<void> {
  const res = await ctx.db(BankTxn).updateOne({ _id: txnId, status: ignored ? 'unmatched' : 'ignored' }, ignored ? { $set: { status: 'ignored', resolvedAt: new Date(), resolvedBy: ctx.memberId } } : { $set: { status: 'unmatched' }, $unset: { resolvedAt: 1, resolvedBy: 1 } })
  if (!res.modifiedCount) throw new UserError(ignored ? 'Only rows still waiting can be ignored.' : 'That row is not ignored.')
}

/**
 * Undoes a statement within 7 days: receipts its matches made are cancelled
 * (the invoices are owed again), its expenses deleted and its rows removed.
 */
export async function undoStatement(ctx: Ctx, statementId: string, now: Date = new Date()) {
  const statement = await ctx.db(BankStatement).findById(statementId).lean()
  if (!statement) throw new NotFoundError('That statement')
  const refusal = undoRefusal(statement, now)
  if (refusal) throw new UserError(refusal)
  // Take the statement first: from here on no row of it can be claimed.
  const taken = await ctx.db(BankStatement).updateOne(
    { _id: statement._id, $or: [{ status: 'done' }, { status: 'undoing', undoStartedAt: { $lt: staleBefore(now) } }] },
    { $set: { status: 'undoing', undoStartedAt: now } },
  )
  if (!taken.modifiedCount) throw new UserError('This statement is being undone right now.')
  const giveBack = () => ctx.db(BankStatement).updateOne({ _id: statement._id, status: 'undoing' }, { $set: { status: 'done' }, $unset: { undoStartedAt: 1 } })
  const busy = await ctx.db(BankTxn).exists({ statementId: statement._id, status: 'matching', claimedAt: { $gte: staleBefore(now) } })
  if (busy) {
    await giveBack()
    throw new UserError('A row of this statement is being matched right now. Try again in a moment.')
  }
  const txns = await ctx.db(BankTxn).find({ statementId: statement._id }, { status: 1, receiptId: 1, expenseId: 1 }).lean()
  // Undo deletes the expenses this statement booked: that needs the expense permission, not only receipts.
  if (txns.some((t) => t.status === 'expense' && t.expenseId) && !ctx.can('expenses.write')) {
    await giveBack()
    throw new UserError('This statement booked expenses. Undoing it deletes them, which needs permission to edit expenses. Ask someone who manages expenses.')
  }
  let receipts = 0
  for (const t of txns.filter((x) => x.status === 'matched' && x.receiptId)) {
    try {
      await closeReceipt(ctx, String(t.receiptId), { status: 'cancelled', reason: 'Bank statement import undone' })
      receipts += 1
    } catch (error) {
      // A receipt someone already cancelled or bounced by hand stays as it is.
      if (!(error instanceof UserError)) throw error
    }
  }
  const expenseIds = txns.flatMap((t) => (t.status === 'expense' && t.expenseId ? [t.expenseId] : []))
  const expenses = expenseIds.length ? (await ctx.db(FolioExpense).deleteMany({ _id: { $in: expenseIds } })).deletedCount ?? 0 : 0
  await ctx.db(BankTxn).deleteMany({ statementId: statement._id })
  await ctx.db(BankStatement).updateOne({ _id: statement._id, status: 'undoing' }, { $set: { status: 'undone', undoneAt: new Date(), undoneBy: ctx.memberId } })
  return { rows: txns.length, receipts, expenses }
}

export { suggestMatches }
