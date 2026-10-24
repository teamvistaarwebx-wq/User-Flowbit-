import type { Metadata } from 'next'
import { Landmark, Layers, UserRound } from 'lucide-react'
import { breadcrumbFor } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { first, type SearchParams } from '@/lib/list'
import { PageHeader } from '@/components/ui/page-header'
import { LinkTabs } from '@/components/ui/tabs'
import { ComponentsTab, StatutoryTab } from '@/components/muster/payroll/settings-tabs'
import { StructuresTab } from '@/components/muster/payroll/structures-tab'

export const metadata: Metadata = { title: 'Salary structures' }
const BASE = '/app/hr/payroll/structures'

export default async function SalaryStructuresPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  // Muster spec: payroll.read views every tab; the tabs gate their own writes (people.salary, hr.settings).
  const ctx = await requireMember({ product: 'muster', feature: 'muster.payroll', perm: 'payroll.read' })
  const raw = first(sp.tab)
  const tab = raw === 'components' || raw === 'statutory' ? raw : 'structures'
  return (
    <>
      <PageHeader
        title="Salary structures"
        description="What each person is paid, the components pay is split into, and the PF, ESI and PT rates in force."
        breadcrumb={breadcrumbFor(BASE)}
        back={{ href: '/app/hr/payroll', label: 'Payroll' }}
      >
        <LinkTabs
          tabs={[
            { href: BASE, label: 'Employee structures', icon: <UserRound /> },
            { href: `${BASE}?tab=components`, label: 'Components', icon: <Layers /> },
            { href: `${BASE}?tab=statutory`, label: 'Statutory', icon: <Landmark /> },
          ]}
        />
      </PageHeader>
      {tab === 'structures' ? <StructuresTab ctx={ctx} sp={sp} employeeId={first(sp.employee)} q={first(sp.q)} /> : tab === 'components' ? <ComponentsTab ctx={ctx} /> : <StatutoryTab ctx={ctx} />}
    </>
  )
}
