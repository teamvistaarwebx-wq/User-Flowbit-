import { Contact, History, Image as ImageIcon, ListChecks, Mail, Phone } from 'lucide-react'
import { LogoUpload } from '@/components/ui/logo-upload'
import { ClientMark } from '@/components/clients/client-mark'
import { removeClientLogo, uploadClientLogo } from '@/modules/clients/logo-actions'
import { formatINRCompact } from '@/lib/money'
import { cn } from '@/lib/utils'
import { StatCard } from '@/components/ui/stat-card'
import { ActivityList } from '@/components/orbit/activity-row'
import { PanelHeader, SolidCard, TableCard } from '@/components/orbit/parts'
import { ClientForm } from '@/components/clients/client-form'
import type { ClientValues } from '@/modules/clients/values'
import type { ActivityItem } from '@/modules/orbit/record-types'
import { FolioBillingProfile } from './folio-tabs'

/** One row of stat cards at desktop width, whatever products are on. */
const TILE_COLUMNS: Record<number, string> = { 1: 'lg:grid-cols-1', 2: 'lg:grid-cols-2', 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4', 5: 'lg:grid-cols-5' }

type Overview = { cols: { orbit: boolean; folio: boolean; work: boolean }; openPaise: number; wonPaise: number; projects: number; outstandingPaise: number; overduePaise: number; recent: ActivityItem[] }
type Option = { value: string; label: string; hint?: string }

export function OverviewTab({ clientId, clientName, clientKind, logoUrl, values, overview, primary, options, canEdit, today }: { clientId: string; clientName: string; clientKind?: string; logoUrl: string | null; values: ClientValues; overview: Overview; primary: { name: string; email?: string | null; phone?: string | null; role?: string | null } | null; options: { owners: Option[]; sources: Option[] | null; sectors: Option[] | null }; canEdit: boolean; today: string }) {
  const { cols } = overview
  const tiles = (cols.orbit ? 2 : 0) + (cols.work ? 1 : 0) + (cols.folio ? 2 : 0)
  return (
    <div className="grid grid-cols-12 gap-3 xl:gap-[15px]">
      {tiles ? (
        <div className={cn('col-span-12 grid grid-cols-2 gap-3', TILE_COLUMNS[tiles] ?? 'lg:grid-cols-4')}>
          {cols.orbit ? <StatCard label="Open pipeline" value={formatINRCompact(overview.openPaise)} color="var(--info)" hint="Open deals at full value" href={`/app/clients/${clientId}?tab=deals`} /> : null}
          {cols.orbit ? <StatCard label="Won lifetime" value={formatINRCompact(overview.wonPaise)} color="var(--success)" hint="Every deal closed won" /> : null}
          {cols.work ? <StatCard label="Active projects" value={overview.projects} color="#8E8DFF" hint="Running in Work" href={`/app/clients/${clientId}?tab=projects`} /> : null}
          {cols.folio ? <StatCard label="Outstanding" value={formatINRCompact(overview.outstandingPaise)} color="var(--orange)" hint="Issued and not yet paid" href={`/app/clients/${clientId}?tab=invoices`} /> : null}
          {cols.folio ? <StatCard label="Overdue" value={formatINRCompact(overview.overduePaise)} color="var(--danger)" hint="Past the due date" /> : null}
        </div>
      ) : null}
      <SolidCard className="col-span-12 rounded-[12px] lg:col-span-8">
        <div id="details" className="scroll-mt-4" />
        <PanelHeader icon={<ListChecks />} title="Details" subtitle="GSTIN and state decide CGST + SGST or IGST on Folio invoices." className="mb-5" />
        <ClientForm values={values} owners={options.owners} sources={options.sources} sectors={options.sectors} canEdit={canEdit} compact />
      </SolidCard>
      <div className="col-span-12 space-y-3 lg:col-span-4">
        {canEdit || logoUrl ? (
          <SolidCard>
            <PanelHeader icon={<ImageIcon />} title="Logo" subtitle="Shows on this client's tasks. JPEG or PNG." className="mb-3" />
            <LogoUpload logoUrl={logoUrl} disabled={!canEdit} fields={{ clientId }} upload={uploadClientLogo} remove={removeClientLogo} fallback={<ClientMark name={clientName} kind={clientKind} />} />
          </SolidCard>
        ) : null}
        <SolidCard>
          <PanelHeader icon={<Contact />} title="Primary contact" className="mb-3" />
          {primary ? (
            <div className="space-y-2 text-sm">
              <div>
                <p className="text-white">{primary.name}</p>
                {primary.role ? <p className="text-xs text-[#979797]">{primary.role}</p> : null}
              </div>
              {primary.email ? <a href={`mailto:${primary.email}`} className="flex items-center gap-2 text-white transition-colors hover:text-blush"><Mail className="size-4 text-icon-muted" />{primary.email}</a> : null}
              {primary.phone ? <a href={`tel:${primary.phone}`} className="flex items-center gap-2 tabular-nums text-white transition-colors hover:text-blush"><Phone className="size-4 text-icon-muted" />{primary.phone}</a> : null}
            </div>
          ) : (
            <p className="text-[13px] text-fg-2">No contacts yet. Add one on the Contacts tab.</p>
          )}
        </SolidCard>
        {cols.folio ? <FolioBillingProfile clientId={clientId} /> : null}
        {cols.orbit ? (
          <TableCard icon={<History />} title="Recent activity">
            <div className="border-t border-line px-[11px] py-2">
              <ActivityList items={overview.recent} today={today} canAct={false} showRelated empty="No activity yet." />
            </div>
          </TableCard>
        ) : null}
      </div>
    </div>
  )
}
