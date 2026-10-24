/**
 * What the public document page renders (plain, serialisable data). Built on
 * the server from one document of one workspace; nothing else is reachable
 * from the page. Never put internal notes, other documents, ids of other
 * records or secrets here.
 */

export type PublicBrand = Readonly<{
  /** The business on the document (trade name of the billing entity), else the workspace name. */
  name: string
  legalName: string | null
  addressLines: readonly string[]
  gstin: string | null
  email: string | null
  phone: string | null
  /** PNG/JPEG data URI or null. */
  logoSrc: string | null
  /** The workspace's primary brand colour (#rrggbb). */
  color: string
}>

export type PublicLine = Readonly<{ description: string; qty: string; ratePaise: number; amountPaise: number }>
export type PublicTotal = Readonly<{ label: string; amountPaise: number; strong?: boolean }>

export type UpiPay = Readonly<{ vpa: string; payee: string; intent: string; qrPath: string; qrSize: number }>

type Common = Readonly<{ token: string; brand: PublicBrand; billedTo: string; number: string }>

export type InvoiceView = Common &
  Readonly<{
    kind: 'invoice'
    title: string
    status: string
    issueDate: string
    dueDate: string
    lines: readonly PublicLine[]
    totals: readonly PublicTotal[]
    totalPaise: number
    balancePaise: number
    payable: boolean
    payUrl: string | null
    upi: UpiPay | null
    bank: Readonly<{ name: string; account: string; ifsc: string }> | null
    notes: string | null
    terms: string | null
  }>

export type QuoteView = Common &
  Readonly<{
    kind: 'quote'
    title: string
    status: string
    quoteDate: string
    validUntil: string
    lines: readonly PublicLine[]
    totals: readonly PublicTotal[]
    totalPaise: number
    decision: Readonly<{ open: true } | { open: false; reason: string }>
    notes: string | null
    terms: string | null
  }>

export type CreditNoteView = Common & Readonly<{ kind: 'credit_note'; noteDate: string; invoiceNumber: string | null; reason: string; lines: readonly PublicLine[]; totals: readonly PublicTotal[]; totalPaise: number }>

export type ReceiptView = Common &
  Readonly<{ kind: 'receipt'; receivedOn: string; amountPaise: number; mode: string; reference: string | null; status: string; allocations: readonly { invoiceNumber: string; amountPaise: number }[] }>

export type StatementView = Common &
  Readonly<{ kind: 'statement'; asOf: string; totalDuePaise: number; invoices: readonly { number: string; issueDate: string; dueDate: string; totalPaise: number; balancePaise: number; overdue: boolean }[] }>

export type PublicView = InvoiceView | QuoteView | CreditNoteView | ReceiptView | StatementView
