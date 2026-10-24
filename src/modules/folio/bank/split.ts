/**
 * The manual split of one deposit across a client's open invoices (pure, used
 * by the Bank page's split dialog): a first draft that pays the oldest
 * invoices first, and the running totals that decide whether it can be saved.
 */

export type SplitInvoice = Readonly<{ id: string; dueDate: string; balancePaise: number }>
export type SplitLine = Readonly<{ invoiceId: string; amountPaise: number; tdsPaise: number }>

/** Oldest due first, each invoice up to its balance, until the deposit runs out. */
export function draftSplit(depositPaise: number, invoices: readonly SplitInvoice[]): SplitLine[] {
  let left = Math.max(0, depositPaise)
  return [...invoices]
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .map((inv) => {
      const amountPaise = Math.min(left, Math.max(0, inv.balancePaise))
      left -= amountPaise
      return { invoiceId: inv.id, amountPaise, tdsPaise: 0 }
    })
}

export type SplitTotals = Readonly<{ allocatedPaise: number; advancePaise: number; overPaise: number; lines: number; problem: string | null }>

/** What the split allocates, what stays as advance, and why it cannot be saved yet (or null). */
export function splitTotals(depositPaise: number, lines: readonly SplitLine[], balances: ReadonlyMap<string, number>): SplitTotals {
  const used = lines.filter((l) => l.amountPaise + l.tdsPaise > 0)
  const allocatedPaise = used.reduce((sum, l) => sum + l.amountPaise, 0)
  const overPaise = Math.max(0, allocatedPaise - depositPaise)
  const tooMuch = used.find((l) => l.amountPaise + l.tdsPaise > (balances.get(l.invoiceId) ?? 0))
  const problem = !used.length
    ? 'Enter an amount for at least one invoice.'
    : overPaise > 0
      ? 'The amounts add up to more than the deposit.'
      : tooMuch
        ? 'An amount (with its TDS) is more than that invoice’s balance.'
        : used.some((l) => l.amountPaise < 0 || l.tdsPaise < 0)
          ? 'Amounts cannot be negative.'
          : null
  return { allocatedPaise, advancePaise: Math.max(0, depositPaise - allocatedPaise), overPaise, lines: used.length, problem }
}

/** "1,234.50" or "1234.5" in rupees → paise; NaN when unreadable. */
export const rupeesToPaise = (text: string): number => {
  const clean = text.replace(/[,\s₹]/g, '')
  if (!clean) return 0
  if (!/^\d+(\.\d{0,2})?$/.test(clean)) return Number.NaN
  return Math.round(Number(clean) * 100)
}
