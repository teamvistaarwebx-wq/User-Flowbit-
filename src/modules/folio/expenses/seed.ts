import type { Types } from 'mongoose'
import { monthOf, shiftMonth, todayIST } from '@/lib/dates'
import type { SeedCtx } from '@/lib/seed-types'
import { FolioEntity } from '@/models/folio/Entity'
import { FolioExpense } from '@/models/folio/Expense'
import { FolioExpenseCategory } from '@/models/folio/ExpenseCategory'
import { DEFAULT_EXPENSE_CATEGORIES, type ExpenseMode, type PaidFrom } from './rules'

/**
 * Demo expenses for the last four months plus this month's rent, for both
 * firms: VWX (GST-registered, claims input tax) and VSL (not registered, so
 * GST it pays is a cost). Salaries are left to Muster payroll so the P&L does
 * not count them twice. September's recurring bills are not copied into
 * October except VWX's rent, so "Copy recurring forward" has work to do.
 * Idempotent: does nothing when the org already has expenses.
 */

type Item = { firm: 'VWX' | 'VSL'; day: number; category: string; vendor: string; description?: string; base: number; gstRate?: number; itc?: boolean; mode: ExpenseMode; cash?: boolean; repeat?: boolean; reference?: string; vary?: number[] }

const r = (rupees: number) => Math.round(rupees * 100)

const MONTHLY: Item[] = [
  { firm: 'VWX', day: 1, category: 'Rent', vendor: 'Malhotra Estates', description: 'Office rent, 4th floor, Vijay Nagar', base: 65_000, gstRate: 18, itc: true, mode: 'bank_transfer', repeat: true },
  { firm: 'VWX', day: 3, category: 'Software & subscriptions', vendor: 'Google Workspace', description: 'Business Standard, 18 seats', base: 15_120, gstRate: 18, itc: true, mode: 'card', repeat: true },
  { firm: 'VWX', day: 4, category: 'Software & subscriptions', vendor: 'Figma', description: 'Professional plan, 6 editors (billed in USD, no GST charged)', base: 6_480, mode: 'card', repeat: true },
  { firm: 'VWX', day: 7, category: 'Office & utilities', vendor: 'MPPKVVCL', description: 'Electricity', base: 7_400, mode: 'upi', vary: [6_900, 8_150, 7_820, 7_310] },
  { firm: 'VWX', day: 8, category: 'Office & utilities', vendor: 'Airtel Business', description: 'Leased line 200 Mbps', base: 4_999, gstRate: 18, itc: true, mode: 'auto_debit', repeat: true },
  { firm: 'VWX', day: 10, category: 'Marketing', vendor: 'Meta Platforms', description: 'Vistaar brand ads (Instagram, Facebook)', base: 25_000, gstRate: 18, itc: true, mode: 'card', vary: [18_000, 25_000, 32_000, 22_500] },
  { firm: 'VWX', day: 12, category: 'Creator/freelancer payments', vendor: 'Ritika Sen', description: 'Freelance motion design for client reels', base: 18_000, mode: 'upi', vary: [12_000, 18_000, 24_000, 15_000] },
  { firm: 'VWX', day: 15, category: 'Professional fees', vendor: 'Jain & Associates, CA', description: 'Monthly accounting and GST filing', base: 12_000, gstRate: 18, itc: true, mode: 'bank_transfer', repeat: true },
  { firm: 'VWX', day: 28, category: 'Bank charges', vendor: 'HDFC Bank', description: 'Account charges and NEFT fees', base: 500, gstRate: 18, itc: true, mode: 'auto_debit', vary: [500, 650, 420, 590] },
  { firm: 'VSL', day: 1, category: 'Rent', vendor: 'Malhotra Estates', description: 'Studio share, ground floor', base: 15_000, mode: 'bank_transfer', repeat: true },
  { firm: 'VSL', day: 5, category: 'Software & subscriptions', vendor: 'Canva', description: 'Canva Teams, 3 seats', base: 3_000, gstRate: 18, mode: 'card', repeat: true },
  { firm: 'VSL', day: 14, category: 'Creator/freelancer payments', vendor: 'Aman Verma', description: 'Product shoot assistant, day rate', base: 9_000, mode: 'cash', cash: true, vary: [6_000, 9_000, 12_000, 7_500] },
  { firm: 'VSL', day: 22, category: 'Office & utilities', vendor: 'Jio Fiber', description: 'Studio internet', base: 1_178, mode: 'upi', repeat: true },
]

/** One-offs, by months back from the current month. */
const ONE_OFF: (Item & { back: number })[] = [
  { back: 4, firm: 'VWX', day: 18, category: 'Travel', vendor: 'IndiGo', description: 'Indore–Mumbai return, Aarav Retail kickoff', base: 11_640, gstRate: 5, itc: true, mode: 'card' },
  { back: 3, firm: 'VWX', day: 9, category: 'Office & utilities', vendor: 'Croma', description: 'Monitor for the design desk', base: 18_640, gstRate: 18, itc: true, mode: 'card' },
  { back: 3, firm: 'VSL', day: 20, category: 'Travel', vendor: 'Ola', description: 'Cabs for the jewellery shoot', base: 2_340, mode: 'upi' },
  { back: 2, firm: 'VWX', day: 16, category: 'Travel', vendor: 'Taj Lands End', description: 'Two nights, Zenith Motors workshop', base: 14_000, gstRate: 12, itc: true, mode: 'card' },
  { back: 2, firm: 'VWX', day: 25, category: 'Taxes & fees', vendor: 'Indore Municipal Corporation', description: 'Trade licence renewal', base: 3_500, mode: 'bank_transfer' },
  { back: 1, firm: 'VWX', day: 11, category: 'Marketing', vendor: 'Sharma Printers', description: 'Festive client hampers and cards', base: 21_500, gstRate: 12, itc: true, mode: 'upi' },
  { back: 1, firm: 'VSL', day: 18, category: 'Other', vendor: 'Studio Props Co.', description: 'Props for the wedding catalogue', base: 4_850, mode: 'cash', cash: true },
  { back: 1, firm: 'VWX', day: 26, category: 'Professional fees', vendor: 'Khanna Legal', description: 'Client MSA review', base: 15_000, gstRate: 18, itc: true, mode: 'bank_transfer' },
]

async function ensureCategories(ctx: SeedCtx): Promise<Map<string, Types.ObjectId>> {
  if (!(await ctx.db(FolioExpenseCategory).exists({}))) await ctx.db(FolioExpenseCategory).insertMany(DEFAULT_EXPENSE_CATEGORIES.map((name, position) => ({ name, position, isActive: true })))
  const rows = await ctx.db(FolioExpenseCategory).find({}).lean()
  return new Map(rows.map((c) => [c.name, c._id]))
}

export async function seedExpenses(ctx: SeedCtx): Promise<void> {
  if (await ctx.db(FolioExpense).exists({})) return
  const entities = await ctx.db(FolioEntity).find({ code: { $in: ['VWX', 'VSL'] } }).lean()
  const firm = new Map(entities.map((e) => [e.code, e]))
  if (!firm.size) return
  const categories = await ensureCategories(ctx)
  const today = todayIST()
  const creator = ctx.members.finance?._id ?? ctx.members.owner._id
  const doc = (item: Item, month: string, base: number) => {
    const entity = firm.get(item.firm)
    const categoryId = categories.get(item.category)
    if (!entity || !categoryId) return null
    const gst = item.gstRate ? Math.round((r(base) * item.gstRate) / 100) : 0
    const bank = entity.bankAccounts.find((b) => b.isDefault) ?? entity.bankAccounts[0]
    return {
      entityId: entity._id, categoryId, date: `${month}-${String(item.day).padStart(2, '0')}`, vendor: item.vendor, description: item.description, amountPaise: r(base) + gst, gstPaise: gst,
      itcEligible: Boolean(item.itc && entity.kind === 'gst' && gst > 0), mode: item.mode, paidFrom: (item.cash ? 'cash' : 'bank') as PaidFrom, bankAccountId: item.cash ? null : (bank?._id ?? null), repeatMonthly: Boolean(item.repeat), createdBy: creator,
    }
  }
  const current = monthOf(today)
  const months = [4, 3, 2, 1].map((back) => shiftMonth(current, -back))
  const rows = [
    ...months.flatMap((month, i) => MONTHLY.map((item) => doc(item, month, item.vary?.[i] ?? item.base))),
    ...ONE_OFF.map((item) => doc(item, shiftMonth(current, -item.back), item.base)),
  ].filter((d): d is NonNullable<typeof d> => Boolean(d))
  const inserted = await ctx.db(FolioExpense).insertMany(rows)
  // This month: VWX's rent already copied forward from last month.
  const rent = MONTHLY[0]
  const lastRent = inserted.find((e) => e.date === `${months[3]}-01` && e.vendor === rent.vendor && String(e.entityId) === String(firm.get('VWX')?._id))
  const copy = lastRent ? doc(rent, current, rent.base) : null
  if (lastRent && copy) await ctx.db(FolioExpense).create({ ...copy, copiedFromId: lastRent._id })
  ctx.log(`folio: ${inserted.length + (copy ? 1 : 0)} expenses over ${months.length} months, plus this month's rent`)
}
