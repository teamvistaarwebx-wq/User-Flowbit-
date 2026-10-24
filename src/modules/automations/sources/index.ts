import 'server-only'
import type { SourceRegistry } from './common'
import { complianceDue } from './compliance'
import { clientsWithDues, invoiceDue, quoteSent, quoteValidUntil } from './money'
import { attendanceUnmarked, checkoutMissing, documentExpiry, employeeAnniversary, employeeBirthday, employeeJoining, onboardingIncomplete, probationEnd } from './people'
import { dealStageIdle, leadCreated } from './sales'
import { approvalRequested, meetingStart, taskDue } from './team'

/** Every time-trigger source by key (types.ts SOURCE_KEYS). */
export const SOURCES: SourceRegistry = {
  invoice_due: invoiceDue,
  quote_sent: quoteSent,
  quote_valid_until: quoteValidUntil,
  clients_with_dues: clientsWithDues,
  task_due: taskDue,
  approval_requested: approvalRequested,
  meeting_start: meetingStart,
  lead_created: leadCreated,
  deal_stage_idle: dealStageIdle,
  attendance_unmarked: attendanceUnmarked,
  checkout_missing: checkoutMissing,
  employee_birthday: employeeBirthday,
  employee_anniversary: employeeAnniversary,
  employee_joining: employeeJoining,
  onboarding_incomplete: onboardingIncomplete,
  probation_end: probationEnd,
  document_expiry: documentExpiry,
  compliance_due: complianceDue,
}
