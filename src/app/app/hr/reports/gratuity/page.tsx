import type { Metadata } from 'next'
import { Download, HandCoins } from 'lucide-react'
import { breadcrumbFor } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { formatDate } from '@/lib/dates'
import { formatINR } from '@/lib/money'
import { TONE_TEXT } from '@/components/ui/badge'
import { buttonClass } from '@/components/ui/button-styles'
import { DataTable, type Column } from '@/components/ui/data-table'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { Callout } from '@/components/muster/payroll/callout'
import { FiguresCard } from '@/components/muster/ui/figures'
import { LIST_FLUSH, ListCard } from '@/components/muster/ui/list-card'
import { gratuityRows, qualifyingSoon, type GratuityRow } from '@/modules/muster/reports/gratuity'

export const metadata: Metadata = { title: 'Gratuity' }
const BASE = '/app/hr/reports/gratuity'
const QUALIFIED: Record<string, string> = { completed_years: '5+ years', '240_days': '4 years + 240 days', death_or_disability: 'Death or disability' }

export default async function GratuityPage() {
  const ctx = await requireMember({ product: 'muster', perm: 'payroll.read', feature: 'muster.payroll' })
  const rows = await gratuityRows(ctx)
  const eligible = rows.filter((r) => r.result.isEligible)
  const liability = eligible.reduce((s, r) => s + r.result.amount, 0)
  const soon = qualifyingSoon(rows)
  const columns: Column<GratuityRow>[] = [
    { key: 'name', header: 'Employee', cell: (r) => <span><span className="text-white">{r.name}</span> <span className="text-xs text-fg-2">{r.code}</span></span> },
    { key: 'status', header: 'Status', hideOnMobile: true },
    { key: 'serviceFrom', header: 'Service from', cell: (r) => <span className="text-[#979797]">{formatDate(r.serviceFrom)}</span> },
    { key: 'served', header: 'Served' },
    { key: 'wageBase', header: 'Monthly wage base', align: 'right', cell: (r) => <span className="tabular-nums">{formatINR(r.wageBase, { decimals: 0 })}</span> },
    { key: 'eligible', header: 'Eligible', cell: (r) => (r.result.isEligible ? <span className={TONE_TEXT.success}>{QUALIFIED[r.result.qualifiedBy ?? ''] ?? 'Yes'}</span> : <span className="text-xs text-fg-2">From {r.result.qualifiesOn ? formatDate(r.result.qualifiesOn) : '—'}</span>) },
    { key: 'years', header: 'Years counted', align: 'right', hideOnMobile: true, cell: (r) => (r.result.isEligible ? r.result.years : '—') },
    { key: 'amount', header: 'Gratuity', align: 'right', cell: (r) => (r.result.isEligible ? <span className="font-semibold tabular-nums text-white">{formatINR(r.result.amount, { decimals: 0 })}{r.result.isCapped ? ' (capped)' : ''}</span> : '—') },
  ]
  return (
    <>
      <PageHeader
        title="Gratuity"
        description="Gratuity due at today's salaries: 15 days' wages per year of service, after five years."
        breadcrumb={breadcrumbFor(BASE)}
        back={{ href: '/app/hr/reports', label: 'HR reports' }}
        actions={<a href="/api/muster/reports/gratuity" download className={buttonClass('secondary')}><Download className="size-4" /> CSV</a>}
      />
      <Callout className="mb-3" tone="info" title="Commonly applied values, not a reading of the Act">
        15/26 of the monthly wage base per year, part-years over six months rounded up, capped at ₹20,00,000. Have your CA confirm before you rely on these figures.
      </Callout>
      <FiguresCard
        className="mb-3"
        items={[
          { label: 'Eligible now', value: eligible.length, hint: `of ${rows.length} with a salary on record` },
          { label: 'Accrued liability', value: formatINR(liability, { decimals: 0 }), hint: 'If everyone eligible left today' },
          { label: 'Qualifying within 12 months', value: soon.length, hint: soon.slice(0, 3).map((r) => r.name).join(', ') || 'Nobody this year' },
        ]}
      />
      <ListCard label="Gratuity by person" icon={<HandCoins />} description="Everyone with a salary on record">
        <DataTable className={LIST_FLUSH} columns={columns} rows={rows} rowKey={(r) => r.id} rowHref={(r) => `/app/hr/people/${r.id}`} empty={<EmptyState compact icon={<HandCoins />} title="Nobody has a salary on record yet" description="Set salary structures first; gratuity is computed from them." />} />
      </ListCard>
    </>
  )
}
