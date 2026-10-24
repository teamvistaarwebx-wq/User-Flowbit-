import { rupees } from '../pricing'
import { PLAN_PRICES, FOLIO_INCLUDED_FIRMS, FOLIO_INCLUDED_USERS, FOLIO_EXTRA_FIRM_PAISE } from '@/lib/plans'
import type { ProductContent } from './types'

export const FOLIO_CONTENT: ProductContent = {
  key: 'folio',
  eyebrow: 'Billing and collections',
  oneLiner: 'Quotes, invoices and who owes you what.',
  sub: 'Draft and issue invoices from one or more businesses, record money against the client and allocate it, and always know your aging.',
  heroMock: 'folio-invoice',
  features: [
    { icon: 'FileText', title: 'Draft, then issue', body: 'A draft has no number and stays fully editable. Issuing takes the next number in that firm’s series for the financial year, like VWX/2026-27/0001, and locks the figures.', points: ['A voided invoice keeps its number', 'The series has no gaps'] },
    { icon: 'IndianRupee', title: 'GST worked out for you', body: 'CGST and SGST within your state, IGST across states, decided by place of supply. A GSTIN is checked against its state.' },
    { icon: 'Building2', title: 'More than one business', body: 'Run a GST-registered firm and a non-GST one from the same workspace, each with its own number series, bank details and letterhead. A non-GST firm issues sale invoices with no tax.', points: [`${FOLIO_INCLUDED_FIRMS} firms included`, `Each extra firm is ${rupees(FOLIO_EXTRA_FIRM_PAISE)} a month`] },
    { icon: 'ClipboardList', title: 'Quotes and proformas', body: 'Send a quote and convert it into an invoice in one click.' },
    { icon: 'Receipt', title: 'Receipts that match how money arrives', body: 'Record money against the client, then allocate it to invoices. Advances, part payments and one payment for three bills use the same flow. Anything unallocated is an advance.' },
    { icon: 'Repeat', title: 'Recurring retainers', body: 'Monthly drafts created for you, ready to review and issue.' },
    { icon: 'FileMinus', title: 'Credit notes', body: 'Reduce what a client owes with a proper paper trail.' },
    { icon: 'BookOpen', title: 'Client ledger', body: 'A running statement for every client, with a statement PDF.' },
    { icon: 'ChartPie', title: 'Reports and dashboard', body: 'Receivables, overdue, collected this month, aging buckets, top debtors, a GST summary for GSTR-1 prep, collections and revenue by client and month. CSV opens cleanly in Excel.' },
    { icon: 'Mail', title: 'PDF and email', body: 'Send invoices to clients as PDFs, record payments, and void with a reason instead of deleting.' },
  ],
  spotlights: [
    {
      label: 'Receivables',
      icon: 'ChartPie',
      title: 'Always know who owes what, and for how long',
      body: 'The dashboard buckets every open invoice by age and lists your top debtors, so the Monday follow-up list writes itself.',
      points: ['Aging: current, 1–30, 31–60, 61–90, 90+ days', 'Top debtors with balances', 'Collected this month against what is due'],
      mock: 'folio-aging',
    },
    {
      label: 'Receipts',
      icon: 'Receipt',
      title: 'One payment, three invoices, no spreadsheet',
      body: 'Record the money the way it arrived, against the client. Then allocate it to the invoices it covers. Whatever is left over waits as an advance for the next bill.',
      points: ['Part payments and advances in the same flow', 'Balances update on every invoice', 'Ledger and statement stay in step'],
      mock: 'folio-receipt',
    },
  ],
  steps: [
    { title: 'Add your business', body: 'GSTIN, state, bank details, letterhead and number series.' },
    { title: 'Draft and issue', body: 'GST splits itself by place of supply; issuing locks the number.' },
    { title: 'Email the PDF', body: 'From Folio, to the client’s billing contact.' },
    { title: 'Record receipts', body: 'Allocate money to invoices; the rest is an advance.' },
    { title: 'Watch aging', body: 'Follow up from the dashboard and the client ledger.' },
  ],
  worksWith: [
    { title: 'Invoice a won deal', body: 'Orbit hands the client and value over when a deal is won.', href: '/products/orbit', product: 'orbit' },
    { title: 'Same client as your projects', body: 'The client on the invoice is the one your team works for in Work.', href: '/products/work', product: 'work' },
    { title: 'Voided, never deleted', body: 'Issued invoices are voided with a reason and stay in the audit log.', href: '/#trust', product: 'core' },
  ],
  notYet: ['Filing GST returns', 'Full accounting (balance sheet, depreciation)', 'E-invoices for exports, reverse charge and credit notes'],
  plans: ['folio'],
  pricingNote: `Folio is flat per workspace and includes ${FOLIO_INCLUDED_FIRMS} firms and ${FOLIO_INCLUDED_USERS} users; the users cannot be raised (Owner, Admins, Finance and Sales count). Each extra firm you bill from is ${rupees(FOLIO_EXTRA_FIRM_PAISE)} a month. On Suite there is no Folio user limit; firms work the same way.`,
  seo: {
    title: 'Folio: quotes, invoices, collections and P&L',
    description: `GST invoices with CGST/SGST or IGST by place of supply, number series per firm and financial year, receipts with allocation, ledgers and aging. ${rupees(PLAN_PRICES.folio.monthlyPaise)} a month with ${FOLIO_INCLUDED_FIRMS} firms included.`,
  },
}
