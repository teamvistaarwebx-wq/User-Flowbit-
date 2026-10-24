import type { Metadata } from 'next'
import { breadcrumbFor } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { first, type SearchParams } from '@/lib/list'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { NewLetterForm } from '@/components/muster/letters/new-letter-form'
import { Employee } from '@/models/muster/Employee'
import { payLetterCodes } from '@/modules/muster/letters/queries'
import { statusLabelOf } from '@/modules/muster/people/lifecycle'
import { visibleEmployeeIds, visibleFilter } from '@/modules/muster/people/scope'

/** Server actions on this page can render PDFs, send email or process many rows. */
export const maxDuration = 300

export const metadata: Metadata = { title: 'New letter' }

export default async function NewLetterPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const ctx = await requireMember({ product: 'muster', perm: 'letters.write' })
  const [people, payCodes] = await Promise.all([
    ctx.db(Employee).find({ deletedAt: null, ...visibleFilter(await visibleEmployeeIds(ctx)) }, { fullName: 1, code: 1, status: 1, employmentType: 1 }).sort({ fullName: 1 }).lean(),
    payLetterCodes(ctx),
  ])
  // ?employee= from a person's profile preselects them (only someone this reader can see).
  const preset = first(sp.employee)
  const defaultEmployee = people.some((p) => String(p._id) === preset) ? preset : undefined
  return (
    <>
      <PageHeader title="New letter" description="It is drafted with the person's details filled in. Check the wording, then issue it." breadcrumb={breadcrumbFor('/app/hr/letters/new')} back={{ href: '/app/hr/letters', label: 'Letters' }} />
      <Card variant="solid" className="max-w-4xl">
        <NewLetterForm
          people={people.map((p) => ({ id: String(p._id), label: `${p.fullName} (${p.code})`, status: p.status, employmentType: p.employmentType, statusLabel: statusLabelOf(p.status) }))}
          defaultEmployee={defaultEmployee}
          payCodes={[...payCodes]}
          canSeePay={ctx.can('payroll.read')}
        />
      </Card>
    </>
  )
}
