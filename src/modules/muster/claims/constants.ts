/** Claims vocabulary shared by models, actions and client components (pure). */

export const CLAIM_STATUSES = ['submitted', 'under_review', 'approved', 'partially_approved', 'rejected', 'scheduled_for_payroll', 'paid'] as const
export type ClaimStatus = (typeof CLAIM_STATUSES)[number]

/** Waiting for a reviewer's decision. */
export const UNDECIDED: readonly ClaimStatus[] = ['submitted', 'under_review']
/** Approved (fully or partly) and not yet in a payroll month. */
export const APPROVED: readonly ClaimStatus[] = ['approved', 'partially_approved']

export const CLAIM_STATUS_LABELS: Record<ClaimStatus, string> = {
  submitted: 'Submitted',
  under_review: 'Under review',
  approved: 'Approved',
  partially_approved: 'Partly approved',
  rejected: 'Rejected',
  scheduled_for_payroll: 'In payroll',
  paid: 'Paid',
}

export const CLAIM_STATUS_TONES: Record<ClaimStatus, 'info' | 'warning' | 'success' | 'danger' | 'orchid'> = {
  submitted: 'info',
  under_review: 'warning',
  approved: 'success',
  partially_approved: 'warning',
  rejected: 'danger',
  scheduled_for_payroll: 'orchid',
  paid: 'success',
}

export const CLAIM_FORM_STATUSES = ['draft', 'open', 'closed'] as const
export type ClaimFormStatus = (typeof CLAIM_FORM_STATUSES)[number]

export const PAYMENT_METHODS = ['Personal card', 'UPI', 'Cash', 'Net banking', 'Company card', 'Other'] as const

/** ₹10,00,000: the most one claim (or a form's cap) may be. */
export const MAX_CLAIM_PAISE = 10_00_000_00
/** ₹10 crore: the highest category ceiling. */
export const MAX_CATEGORY_CEILING_PAISE = 10_00_00_000_00

/** Receipts: PDF and common photo formats, at most MAX_UPLOAD_MB. */
export const RECEIPT_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif']

export const STANDARD_CATEGORIES: { code: string; name: string }[] = [
  { code: 'TRAVEL', name: 'Travel' },
  { code: 'FUEL', name: 'Fuel' },
  { code: 'FOOD', name: 'Food' },
  { code: 'CLIENT', name: 'Client Meeting' },
  { code: 'OFFICE', name: 'Office Purchase' },
  { code: 'SOFTWARE', name: 'Software' },
  { code: 'COURIER', name: 'Courier' },
  { code: 'OTHER', name: 'Other' },
]
