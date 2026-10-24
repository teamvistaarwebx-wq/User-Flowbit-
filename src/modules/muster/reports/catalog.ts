/** The HR reports (pure, client-safe). `payroll` reports show pay and need payroll.read. */

export const REPORT_KEYS = ['employees', 'attendance', 'leave', 'leave_balances', 'salary_register', 'statutory', 'journal', 'claims', 'gratuity'] as const
export type ReportKey = (typeof REPORT_KEYS)[number]

export type ReportDef = { label: string; description: string; payroll: boolean; monthly: boolean; icon: 'Users' | 'CalendarCheck' | 'Plane' | 'Banknote' | 'Landmark' | 'BookOpen' | 'Receipt' | 'HandCoins' }

export const REPORTS: Record<ReportKey, ReportDef> = {
  employees: { label: 'Employee master', description: 'Everyone on record, including people who have left.', payroll: false, monthly: false, icon: 'Users' },
  attendance: { label: 'Attendance summary', description: 'Working, present, leave, LOP and payable days per person for a month.', payroll: false, monthly: true, icon: 'CalendarCheck' },
  leave: { label: 'Leave requests', description: 'Every request touching the month, with the paid and unpaid split and who decided.', payroll: false, monthly: true, icon: 'Plane' },
  leave_balances: { label: 'Leave balances', description: 'Opening, earned, adjusted, taken and remaining per person and type, as of today.', payroll: false, monthly: false, icon: 'CalendarCheck' },
  salary_register: { label: 'Salary register', description: 'Earnings, deductions and net pay per person for a payroll month.', payroll: true, monthly: true, icon: 'Banknote' },
  statutory: { label: 'PF / ESI / PT', description: 'Statutory wages and contributions with UAN and PAN, for returns.', payroll: true, monthly: true, icon: 'Landmark' },
  journal: { label: 'Payroll journal', description: 'Debits and credits to post the month in your books.', payroll: true, monthly: true, icon: 'BookOpen' },
  claims: { label: 'Claims', description: 'Every expense claim with category, amounts and decision.', payroll: false, monthly: false, icon: 'Receipt' },
  gratuity: { label: 'Gratuity', description: 'Service, wage base and gratuity due at today’s salaries.', payroll: true, monthly: false, icon: 'HandCoins' },
}

export const isReportKey = (value: string | undefined): value is ReportKey => Boolean(value && (REPORT_KEYS as readonly string[]).includes(value))
