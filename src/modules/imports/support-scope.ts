import { PRODUCTS, type ProductKey } from '@/lib/catalog'

/**
 * What the Flowbit team can import for a workspace during import access (Settings → Support access),
 * read from the importer registry so the list never drifts from the importers that exist. Pure.
 */

export type ImportScopeRow = { kind: string; label: string; description: string; product: string }
export type ImporterLike = { kind: string; label: string; description: string; product: ProductKey | null }

/** Data with no importer, and why: shown so owners know to expect manual set-up. */
export const NOT_IMPORTABLE: readonly { label: string; reason: string }[] = [
  { label: 'Billing history and subscription', reason: 'Your Flowbit plan and its invoices are set up by Flowbit billing, not imported.' },
  { label: 'Inventory and stock', reason: 'Flowbit has no inventory module.' },
  { label: 'Folio invoices, receipts and expenses', reason: "Enter each client's opening balance in Folio instead; past documents stay in your old tool." },
  { label: 'Payroll history and salary structures', reason: 'Set up structures in Muster; past payslips stay in your old payroll.' },
  { label: 'Files, chats and comments', reason: 'Attach files where they belong after the import.' },
]

/** One row per importer, in registry order, with its product's short name ("Workspace" for team-wide ones). */
export function importScope(importers: readonly ImporterLike[]): ImportScopeRow[] {
  return importers.map((i) => ({ kind: i.kind, label: i.label, description: i.description, product: i.product ? PRODUCTS[i.product].shortName : 'Workspace' }))
}
