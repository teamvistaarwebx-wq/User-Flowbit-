import type { Metadata } from 'next'
import { Download, FileCode2, Settings2 } from 'lucide-react'
import { breadcrumbFor } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { todayIST } from '@/lib/dates'
import { buildHref, first, type SearchParams } from '@/lib/list'
import { Badge } from '@/components/ui/badge'
import { buttonClass } from '@/components/ui/button-styles'
import { DownloadLink } from '@/components/ui/download-link'
import { PageHeader } from '@/components/ui/page-header'
import { FirmSwitch } from '@/components/folio/FirmSwitch'
import { PeriodPicker } from '@/components/folio/PeriodPicker'
import { Callout } from '@/components/folio/SetupCallout'
import { TallyLedgerForm } from '@/components/folio/settings/TallyLedgerForm'
import { GlassCard, PanelHeader, SegmentLinks } from '@/components/folio/ui'
import { rangeLabel, resolveBoundedPeriod } from '@/modules/folio/engine/period'
import { firmContext } from '@/modules/folio/queries/common'
import { getFolioSettings } from '@/modules/folio/settings/queries'
import type { TallyLedgers } from '@/modules/folio/tally/ledgers'

export const metadata: Metadata = { title: 'Export to Tally' }

const BASE = '/app/folio/export'

/** Folio → Export → Tally: pick a period and firm, download the XML; owners map ledger names below. */
export default async function FolioExportPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const ctx = await requireMember({ product: 'folio', perm: 'folio.reports' })
  const today = todayIST()
  const period = resolveBoundedPeriod({ period: first(sp.period), from: first(sp.from), to: first(sp.to) }, today, 'this_month')
  const [{ firms, firm }, settings] = await Promise.all([firmContext(ctx, first(sp.firm)), getFolioSettings(ctx)])
  const masters = first(sp.masters) === '1'
  const journal = first(sp.expenses) === 'journal'
  const stored = (settings.tally ?? {}) as Partial<TallyLedgers> & { company?: string }
  const download = buildHref('/api/folio/export/tally', {}, { firm: firm?.code, period: period.key, from: period.key === 'custom' ? period.from : undefined, to: period.key === 'custom' ? period.to : undefined, masters: masters ? '1' : undefined, expenses: journal ? 'journal' : undefined })
  const toggle = (patch: Record<string, string | undefined>) => buildHref(BASE, sp, patch)
  const canExpenses = ctx.can('expenses.read')

  return (
    <>
      <PageHeader title="Export to Tally" icon={<FileCode2 />} breadcrumb={breadcrumbFor(BASE)} description="Invoices, credit notes, receipts and expenses as a Tally XML file your CA can import.">
        <div className="flex flex-wrap items-center gap-3">
          <FirmSwitch base={BASE} params={sp} firms={firms} firm={firm} />
          <PeriodPicker base={BASE} params={sp} period={period} today={today} />
        </div>
      </PageHeader>

      <Callout className="mb-4" title="Beta: verify a test import in Tally">
        Import into a test company (or take a backup) first and check a few vouchers and the GST ledgers. Create the ledgers named below in Tally, or tick party masters to create client ledgers with the import.
      </Callout>

      <div className="grid grid-cols-12 gap-4">
        <GlassCard className="col-span-12 lg:col-span-5">
          <PanelHeader icon={<Download />} title="Tally XML" subtitle={`${firm ? firm.name : 'All firms'} · ${rangeLabel(period.from, period.to)}`} actions={<Badge tone="warning">Beta</Badge>} />
          <ul className="mt-4 space-y-1.5 text-sm text-fg-2">
            <li>Sales vouchers: party, income and CGST/SGST/IGST by rate</li>
            <li>Credit notes and receipt vouchers (with TDS withheld)</li>
            <li>{canExpenses ? 'Expenses as payment or journal vouchers, with claimable GST' : 'Expenses are left out: you cannot view expenses'}</li>
          </ul>
          <div className="mt-5 space-y-3">
            <SegmentLinks label="Party masters" items={[{ href: toggle({ masters: undefined }), label: 'Vouchers only', active: !masters }, { href: toggle({ masters: '1' }), label: 'With client ledgers', active: masters }]} />
            {canExpenses ? <SegmentLinks label="Expense vouchers" items={[{ href: toggle({ expenses: undefined }), label: 'Expenses as Payment', active: !journal }, { href: toggle({ expenses: 'journal' }), label: 'As Journal', active: journal }]} /> : null}
          </div>
          <DownloadLink className={`${buttonClass('primary')} mt-5`} href={download} fallbackName="tally.xml">
            <Download className="size-4" /> Download Tally XML
          </DownloadLink>
        </GlassCard>
        <GlassCard className="col-span-12 lg:col-span-7">
          <PanelHeader icon={<Settings2 />} title="Tally ledger names" subtitle="Match these to the ledgers in your Tally company. Blank fields use the default shown." />
          <div className="mt-5">
            {ctx.can('folio.settings') ? <TallyLedgerForm company={stored.company ?? ''} stored={stored} /> : <p className="text-sm text-fg-2">Someone with Folio settings access can change the ledger names.</p>}
          </div>
        </GlassCard>
      </div>
    </>
  )
}
