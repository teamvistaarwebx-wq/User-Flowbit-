import { paiseToRupees } from '@/lib/money'
import type { ExpenseDetail, ExpenseFormOptions } from '@/modules/folio/expenses/queries'
import type { ExpenseMode, PaidFrom } from '@/modules/folio/expenses/rules'

/** Form values for the expense form (plain module, so server pages can build them). */

export type ExpenseFormValues = {
  id?: string
  entityId: string
  categoryId: string
  date: string
  vendor: string
  description: string
  /** Rupees as typed. */
  amount: string
  gst: string
  vendorGstin: string
  itcEligible: boolean
  mode: ExpenseMode
  paidFrom: PaidFrom
  bankAccountId: string
  reference: string
  notes: string
  repeatMonthly: boolean
  receiptFileId: string | null
}

export const emptyExpense = (options: ExpenseFormOptions, entityId?: string): ExpenseFormValues => {
  const entity = options.entities.find((e) => e.id === entityId) ?? options.entities.find((e) => e.isDefault) ?? options.entities[0]
  return {
    entityId: entity?.id ?? '',
    categoryId: '',
    date: options.today,
    vendor: '',
    description: '',
    amount: '',
    gst: '',
    vendorGstin: '',
    itcEligible: entity?.kind === 'gst',
    mode: 'bank_transfer',
    paidFrom: 'bank',
    bankAccountId: (entity?.banks.find((b) => b.isDefault) ?? entity?.banks[0])?.id ?? '',
    reference: '',
    notes: '',
    repeatMonthly: false,
    receiptFileId: null,
  }
}

const rupees = (paise: number) => (paise ? String(paiseToRupees(paise)) : '')

export const expenseValues = (e: ExpenseDetail): ExpenseFormValues => ({
  id: e.id,
  entityId: e.entityId,
  categoryId: e.categoryId,
  date: e.date,
  vendor: e.vendor,
  description: e.description ?? '',
  amount: rupees(e.amountPaise),
  gst: rupees(e.gstPaise),
  vendorGstin: e.vendorGstin ?? '',
  itcEligible: e.itcEligible,
  mode: e.mode as ExpenseMode,
  paidFrom: e.paidFrom as PaidFrom,
  bankAccountId: e.bankAccountId ?? '',
  reference: e.reference ?? '',
  notes: e.notes ?? '',
  repeatMonthly: e.repeatMonthly,
  receiptFileId: e.receiptFileId,
})
