import type { ProductKey } from '@/lib/catalog'
import type { Tone } from '@/lib/status'

/**
 * Illustrative numbers for the product preview page. Invented, round and
 * labelled "Sample data" on screen; never read from or written to the database.
 * Money is paise, like everywhere else.
 */

export type SampleStat = { label: string; value: string; delta?: number; invert?: boolean; trend: number[] }
export type SampleRow = { title: string; meta: string; status: string; tone: Tone }
export type ProductSample = {
  stats: SampleStat[]
  chart: { title: string; labels: string[]; data: number[]; money: boolean }
  rowsTitle: string
  rows: SampleRow[]
}

const LAKH = 100_000 * 100

export const SAMPLES: Record<ProductKey, ProductSample> = {
  work: {
    stats: [
      { label: 'Open tasks', value: '48', delta: -6, invert: true, trend: [56, 54, 55, 51, 50, 48] },
      { label: 'Due this week', value: '12', trend: [9, 11, 10, 14, 12, 12] },
      { label: 'Overdue', value: '3', delta: -40, invert: true, trend: [7, 6, 6, 5, 4, 3] },
      { label: 'Hours logged', value: '126 h', delta: 8, trend: [104, 110, 118, 112, 121, 126] },
    ],
    chart: { title: 'Tasks completed per week', labels: ['W1', 'W2', 'W3', 'W4', 'W5', 'W6'], data: [18, 22, 19, 27, 24, 31], money: false },
    rowsTitle: 'Due soon',
    rows: [
      { title: 'Homepage copy review', meta: 'Website refresh · Fri', status: 'In review', tone: 'info' },
      { title: 'Client onboarding checklist', meta: 'Operations · Mon', status: 'To do', tone: 'neutral' },
      { title: 'Q3 report deck', meta: 'Leadership · Tue', status: 'In progress', tone: 'violet' },
      { title: 'Vendor contract renewal', meta: 'Admin · overdue', status: 'Overdue', tone: 'danger' },
    ],
  },
  muster: {
    stats: [
      { label: 'Headcount', value: '34', delta: 6, trend: [29, 30, 31, 32, 32, 34] },
      { label: 'Present today', value: '29', trend: [27, 30, 28, 31, 29, 29] },
      { label: 'On leave', value: '3', trend: [2, 1, 4, 3, 2, 3] },
      { label: 'Payroll, September', value: '₹18.4L', delta: 4, trend: [16.1, 16.6, 17.0, 17.2, 17.7, 18.4] },
    ],
    chart: { title: 'Attendance this month (%)', labels: ['1', '5', '9', '13', '17', '21', '25'], data: [92, 95, 89, 94, 96, 91, 93], money: false },
    rowsTitle: 'Waiting for approval',
    rows: [
      { title: 'Casual leave, 2 days', meta: 'A designer · 14–15 Oct', status: 'Pending', tone: 'warning' },
      { title: 'Travel claim ₹2,350', meta: 'A sales lead · receipt attached', status: 'Pending', tone: 'warning' },
      { title: 'Attendance correction', meta: 'An engineer · 3 Oct', status: 'Pending', tone: 'warning' },
      { title: 'September payroll', meta: '34 people · ready to lock', status: 'Review', tone: 'info' },
    ],
  },
  orbit: {
    stats: [
      { label: 'Open deals', value: '21', delta: 10, trend: [15, 16, 18, 17, 19, 21] },
      { label: 'Pipeline', value: '₹42.6L', delta: 12, trend: [31, 34, 36, 38, 40, 42.6] },
      { label: 'Won this month', value: '₹8.2L', delta: 18, trend: [4.1, 5.0, 6.3, 5.8, 7.1, 8.2] },
      { label: 'Follow-ups today', value: '7', trend: [5, 9, 6, 8, 6, 7] },
    ],
    chart: { title: 'Pipeline by stage', labels: ['New', 'Qualified', 'Proposal', 'Negotiation', 'Won'], data: [9.5 * LAKH, 12 * LAKH, 11.4 * LAKH, 9.7 * LAKH, 8.2 * LAKH], money: true },
    rowsTitle: 'Deals to move',
    rows: [
      { title: 'Annual retainer, textile brand', meta: '₹6,00,000 · proposal sent', status: 'Proposal', tone: 'violet' },
      { title: 'Website rebuild, clinic chain', meta: '₹3,20,000 · call today', status: 'Negotiation', tone: 'orange' },
      { title: 'Catalogue shoot, jewellery label', meta: '₹1,40,000 · warm lead', status: 'Qualified', tone: 'info' },
      { title: 'SEO audit, D2C store', meta: '₹85,000 · won yesterday', status: 'Won', tone: 'success' },
    ],
  },
  folio: {
    stats: [
      { label: 'Outstanding', value: '₹6.8L', delta: -5, invert: true, trend: [7.9, 7.6, 7.4, 7.1, 7.2, 6.8] },
      { label: 'Overdue', value: '₹1.2L', delta: -22, invert: true, trend: [2.1, 1.9, 1.7, 1.5, 1.4, 1.2] },
      { label: 'Collected, September', value: '₹4.5L', delta: 9, trend: [3.2, 3.6, 3.9, 4.1, 4.0, 4.5] },
      { label: 'Invoices issued', value: '38', trend: [29, 31, 33, 35, 36, 38] },
    ],
    chart: { title: 'Receivables by age', labels: ['Not due', '1–30', '31–60', '61–90', '90+'], data: [3.9 * LAKH, 1.7 * LAKH, 0.7 * LAKH, 0.3 * LAKH, 0.2 * LAKH], money: true },
    rowsTitle: 'Recent invoices',
    rows: [
      { title: 'INV/2026-27/0142', meta: 'Retail client · ₹1,18,000', status: 'Paid', tone: 'success' },
      { title: 'INV/2026-27/0141', meta: 'Hospitality client · ₹64,900', status: 'Due in 6 days', tone: 'info' },
      { title: 'INV/2026-27/0138', meta: 'Education client · ₹2,36,000', status: 'Part paid', tone: 'warning' },
      { title: 'INV/2026-27/0131', meta: 'Real estate client · ₹47,200', status: 'Overdue 18 days', tone: 'danger' },
    ],
  },
}
