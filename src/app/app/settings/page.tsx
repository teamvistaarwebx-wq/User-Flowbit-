import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { breadcrumbFor } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { DEFAULT_WORK_WEEK, formatDate } from '@/lib/dates'
import { companyProfileOf } from '@/lib/company-profile'
import { PageHeader } from '@/components/ui/page-header'
import { ATTENDANCE_RULES_HREF, workingHoursHome } from '@/lib/working-hours'
import { CalendarCard, CompanyProfileLink, DangerZone, WorkspaceCard } from '@/components/settings/general-forms'

export const metadata: Metadata = { title: 'General settings' }

export default async function GeneralSettingsPage() {
  const ctx = await requireMember()
  if (!ctx.can('org.manage')) redirect('/app/settings/profile')
  const org = ctx.org
  const profile = companyProfileOf(org)
  return (
    <>
      <PageHeader
        title="General"
        help="company-sources"
        description={`Workspace details for ${org.name}, created ${formatDate(org.createdAt)}.`}
        breadcrumb={breadcrumbFor('/app/settings')}
      />
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 space-y-4 xl:col-span-7">
          <WorkspaceCard org={{ name: org.name, slug: org.slug, teamSize: org.teamSize ?? '2-10', mode: org.mode ?? 'project' }} />
        </div>
        <div className="col-span-12 space-y-4 xl:col-span-5">
          <CompanyProfileLink legalName={profile.legalName} gstin={profile.gstin} />
          <CalendarCard
            start={org.officeHours?.start ?? '10:00'}
            end={org.officeHours?.end ?? '19:00'}
            halfDayHours={org.officeHours?.halfDayHours ?? 4.5}
            workWeek={org.workWeek?.length ? [...org.workWeek] : [...DEFAULT_WORK_WEEK]}
            editHref={workingHoursHome(ctx.has('muster')) === 'attendance_rules' ? ATTENDANCE_RULES_HREF : null}
          />
          {ctx.isOwner ? <DangerZone slug={org.slug} /> : null}
        </div>
      </div>
    </>
  )
}
