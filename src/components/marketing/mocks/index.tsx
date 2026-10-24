import type { MockKey } from '@/modules/marketing/content'
import { FolioAgingMock, FolioInvoiceMock, FolioReceiptMock } from './folio-mocks'
import { MusterAttendanceMock, MusterLettersMock, MusterPayrollMock } from './muster-mocks'
import { OrbitLeadMock, OrbitPipelineMock, OrbitReportsMock } from './orbit-mocks'
import { WorkBoardMock, WorkProjectMock, WorkTimesheetMock } from './work-mocks'

export { ArcCardMock } from './arc-card'
export { HomeMock } from './home-mock'

const MOCKS: Record<MockKey, () => React.JSX.Element> = {
  'work-board': WorkBoardMock,
  'work-project': WorkProjectMock,
  'work-timesheet': WorkTimesheetMock,
  'muster-attendance': MusterAttendanceMock,
  'muster-payroll': MusterPayrollMock,
  'muster-letters': MusterLettersMock,
  'orbit-pipeline': OrbitPipelineMock,
  'orbit-lead': OrbitLeadMock,
  'orbit-reports': OrbitReportsMock,
  'folio-invoice': FolioInvoiceMock,
  'folio-aging': FolioAgingMock,
  'folio-receipt': FolioReceiptMock,
}

/** Renders the mock screen for a content key. */
export function Mock({ name }: { name: MockKey }) {
  const Component = MOCKS[name]
  return <Component />
}
