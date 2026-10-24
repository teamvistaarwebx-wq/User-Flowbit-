import { z } from 'zod'
import { todayIST } from '@/lib/dates'
import { checkbox, isoDate, isoMonth, objectId, optionalText, paise, requiredText } from '@/lib/validation'
import { isValidGstin } from '../engine/gst'
import { EXPENSE_MODES, PAID_FROM, expenseAmountIssue } from './rules'

/** Zod schemas for expense forms. Amounts arrive in rupees and leave as paise. */

const blank = (v: unknown) => (v === '' || v === null ? undefined : v)
const optionalId = z.preprocess(blank, objectId.optional())
const upper = (v: unknown) => (typeof v === 'string' ? v.trim().toUpperCase() : v)

export const expenseSchema = z
  .object({
    id: optionalId,
    entityId: objectId,
    categoryId: z.string({ error: 'Choose a category' }).pipe(objectId),
    date: z.string({ error: 'Enter the date it was paid' }).pipe(isoDate),
    vendor: requiredText('Vendor', 120),
    description: optionalText(300),
    amount: paise.optional(),
    gst: paise.optional(),
    vendorGstin: z.preprocess((v) => blank(upper(v)), z.string().refine(isValidGstin, 'That is not a valid GSTIN. It should be 15 characters, like 27AABCA1234B1Z9.').optional()),
    itcEligible: checkbox,
    mode: z.enum(EXPENSE_MODES, { error: 'Choose how it was paid' }),
    paidFrom: z.enum(PAID_FROM, { error: 'Choose bank or cash' }),
    bankAccountId: optionalId,
    reference: optionalText(80),
    notes: optionalText(2000),
    repeatMonthly: checkbox,
    receipt: z.instanceof(File).optional(),
    removeReceipt: checkbox,
  })
  .superRefine((v, ctx) => {
    const issue = expenseAmountIssue({ amountPaise: v.amount ?? 0, gstPaise: v.gst ?? 0 })
    if (issue) ctx.addIssue({ code: 'custom', path: [issue.startsWith('Enter') ? 'amount' : 'gst'], message: issue })
    // A blank GST with "claim" ticked (the default in a GST firm) books a no-GST expense: there is nothing to claim, so the tick is dropped when saving.
    if (v.date > todayIST()) ctx.addIssue({ code: 'custom', path: ['date'], message: 'Use today or an earlier date' })
  })

export type ExpenseInput = z.output<typeof expenseSchema>

export const copyForwardSchema = z.object({ id: objectId })

/** Copy last month's recurring expenses into `month` (one firm, or all when blank). */
export const copyRecurringSchema = z.object({ month: isoMonth, entityId: optionalId })

export const categorySchema = z.object({ id: optionalId, name: requiredText('Name', 60) })
export const categoryActiveSchema = z.object({ id: objectId, active: z.boolean() })
