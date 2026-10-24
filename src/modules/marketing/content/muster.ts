import { rupees } from '../pricing'
import { PLAN_PRICES } from '@/lib/plans'
import type { ProductContent } from './types'

export const MUSTER_CONTENT: ProductContent = {
  key: 'muster',
  eyebrow: 'HR and payroll',
  oneLiner: 'From joining day to payslip, one record per person.',
  sub: 'Attendance, leave, reimbursements, payroll with PF, ESI and PT, and HR letters all read from the same employee record. A muster roll is the register Indian labour law ties payroll to, so we named it that.',
  heroMock: 'muster-attendance',
  features: [
    { icon: 'Users', title: 'People', body: 'An employee master with 13 lifecycle statuses, from candidate and offered through probation, confirmed and notice period to exited.', points: ['Documents, nominees, bank and statutory details (PAN, UAN, ESIC) and remarks', 'Bulk import from CSV, checked row by row before anything is saved'] },
    { icon: 'Fingerprint', title: 'Attendance', body: 'Check in, take breaks and check out from the Flowbit sidebar. HR marks and overrides a month register.', points: ['Correction requests with approval', 'Lock the month before payroll'] },
    { icon: 'CalendarCheck', title: 'Leave', body: 'Apply and approve, balances, a team leave calendar, holidays, and leave types with their policy.' },
    { icon: 'Wallet', title: 'Reimbursements', body: 'Shareable claim forms behind a public link. The employee verifies with a one-time code sent to their work email, uploads receipts and submits.', points: ['HR reviews from one queue', 'Finance marks claims paid'] },
    { icon: 'Banknote', title: 'Payroll in eight visible stages', body: 'PF, ESI and Professional Tax by state with effective dates, holds, exclusions and adjustments, and payslip PDFs by email.', points: ['Each entry keeps a snapshot of its inputs, so a payslip reproduces exactly later'] },
    { icon: 'FileSignature', title: 'HR letters, 20 templates', body: 'Offer, appointment, confirmation, experience, salary revision, promotion, warning, relieving, full and final settlement, no dues, internship letters and a custom letter.', points: ['Numbered references, PDF and email', 'Never deleted, only revoked with a reason'] },
    { icon: 'UserCheck', title: 'Self-service', body: 'Employees see their own profile, attendance, leave, payslips, claims, letters and documents.' },
    { icon: 'ChartColumn', title: 'Reports', body: 'Employee master, attendance, leave, payroll register, PF/ESI/PT, claims and gratuity, all as CSV.' },
    { icon: 'ShieldCheck', title: 'Salary stays private', body: 'Managers approve their team’s leave without seeing a rupee. Seeing pay is one explicit permission, and every salary change, payroll unlock and release is in the audit log.' },
  ],
  spotlights: [
    {
      label: 'Payroll run',
      icon: 'Banknote',
      title: 'Eight stages, each with an owner and a record',
      body: 'Attendance locked, claims closed, generated, HR reviewed, finance approved, locked, released, payslips published. Each stage is a click by someone allowed to make it, and each click is audited.',
      points: ['PF, ESI and PT worked out by state and effective date', 'Hold, exclude or adjust a single entry', 'Payslips land in inboxes as PDFs'],
      mock: 'muster-payroll',
    },
    {
      label: 'HR letters',
      icon: 'FileSignature',
      title: 'Letters with references, never lost, never deleted',
      body: 'Pick a template, check the filled-in details, issue. The letter gets the next reference number, a PDF and an email. If it was a mistake, revoke it with a reason; it stays on record.',
      points: ['20 templates from offer to no-dues', 'Numbered references per workspace', 'Revoke with a reason instead of deleting'],
      mock: 'muster-letters',
    },
  ],
  steps: [
    { title: 'Import your people', body: 'Upload a CSV; every row is checked before anything is saved.' },
    { title: 'They check in from the sidebar', body: 'Check-ins, breaks and check-outs build the register on their own.' },
    { title: 'Approve leave and claims', body: 'Managers and HR approve through the month from one queue.' },
    { title: 'Lock attendance and run payroll', body: 'Move through the eight stages with finance approval.' },
    { title: 'Payslips land in inboxes', body: 'And in each employee’s self-service.' },
  ],
  worksWith: [
    { title: 'One login per person', body: 'The person who checks in is the same member who gets tasks in Work. No second account.', href: '/products/work', product: 'work' },
    { title: 'Check-in from anywhere in Flowbit', body: 'The sidebar widget is always there, whichever product you have open.', href: '/products/work', product: 'work' },
    { title: 'One audit log', body: 'Salary changes and payroll stages sit in the same workspace audit log as everything else.', href: '/#trust', product: 'core' },
  ],
  notYet: ['Recruitment and applicant tracking', 'Appraisals', 'A live link to biometric machines (import their punch files instead)', 'Paying salaries from Flowbit (download the bank file instead)', 'Government filings (PF ECR, ESI challans, TDS returns)'],
  plans: ['muster_starter', 'muster_business'],
  pricingNote: 'Billing counts employees on payroll. Employees need a login only for self-service.',
  seo: {
    title: 'Muster: HR and payroll with PF, ESI and PT for Indian teams',
    description: `Employee records, web check-in attendance, leave, reimbursements, an eight-stage payroll with PF/ESI/PT and 20 HR letter templates. From ${rupees(PLAN_PRICES.muster_starter.monthlyPaise)} per employee.`,
  },
}
