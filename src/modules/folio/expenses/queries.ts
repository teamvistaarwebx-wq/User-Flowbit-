import 'server-only'
import { isValidObjectId, Types } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { monthRange, shiftMonth, todayIST } from '@/lib/dates'
import { escapeRegex } from '@/lib/utils'
import { FolioExpense } from '@/models/folio/Expense'
import { FolioExpenseCategory } from '@/models/folio/ExpenseCategory'
import type { Period } from '@/modules/folio/engine/period'
import { entityMatch, listEntities, type EntityInfo, type FolioScope } from '@/modules/folio/queries/common'
import { DEFAULT_EXPENSE_CATEGORIES, inputTaxPaise, netCostPaise } from './rules'

/** Reads for the Expenses area and the P&L. Every query runs through the org-scoped db. */

export type ExpenseCategoryRow = { id: string; name: string; isActive: boolean }

const isDuplicate = (error: unknown) => typeof error === 'object' && error !== null && (error as { code?: number }).code === 11000

/** The org's categories, seeded with the defaults the first time they are read. */
export async function expenseCategories(scope: FolioScope): Promise<ExpenseCategoryRow[]> {
  const read = () => scope.db(FolioExpenseCategory).find({}).sort({ isActive: -1, position: 1, name: 1 }).lean()
  let rows = await read()
  if (!rows.length) {
    try {
      await scope.db(FolioExpenseCategory).insertMany(DEFAULT_EXPENSE_CATEGORIES.map((name, position) => ({ name, position, isActive: true })))
    } catch (error) {
      if (!isDuplicate(error)) throw error
    }
    rows = await read()
  }
  return rows.map((c) => ({ id: String(c._id), name: c.name, isActive: c.isActive !== false }))
}

/** `{ $sum }` of what an expense costs (GST claimable as input tax left out). */
const NET_COST = { $subtract: ['$amountPaise', { $cond: [{ $eq: ['$itcEligible', true] }, { $ifNull: ['$gstPaise', 0] }, 0] }] }
const INPUT_TAX = { $cond: [{ $eq: ['$itcEligible', true] }, { $ifNull: ['$gstPaise', 0] }, 0] }

export type ExpenseFilters = { entityId: string | null; period: Period; categoryId: string | null; q: string | null }

function filterOf(f: ExpenseFilters): Record<string, unknown> {
  const filter: Record<string, unknown> = { ...entityMatch(f.entityId) }
  if (f.period.from && f.period.to) filter.date = { $gte: f.period.from, $lte: f.period.to }
  if (f.categoryId && isValidObjectId(f.categoryId)) filter.categoryId = new Types.ObjectId(f.categoryId)
  if (f.q) {
    const rx = new RegExp(escapeRegex(f.q), 'i')
    filter.$or = [{ vendor: rx }, { description: rx }, { reference: rx }, { notes: rx }]
  }
  return filter
}

export type ExpenseRow = {
  id: string
  date: string
  vendor: string
  description: string | null
  categoryId: string
  categoryName: string
  entityId: string
  entityCode: string
  amountPaise: number
  gstPaise: number
  inputTaxPaise: number
  netPaise: number
  mode: string
  paidFrom: string
  reference: string | null
  repeatMonthly: boolean
  hasReceipt: boolean
}

type ExpenseDoc = Awaited<ReturnType<typeof findExpense>>
const findExpense = (scope: FolioScope, id: unknown) => scope.db(FolioExpense).findById(id).lean()

function toRow(e: NonNullable<ExpenseDoc>, categories: Map<string, string>, codes: Map<string, string>): ExpenseRow {
  return {
    id: String(e._id),
    date: e.date,
    vendor: e.vendor,
    description: e.description ?? null,
    categoryId: String(e.categoryId),
    categoryName: categories.get(String(e.categoryId)) ?? 'Uncategorised',
    entityId: String(e.entityId),
    entityCode: codes.get(String(e.entityId)) ?? '',
    amountPaise: e.amountPaise,
    gstPaise: e.gstPaise ?? 0,
    inputTaxPaise: inputTaxPaise(e),
    netPaise: netCostPaise(e),
    mode: e.mode ?? 'other',
    paidFrom: e.paidFrom ?? 'bank',
    reference: e.reference ?? null,
    repeatMonthly: Boolean(e.repeatMonthly),
    hasReceipt: Boolean(e.receiptFileId),
  }
}

async function lookups(scope: FolioScope) {
  const [categories, entities] = await Promise.all([expenseCategories(scope), listEntities(scope)])
  return { categories, entities, categoryName: new Map(categories.map((c) => [c.id, c.name])), entityCode: new Map(entities.map((e) => [e.id, e.code])) }
}

export async function listExpenses(scope: FolioScope, f: ExpenseFilters, page: { skip: number; limit: number }) {
  const filter = filterOf(f)
  const [docs, total, sums, look] = await Promise.all([
    scope.db(FolioExpense).find(filter).sort({ date: -1, createdAt: -1 }).skip(page.skip).limit(page.limit).lean(),
    scope.db(FolioExpense).countDocuments(filter),
    scope.db(FolioExpense).aggregate<{ amount: number; inputTax: number; net: number }>([{ $match: filter }, { $group: { _id: null, amount: { $sum: '$amountPaise' }, inputTax: { $sum: INPUT_TAX }, net: { $sum: NET_COST } } }]),
    lookups(scope),
  ])
  return {
    rows: docs.map((d) => toRow(d, look.categoryName, look.entityCode)),
    total,
    amountPaise: sums[0]?.amount ?? 0,
    inputTaxPaise: sums[0]?.inputTax ?? 0,
    netPaise: sums[0]?.net ?? 0,
    categories: look.categories,
  }
}

/** Every matching expense, oldest first, for the CSV (capped well above a year of a small firm's spend). */
export async function exportExpenses(scope: FolioScope, f: ExpenseFilters): Promise<ExpenseRow[]> {
  const [docs, look] = await Promise.all([scope.db(FolioExpense).find(filterOf(f)).sort({ date: 1, createdAt: 1 }).limit(10_000).lean(), lookups(scope)])
  return docs.map((d) => toRow(d, look.categoryName, look.entityCode))
}

export type ExpenseDetail = ExpenseRow & {
  entityName: string
  bankLabel: string | null
  bankAccountId: string | null
  vendorGstin: string | null
  itcEligible: boolean
  notes: string | null
  receiptFileId: string | null
  copiedFromId: string | null
  copiedToId: string | null
  repeatDay: number | null
  createdAt: string | null
}

export async function expenseDetail(scope: FolioScope, id: string): Promise<ExpenseDetail | null> {
  if (!isValidObjectId(id)) return null
  const doc = await findExpense(scope, id)
  if (!doc) return null
  const [look, copy] = await Promise.all([lookups(scope), scope.db(FolioExpense).findOne({ copiedFromId: doc._id }, { _id: 1 }).lean()])
  const entity = look.entities.find((e) => e.id === String(doc.entityId))
  const bank = entity?.banks.find((b) => b.id === String(doc.bankAccountId ?? ''))
  return {
    ...toRow(doc, look.categoryName, look.entityCode),
    entityName: entity ? entity.tradeName || entity.legalName : 'Unknown firm',
    bankLabel: bank ? `${bank.label} · ${bank.bankName} ${bank.masked}` : null,
    bankAccountId: doc.bankAccountId ? String(doc.bankAccountId) : null,
    vendorGstin: doc.vendorGstin ?? null,
    itcEligible: Boolean(doc.itcEligible),
    notes: doc.notes ?? null,
    receiptFileId: doc.receiptFileId ? String(doc.receiptFileId) : null,
    copiedFromId: doc.copiedFromId ? String(doc.copiedFromId) : null,
    copiedToId: copy ? String(copy._id) : null,
    repeatDay: doc.repeatDay ?? null,
    createdAt: doc.createdAt ? doc.createdAt.toISOString() : null,
  }
}

export type ExpenseFormOptions = {
  today: string
  entities: Pick<EntityInfo, 'id' | 'code' | 'legalName' | 'tradeName' | 'kind' | 'isDefault' | 'banks'>[]
  categories: ExpenseCategoryRow[]
}

/** Active firms (bank numbers masked) and active categories, plus the record's own if since switched off. */
export async function expenseFormOptions(ctx: Ctx, keep: { entityId?: string; categoryId?: string } = {}): Promise<ExpenseFormOptions> {
  const [entities, categories] = await Promise.all([listEntities(ctx), expenseCategories(ctx)])
  return {
    today: todayIST(),
    entities: entities.filter((e) => e.isActive || e.id === keep.entityId).map(({ id, code, legalName, tradeName, kind, isDefault, banks }) => ({ id, code, legalName, tradeName, kind, isDefault, banks })),
    categories: categories.filter((c) => c.isActive || c.id === keep.categoryId),
  }
}

/** Recurring expenses from the month before `month` not yet copied into it. */
export async function recurringToCopy(scope: FolioScope, month: string, entityId: string | null) {
  const prev = monthRange(shiftMonth(month, -1))
  const sources = await scope.db(FolioExpense).find({ repeatMonthly: true, ...entityMatch(entityId), date: { $gte: prev.start, $lte: prev.end } }).lean()
  if (!sources.length) return []
  const copied = new Set((await scope.db(FolioExpense).find({ copiedFromId: { $in: sources.map((s) => s._id) } }, { copiedFromId: 1 }).lean()).map((c) => String(c.copiedFromId)))
  return sources.filter((s) => !copied.has(String(s._id)))
}

export type ExpenseMonthTotal = { month: string; categoryId: string; netPaise: number }

/** What expenses cost per month and category (GST claimable as input tax left out). */
export async function expenseTotalsByMonth(scope: FolioScope, from: string, to: string, entityId: string | null): Promise<ExpenseMonthTotal[]> {
  const rows = await scope.db(FolioExpense).aggregate<{ _id: { month: string; categoryId: Types.ObjectId }; net: number }>([
    { $match: { ...entityMatch(entityId), date: { $gte: from, $lte: to } } },
    { $group: { _id: { month: { $substrBytes: ['$date', 0, 7] }, categoryId: '$categoryId' }, net: { $sum: NET_COST } } },
  ])
  return rows.map((r) => ({ month: r._id.month, categoryId: String(r._id.categoryId), netPaise: r.net }))
}
