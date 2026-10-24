import type { Permission } from '@/lib/catalog'

/** Who may make or turn off a document's public link (pure): write access to that kind of document. */

export const LINK_KINDS = ['invoice', 'quote', 'credit_note', 'receipt'] as const
export type LinkKind = (typeof LINK_KINDS)[number]

export const LINK_WRITERS: Readonly<Record<LinkKind, readonly Permission[]>> = {
  invoice: ['invoices.write', 'invoices.issue'],
  quote: ['quotes.write'],
  credit_note: ['credit_notes.write'],
  receipt: ['receipts.write'],
}

/** Every permission that can manage some link (the action's outer gate). */
export const ANY_LINK_WRITER: readonly Permission[] = [...new Set(Object.values(LINK_WRITERS).flat())]

export const canManageLink = (kind: LinkKind, can: (perm: Permission) => boolean): boolean => LINK_WRITERS[kind].some(can)
