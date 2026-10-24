import type { Metadata } from 'next'
import Link from 'next/link'
import { BadgeCheck, BookOpen, Building2, CalendarHeart, ChevronLeft, ChevronRight, Clock3, FileCheck2, FileSignature, Plane } from 'lucide-react'
import { breadcrumbFor } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { DEFAULT_OFFICE_HOURS } from '@/lib/attendance-core'
import { mergeBreakPolicies } from '@/lib/break-types'
import { DEFAULT_WORK_WEEK, todayIST } from '@/lib/dates'
import { fileUrl } from '@/lib/files'
import { first, type SearchParams } from '@/lib/list'
import { PageHeader } from '@/components/ui/page-header'
import { Notice } from '@/components/settings/surface'
import { AttendanceRulesForm } from '@/components/muster/settings/attendance-rules-form'
import { CheckInLocationForm } from '@/components/muster/settings/check-in-location-form'
import { geoSettingsFor } from '@/lib/attendance'
import { isGeocodingConfigured } from '@/lib/env'
import { DepartmentsTab } from '@/components/muster/settings/departments-tab'
import { DesignationsTab } from '@/components/muster/settings/designations-tab'
import { HolidaysTab } from '@/components/muster/settings/holidays-tab'
import { LeavePolicyForm } from '@/components/muster/settings/leave-policy-form'
import { OnboardingRulesForm } from '@/components/muster/settings/onboarding-rules-form'
import { LeaveTypesTab, type LeaveTypeRow } from '@/components/muster/settings/leave-types-tab'
import { PoliciesTab } from '@/components/muster/settings/policies-tab'
import { SettingsNav, type SettingsSection } from '@/components/muster/settings/settings-nav'
import type { Ctx } from '@/lib/ctx'
import { Department } from '@/models/muster/Department'
import { Designation } from '@/models/muster/Designation'
import { Employee } from '@/models/muster/Employee'
import { Holiday } from '@/models/muster/Holiday'
import { LeaveType } from '@/models/muster/LeaveType'
import { PolicyDocument } from '@/models/muster/Policy'
import type { AccrualModel } from '@/modules/muster/leave/accrual'
import { DIRECTORY_STATUSES } from '@/modules/muster/people/lifecycle'
import { getPolicy } from '@/modules/muster/settings/queries'
import { remoteCount } from '@/modules/muster/people/work-mode'
import { canManageSignatories, companyProfileOf, defaultSignatoryOf } from '@/lib/company-profile'
import { CATEGORY_LABELS, LETTERS } from '@/modules/muster/letters/catalogue'
import { LetterSignatoriesForm } from '@/components/muster/settings/letter-signatories-form'

export const metadata: Metadata = { title: 'HR settings' }

const BASE = '/app/hr/settings'
const TABS = [
  { key: 'departments', label: 'Departments', group: 'Organisation', icon: <Building2 /> },
  { key: 'designations', label: 'Designations', group: 'Organisation', icon: <BadgeCheck /> },
  { key: 'holidays', label: 'Holidays', group: 'Time', icon: <CalendarHeart /> },
  { key: 'leave', label: 'Leave types & policy', group: 'Time', icon: <Plane /> },
  { key: 'attendance', label: 'Attendance rules', group: 'Time', icon: <Clock3 /> },
  { key: 'onboarding', label: 'Joining documents', group: 'People', icon: <FileCheck2 /> },
  { key: 'policies', label: 'Policy documents', group: 'People', icon: <BookOpen /> },
  { key: 'letters', label: 'Letter signatories', group: 'People', icon: <FileSignature /> },
] as const
const SECTIONS: SettingsSection[] = ['Organisation', 'Time', 'People'].map((group) => ({
  label: group,
  items: TABS.filter((t) => t.group === group).map((t) => ({ key: t.key, href: t.key === 'departments' ? BASE : `${BASE}?tab=${t.key}`, label: t.label, icon: t.icon })),
}))

async function headcountBy(ctx: Ctx, field: 'departmentId' | 'designationId') {
  const rows = await ctx.db(Employee).aggregate<{ _id: unknown; n: number }>([{ $match: { deletedAt: null, status: { $in: DIRECTORY_STATUSES } } }, { $group: { _id: `$${field}`, n: { $sum: 1 } } }])
  return new Map(rows.map((r) => [String(r._id), r.n]))
}

async function TabBody({ ctx, tab, sp }: { ctx: Ctx; tab: string; sp: SearchParams }) {
  const canWrite = ctx.can('hr.settings')
  if (tab === 'designations') {
    const [rows, counts] = await Promise.all([ctx.db(Designation).find({ deletedAt: null }).sort({ title: 1 }).lean(), headcountBy(ctx, 'designationId')])
    return <DesignationsTab canWrite={canWrite} rows={rows.map((r) => ({ id: String(r._id), title: r.title, people: counts.get(String(r._id)) ?? 0 }))} />
  }
  if (tab === 'holidays') {
    const year = Number(first(sp.year)) || Number(todayIST().slice(0, 4))
    const rows = await ctx.db(Holiday).find({ date: { $gte: `${year}-01-01`, $lte: `${year}-12-31` } }).sort({ date: 1 }).lean()
    const nav = 'inline-flex size-7 items-center justify-center rounded-full text-white transition-colors hover:bg-white/[0.08]'
    const switcher = (
      <span className="inline-flex h-9 items-center gap-0.5 rounded-full bg-control px-1 ring-1 ring-inset ring-white/[0.12]">
        <Link href={`${BASE}?tab=holidays&year=${year - 1}`} className={nav} aria-label="Previous year"><ChevronLeft className="size-3.5" strokeWidth={1.75} /></Link>
        <Link href={`${BASE}?tab=holidays&year=${year + 1}`} className={nav} aria-label="Next year"><ChevronRight className="size-3.5" strokeWidth={1.75} /></Link>
      </span>
    )
    return <HolidaysTab year={year} canWrite={canWrite} yearSwitcher={switcher} rows={rows.map((r) => ({ id: String(r._id), date: r.date, name: r.name, isOptional: Boolean(r.isOptional) }))} />
  }
  if (tab === 'leave') {
    const [types, policy] = await Promise.all([ctx.db(LeaveType).find({}).sort({ isActive: -1, displayOrder: 1, code: 1 }).lean(), getPolicy(ctx)])
    const rows: LeaveTypeRow[] = types.map((t) => ({
      id: String(t._id), code: t.code, name: t.name, isPaid: Boolean(t.isPaid), accrualModel: t.accrualModel as AccrualModel, annualQuota: t.annualQuota ?? 0, accrualPerMonth: t.accrualPerMonth ?? 0,
      carryForwardCap: t.carryForwardCap ?? null, proofRequiredAfterDays: t.proofRequiredAfterDays ?? null, allowHalfDay: t.allowHalfDay !== false, requiresProof: Boolean(t.requiresProof),
      displayOrder: t.displayOrder ?? 0, isActive: t.isActive !== false,
    }))
    return (
      <div className="space-y-3">
        <LeaveTypesTab rows={rows} canWrite={canWrite} />
        <LeavePolicyForm canWrite={canWrite} policy={{ ...policy.leave, ...policy.notice }} />
      </div>
    )
  }
  if (tab === 'attendance') {
    const [policy, remote] = await Promise.all([getPolicy(ctx), remoteCount(ctx)])
    const hours = { ...DEFAULT_OFFICE_HOURS, ...(ctx.org.officeHours ?? {}) }
    return (
      <>
      <AttendanceRulesForm
        canWrite={canWrite}
        rules={{
          start: hours.start, end: hours.end, graceMinutes: hours.graceMinutes ?? 15, halfDayHours: hours.halfDayHours,
          workWeek: ctx.org.workWeek?.length ? [...ctx.org.workWeek] : [...DEFAULT_WORK_WEEK], unmarkedPolicy: policy.attendance.unmarkedPolicy,
          correctionWindowDays: Math.round(policy.attendance.correctionWindowHours / 24), compOffValidDays: policy.attendance.compOffValidDays,
          breaks: mergeBreakPolicies(ctx.org.breakTypes),
        }}
      />
      <CheckInLocationForm canWrite={canWrite} settings={geoSettingsFor(ctx)} remoteCount={remote} geocoding={isGeocodingConfigured()} />
      </>
    )
  }
  if (tab === 'onboarding') {
    const { onboarding } = await getPolicy(ctx)
    return <OnboardingRulesForm canWrite={canWrite} mandatory={[...onboarding.mandatoryDocuments]} threshold={onboarding.thresholdPercent} />
  }
  if (tab === 'letters') {
    const policy = await getPolicy(ctx)
    const profile = companyProfileOf(ctx.org)
    const fallback = defaultSignatoryOf(profile)
    return (
      <LetterSignatoriesForm
        canWrite={canWrite}
        canManageProfile={canManageSignatories(ctx)}
        letters={LETTERS.map((l) => ({ code: l.code, name: l.name, category: CATEGORY_LABELS[l.category] }))}
        signers={profile.signatories.map((s) => ({ id: s.id, label: `${s.name}, ${s.designation}` }))}
        chosen={policy.letterSignatories}
        defaultLabel={fallback ? `${fallback.name}, ${fallback.designation}` : null}
      />
    )
  }
  if (tab === 'policies') {
    const docs = await ctx.db(PolicyDocument).find({ archivedAt: null }).sort({ createdAt: -1 }).lean()
    const canPost = ctx.has('work') && ctx.can('posts.write')
    return (
      <>
        <Notice tone="info" className="mb-4" action={canPost ? <Link href="/app/work/posts" className="text-sm text-white underline">Open Posts</Link> : undefined}>
          Policy documents are filed here and every employee sees them in My HR → My documents. To ask everyone to confirm they have read a policy, also publish it as a Policy post in Work → Posts.
        </Notice>
        <PoliciesTab canWrite={canWrite} rows={docs.map((d) => ({ id: String(d._id), title: d.title, category: d.category ?? null, description: d.description ?? null, fileUrl: fileUrl(d.fileId), publishedBy: d.publishedByName ?? null, createdAt: d.createdAt.toISOString() }))} />
      </>
    )
  }
  const [rows, counts] = await Promise.all([ctx.db(Department).find({ deletedAt: null }).sort({ name: 1 }).lean(), headcountBy(ctx, 'departmentId')])
  return <DepartmentsTab canWrite={canWrite} rows={rows.map((r) => ({ id: String(r._id), name: r.name, code: r.code, people: counts.get(String(r._id)) ?? 0 }))} />
}

export default async function HrSettingsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const ctx = await requireMember({ product: 'muster', perm: 'hr.settings' })
  const tab = TABS.some((t) => t.key === first(sp.tab)) ? (first(sp.tab) as string) : 'departments'
  return (
    <>
      <PageHeader title="HR settings" help="teams-vs-departments" description="Departments, holidays, leave and attendance rules for the whole workspace. Every change is audited." breadcrumb={breadcrumbFor(BASE)} />
      <div className="grid gap-6 lg:grid-cols-[208px_minmax(0,1fr)] lg:gap-7">
        <SettingsNav sections={SECTIONS} active={tab} />
        <div key={tab} className="min-w-0 animate-fade-in">
          <TabBody ctx={ctx} tab={tab} sp={sp} />
        </div>
      </div>
    </>
  )
}
