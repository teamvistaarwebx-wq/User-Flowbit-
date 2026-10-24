import type { Metadata } from 'next'
import { CalendarDays, Info, SlidersHorizontal } from 'lucide-react'
import { breadcrumbFor } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { addDays, formatDate, formatMonth, todayIST } from '@/lib/dates'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { Notice, SurfaceHeader } from '@/components/settings/surface'
import { ComplianceSettingsForm, OverrideControl } from '@/components/settings/compliance-forms'
import { dueDatesBetween, PT_DEFAULT_DAY, VERIFY_NOTE } from '@/modules/compliance/rules'
import { loadComplianceSettings } from '@/modules/compliance/store'

export const metadata: Metadata = { title: 'Compliance calendar' }

const HORIZON_DAYS = 90

/** Settings → Compliance calendar (notifications-v2 §0b.20): Indian statutory due dates for the next 90 days. */
export default async function CompliancePage() {
  const ctx = await requireMember({ anyPerm: ['org.manage', 'folio.settings'] })
  const settings = await loadComplianceSettings(ctx.orgId)
  const today = todayIST()
  const due = dueDatesBetween(settings, today, addDays(today, HORIZON_DAYS))
  const months = [...new Set(due.map((d) => d.dueDate.slice(0, 7)))]
  const canEdit = !ctx.readOnly
  return (
    <>
      <PageHeader title="Compliance calendar" description="GST, TDS, PF, ESI, professional tax and advance tax dates for your business. Turn on the reminder in Automations, or add Compliance to your brief." breadcrumb={breadcrumbFor('/app/settings/compliance')} />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="space-y-4 xl:col-span-5">
          <Notice tone="warning">
            <span className="flex gap-2"><Info className="mt-0.5 size-4 shrink-0" /> {VERIFY_NOTE}</span>
          </Notice>
          <Card variant="solid" className="space-y-4 rounded-[10px]">
            <SurfaceHeader icon={<SlidersHorizontal />} label="Your filings" />
            <ComplianceSettingsForm filerType={settings.filerType} state={settings.state} items={settings.items} ptDay={settings.ptDay} ptDefault={PT_DEFAULT_DAY[settings.state] ?? null} canEdit={canEdit} />
          </Card>
        </div>
        <Card variant="solid" className="space-y-4 rounded-[10px] xl:col-span-7">
          <SurfaceHeader icon={<CalendarDays />} label="Next 90 days" description="If the government extends a date, press Extended? and enter the new one: reminders follow it." />
          {months.length ? (
            months.map((month) => (
              <section key={month} className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-[0.06em] text-fg-3">{formatMonth(month)}</h3>
                <ul className="divide-y divide-line">
                  {due.filter((d) => d.dueDate.startsWith(month)).map((d) => (
                    <li key={`${d.item}:${d.period}`} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-2 text-sm text-white">
                          {formatDate(d.dueDate, { withWeekday: true })} · {d.label} {d.extended ? <Badge tone="info">Extended</Badge> : null}
                        </span>
                        <span className="block text-xs text-fg-2">For {d.periodLabel}{d.note ? ` · ${d.note}` : ''}</span>
                      </span>
                      <OverrideControl item={d.item} period={d.period} dueDate={d.dueDate} extended={d.extended} canEdit={canEdit} />
                    </li>
                  ))}
                </ul>
              </section>
            ))
          ) : (
            <p className="text-sm text-fg-2">Nothing due in the next 90 days for the items you picked.</p>
          )}
        </Card>
      </div>
    </>
  )
}
