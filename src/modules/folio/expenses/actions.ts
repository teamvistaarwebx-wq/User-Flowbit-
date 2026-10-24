'use server'

import { Types } from 'mongoose'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, fail, ok } from '@/lib/actions'
import { audit } from '@/lib/audit'
import type { Ctx } from '@/lib/ctx'
import { formatDate, formatMonth, shiftMonth, todayIST } from '@/lib/dates'
import { NotFoundError, UserError } from '@/lib/errors'
import { deleteStoredFile, IMAGE_TYPES, saveUpload } from '@/lib/files'
import { formatINR } from '@/lib/money'
import { escapeRegex } from '@/lib/utils'
import { objectId } from '@/lib/validation'
import { FolioExpense } from '@/models/folio/Expense'
import { FolioExpenseCategory } from '@/models/folio/ExpenseCategory'
import { FOLIO, loadEntity } from '../context'
import { recurringToCopy } from './queries'
import { copyForwardDate, repeatDayOf } from './rules'
import { categoryActiveSchema, categorySchema, copyForwardSchema, copyRecurringSchema, expenseSchema, type ExpenseInput } from './schemas'

/** Booking business expenses needs `expenses.write`; categories are Folio settings. */

const W = { ...FOLIO, perm: 'expenses.write' } as const
const S = { ...FOLIO, perm: 'folio.settings' } as const
const BASE = '/app/folio/expenses'
const RECEIPT_TYPES = [...IMAGE_TYPES, 'application/pdf']

const refresh = (id?: string) => {
  revalidatePath(BASE)
  if (id) revalidatePath(`${BASE}/${id}`)
  revalidatePath('/app/folio/pnl')
  revalidatePath('/app/folio')
}

const isDuplicate = (error: unknown) => typeof error === 'object' && error !== null && (error as { code?: number }).code === 11000

const loadExpense = async (ctx: Ctx, id: unknown) => {
  const doc = await ctx.db(FolioExpense).findById(id).lean()
  if (!doc) throw new NotFoundError('That expense')
  return doc
}

/** Checks the firm, category and bank account all belong to this org, then returns the stored fields. */
async function fieldsFor(ctx: Ctx, input: ExpenseInput, isNew: boolean) {
  const entity = await loadEntity(ctx, input.entityId, { active: isNew })
  const category = await ctx.db(FolioExpenseCategory).findById(input.categoryId).lean()
  const refuse = (field: string, message: string) => new UserError('Some fields need attention.', { [field]: message })
  if (!category) throw refuse('categoryId', 'Choose a category')
  if (isNew && !category.isActive) throw refuse('categoryId', `"${category.name}" is archived. Pick another category.`)
  const bankAccountId = input.paidFrom === 'bank' ? (input.bankAccountId ?? null) : null
  if (bankAccountId && !entity.bankAccounts.some((b) => String(b._id) === bankAccountId)) throw refuse('bankAccountId', `That account does not belong to ${entity.code}.`)
  return {
    entity,
    category,
    fields: {
      entityId: entity._id,
      categoryId: category._id,
      date: input.date,
      vendor: input.vendor,
      description: input.description ?? null,
      amountPaise: input.amount ?? 0,
      gstPaise: input.gst ?? 0,
      vendorGstin: input.vendorGstin ?? null,
      itcEligible: input.itcEligible && (input.gst ?? 0) > 0,
      mode: input.mode,
      paidFrom: input.paidFrom,
      bankAccountId,
      reference: input.reference ?? null,
      notes: input.notes ?? null,
      repeatMonthly: input.repeatMonthly,
    },
  }
}

export const saveExpense = action(
  expenseSchema,
  async (input, ctx) => {
    const existing = input.id ? await loadExpense(ctx, input.id) : null
    const { fields, category, entity } = await fieldsFor(ctx, input, !existing)
    const id = existing?._id ?? new Types.ObjectId()
    const receipt = await saveUpload(ctx, input.receipt, { kind: 'expense_receipt', entity: 'FolioExpense', entityId: id, accept: RECEIPT_TYPES })
    const receiptFileId = receipt ? receipt._id : input.removeReceipt ? null : (existing?.receiptFileId ?? null)
    const summary = `${fields.vendor} · ${formatINR(fields.amountPaise)} · ${category.name} · ${entity.code} · ${formatDate(fields.date)}`
    if (existing) {
      await ctx.db(FolioExpense).updateOne({ _id: existing._id }, { $set: { ...fields, receiptFileId, updatedBy: ctx.memberId } })
      const replaced = existing.receiptFileId && String(existing.receiptFileId) !== String(receiptFileId ?? '')
      if (replaced) await deleteStoredFile(ctx.orgId, String(existing.receiptFileId))
      await audit(ctx, { action: 'folio_expense.updated', entity: 'FolioExpense', entityId: existing._id, summary: `Expense updated: ${summary}`, product: 'folio', changes: { before: existing, after: { ...existing, ...fields, receiptFileId } } })
      refresh(String(existing._id))
      return ok('Expense saved', { id: String(existing._id) })
    }
    await ctx.db(FolioExpense).create({ _id: id, ...fields, receiptFileId, createdBy: ctx.memberId })
    await audit(ctx, { action: 'folio_expense.created', entity: 'FolioExpense', entityId: id, summary: `Expense booked: ${summary}`, product: 'folio', meta: { amountPaise: fields.amountPaise } })
    refresh()
    return ok(`Booked ${formatINR(fields.amountPaise)} to ${category.name}`, { id: String(id) }, `${BASE}/${id}`)
  },
  W,
)

export const deleteExpense = action(
  z.object({ id: objectId }),
  async ({ id }, ctx) => {
    const doc = await loadExpense(ctx, id)
    await ctx.db(FolioExpense).deleteOne({ _id: doc._id })
    if (doc.receiptFileId) await deleteStoredFile(ctx.orgId, String(doc.receiptFileId))
    await audit(ctx, { action: 'folio_expense.deleted', entity: 'FolioExpense', entityId: doc._id, summary: `Expense deleted: ${doc.vendor} · ${formatINR(doc.amountPaise)} · ${formatDate(doc.date)}`, product: 'folio', changes: { before: doc, after: null } })
    refresh()
    return ok('Expense deleted', undefined, BASE)
  },
  W,
)

/** A copy of one expense, dated on its repeat day next month but never after today (no receipt; the new bill gets its own). */
function copyOf(doc: Awaited<ReturnType<typeof loadExpense>>, ctx: Ctx, date: string) {
  return {
    entityId: doc.entityId,
    categoryId: doc.categoryId,
    date,
    repeatDay: repeatDayOf(doc),
    vendor: doc.vendor,
    description: doc.description,
    amountPaise: doc.amountPaise,
    gstPaise: doc.gstPaise ?? 0,
    vendorGstin: doc.vendorGstin,
    itcEligible: Boolean(doc.itcEligible),
    mode: doc.mode,
    paidFrom: doc.paidFrom,
    bankAccountId: doc.bankAccountId ?? null,
    repeatMonthly: Boolean(doc.repeatMonthly),
    copiedFromId: doc._id,
    createdBy: ctx.memberId,
  }
}

export const copyExpenseForward = action(
  copyForwardSchema,
  async ({ id }, ctx) => {
    const doc = await loadExpense(ctx, id)
    const date = copyForwardDate(doc, todayIST())
    if (!date) return fail(`${formatMonth(shiftMonth(doc.date.slice(0, 7), 1))} has not started yet. Copy this expense once it does.`)
    const copy = copyOf(doc, ctx, date)
    try {
      const created = await ctx.db(FolioExpense).create(copy)
      await audit(ctx, { action: 'folio_expense.copied', entity: 'FolioExpense', entityId: created._id, summary: `Expense copied forward: ${doc.vendor} · ${formatINR(doc.amountPaise)} to ${formatDate(copy.date)}`, product: 'folio', meta: { from: String(doc._id) } })
      refresh()
      return ok(`Copied to ${formatDate(copy.date)}. Check the amount against the new bill.`, { id: String(created._id) }, `${BASE}/${created._id}`)
    } catch (error) {
      if (isDuplicate(error)) return fail(`This expense was already copied to ${formatMonth(copy.date.slice(0, 7))}.`)
      throw error
    }
  },
  W,
)

export const copyRecurringForward = action(
  copyRecurringSchema,
  async ({ month, entityId }, ctx) => {
    if (month > todayIST().slice(0, 7)) return fail(`${formatMonth(month)} has not started yet. Copy its recurring expenses once it does.`)
    const sources = await recurringToCopy(ctx, month, entityId ?? null)
    if (!sources.length) return ok(`Nothing to copy. Every recurring expense from ${formatMonth(shiftMonth(month, -1))} is already in ${formatMonth(month)}.`)
    let created = 0
    for (const doc of sources) {
      try {
        await ctx.db(FolioExpense).create(copyOf(doc, ctx, copyForwardDate(doc, todayIST()) ?? todayIST()))
        created += 1
      } catch (error) {
        if (!isDuplicate(error)) throw error
      }
    }
    const total = sources.reduce((s, d) => s + d.amountPaise, 0)
    await audit(ctx, { action: 'folio_expense.recurring_copied', entity: 'FolioExpense', summary: `${created} recurring expenses copied into ${formatMonth(month)} (${formatINR(total)})`, product: 'folio', meta: { month, count: created } })
    refresh()
    return ok(`${created} recurring ${created === 1 ? 'expense' : 'expenses'} copied into ${formatMonth(month)}. Check each against its bill.`)
  },
  W,
)

export const saveExpenseCategory = action(
  categorySchema,
  async ({ id, name }, ctx) => {
    const clash = await ctx.db(FolioExpenseCategory).findOne({ name: new RegExp(`^${escapeRegex(name)}$`, 'i'), ...(id ? { _id: { $ne: id } } : {}) }, { _id: 1 }).lean()
    if (clash) return fail('Some fields need attention.', { name: 'A category with this name already exists.' })
    if (id) {
      const before = await ctx.db(FolioExpenseCategory).findOneAndUpdate({ _id: id }, { $set: { name } }, { returnDocument: 'before' }).lean()
      if (!before) return fail('That category was not found. It may have been removed.')
      await audit(ctx, { action: 'folio_expense_category.renamed', entity: 'FolioExpenseCategory', entityId: id, summary: `Expense category "${before.name}" renamed to "${name}"`, product: 'folio' })
    } else {
      const position = await ctx.db(FolioExpenseCategory).countDocuments({})
      const created = await ctx.db(FolioExpenseCategory).create({ name, position, isActive: true })
      await audit(ctx, { action: 'folio_expense_category.created', entity: 'FolioExpenseCategory', entityId: created._id, summary: `Expense category "${name}" added`, product: 'folio' })
    }
    revalidatePath('/app/folio/settings')
    revalidatePath(BASE)
    return ok(id ? 'Category renamed. Past expenses show the new name.' : `"${name}" added`)
  },
  S,
)

export const setExpenseCategoryActive = action(
  categoryActiveSchema,
  async ({ id, active }, ctx) => {
    const cat = await ctx.db(FolioExpenseCategory).findOneAndUpdate({ _id: id }, { $set: { isActive: active } }).lean()
    if (!cat) return fail('That category was not found. It may have been removed.')
    await audit(ctx, { action: active ? 'folio_expense_category.restored' : 'folio_expense_category.archived', entity: 'FolioExpenseCategory', entityId: id, summary: `Expense category "${cat.name}" ${active ? 'restored' : 'archived'}`, product: 'folio' })
    revalidatePath('/app/folio/settings')
    revalidatePath(BASE)
    return ok(active ? `"${cat.name}" is back in the picker` : `"${cat.name}" archived. Past expenses keep it.`)
  },
  S,
)
