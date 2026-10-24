/**
 * Who may download the quarterly 24Q (Form 138) export, pure so the Salary
 * tax page shows the buttons exactly when the route would answer: it carries
 * every person's PAN, so it needs payroll access, sensitive details and a
 * role that sees the whole company.
 */
export function can24qExport(input: Readonly<{ payrollRead: boolean; sensitive: boolean; seesEveryone: boolean }>): boolean {
  return input.payrollRead && input.sensitive && input.seesEveryone
}

/** Form 130 Part B needs a worksheet: a salary structure, or paid payroll this year. */
export const hasForm130Worksheet = (employeeId: string, structured: ReadonlySet<string>, paid: ReadonlySet<string>): boolean => structured.has(employeeId) || paid.has(employeeId)
