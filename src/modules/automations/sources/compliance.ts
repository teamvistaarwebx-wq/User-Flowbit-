import 'server-only'
import { formatDate } from '@/lib/dates'
import { dueDatesBetween } from '@/modules/compliance/rules'
import { loadComplianceSettings } from '@/modules/compliance/store'
import type { RunSubject } from '../types'
import type { Source } from './common'

/** Statutory due dates in the window (the compliance reminder: N days before each one, to owners and accounts). */
export const complianceDue: Source = async (scope, { window }) => {
  if (window?.unit !== 'days') return []
  const settings = await loadComplianceSettings(scope.orgId)
  return dueDatesBetween(settings, window.from, window.to).map(
    (d): RunSubject => ({
      entity: 'Compliance',
      entityId: `${d.item}:${d.period}`,
      occurrence: d.dueDate,
      vars: { item_label: d.label, period: d.periodLabel, due_date: formatDate(d.dueDate), business_name: scope.orgName, note: d.extended ? `Extended${d.note ? `: ${d.note}` : ''}.` : 'Verify the date before you rely on it.' },
      refs: { href: '/app/settings/compliance' },
    }),
  )
}
