import type { Metadata } from 'next'
import { breadcrumbFor } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { todayIST } from '@/lib/dates'
import { formatSeq, peekSeq, prefixFrom } from '@/lib/sequence'
import { PageHeader } from '@/components/ui/page-header'
import { EmployeeForm } from '@/components/muster/people/employee-form'
import { ONBOARDING_OVERRIDE_PERM } from '@/modules/muster/people/onboarding-gate'
import { peopleOptions } from '@/modules/muster/people/queries'
import { selfEmployeeDefaults } from '@/modules/muster/people/self'
import { first, type SearchParams } from '@/lib/list'

export const metadata: Metadata = { title: 'Add employee' }

export default async function NewEmployeePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireMember({ product: 'muster', perm: 'people.write' })
  const self = first((await searchParams).self) === '1' ? selfEmployeeDefaults(ctx.user) : {}
  const [options, next] = await Promise.all([peopleOptions(ctx), peekSeq(ctx.orgId, 'employee')])
  return (
    <>
      <PageHeader title="Add employee" description="Only name, work email, type, status and joining date are needed now. New people start as Joining pending until their joining documents are in." breadcrumb={breadcrumbFor('/app/hr/people/new')} back={{ href: '/app/hr/people', label: 'People' }} />
      <EmployeeForm
        values={{ employmentType: 'full_time', status: 'joining_pending', joinDate: todayIST(), ...self }}
        codeHint={formatSeq(next, { prefix: `${prefixFrom(ctx.org.name)}-`, pad: 4 })}
        departments={options.departments}
        designations={options.designations}
        managers={options.managers}
        canSensitive={ctx.can('people.read_sensitive')}
        canOverrideOnboarding={ctx.can(ONBOARDING_OVERRIDE_PERM)}
        cancelHref="/app/hr/people"
      />
    </>
  )
}
