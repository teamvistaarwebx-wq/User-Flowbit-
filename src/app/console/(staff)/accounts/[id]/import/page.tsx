import type { Metadata } from 'next'
import Link from 'next/link'
import { isValidObjectId } from 'mongoose'
import { notFound } from 'next/navigation'
import { ShieldAlert } from 'lucide-react'
import { requireStaff } from '@/lib/console/session'
import { internalLocked, staffImportRefusal } from '@/lib/console/support-access'
import { first, type SearchParams } from '@/lib/list'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { FilterPills } from '@/components/settings/filter-pills'
import { ImportHistory } from '@/components/imports/import-history'
import { ImportPanel } from '@/components/imports/import-panel'
import { Org } from '@/models/Org'
import { SupportAccess } from '@/models/console/SupportAccess'
import { staffConfirmImport, staffPreviewImport, staffUndoImport } from '@/modules/console/import-actions'
import { importHistory } from '@/modules/imports/history'
import { IMPORTERS } from '@/modules/imports/registry'
import { IMPORT_KINDS, isImportKind } from '@/modules/imports/types'

export const metadata: Metadata = { title: 'Import for a workspace' }

/** Staff-run import (console spec 9): only after the owner's DPA and a running 7-day import grant. */
export default async function StaffImportPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams])
  const p = await requireStaff('import.run')
  if (!isValidObjectId(id)) notFound()
  const org = await p.raw(Org).findById(id, { name: 1, dpa: 1, enabledProducts: 1, 'subscription.accountType': 1 }).lean()
  if (!org || internalLocked(org.subscription?.accountType, p.staff.isFounder)) notFound()
  const db = p.forOrg(org._id).db
  const refusal = staffImportRefusal({ dpa: org.dpa, grants: await db(SupportAccess).find({ mode: 'import', staffId: p.staff.id }).lean() })
  const back = { href: `/console/accounts/${id}`, label: org.name }
  if (refusal) {
    return (
      <>
        <PageHeader title={`Import for ${org.name}`} back={back} />
        <EmptyState icon={<ShieldAlert />} title="Not allowed yet" description={refusal} action={<Link href={back.href} className="text-link">Back to the account</Link>} />
      </>
    )
  }
  const kindParam = first(sp.kind)
  const kind = isImportKind(kindParam) ? kindParam : 'team'
  const importer = IMPORTERS[kind]
  const history = await importHistory(db, (row) => row.source === 'staff')
  const base = `/console/accounts/${id}/import`
  return (
    <>
      <PageHeader title={`Import for ${org.name}`} description="Runs with the owner's approval. The workspace's history shows these as imported by the Flowbit team." back={back}>
        <FilterPills label="What to import" items={IMPORT_KINDS.map((k) => ({ href: `${base}?kind=${k}`, label: IMPORTERS[k].label, active: k === kind }))} />
      </PageHeader>
      <ImportPanel kind={kind} label={importer.label} templateHref={`/api/import-template/${kind}`} columns={importer.columns.map((c) => ({ key: c.key, required: c.required, help: c.help }))} hidden={{ orgId: id }} preview={staffPreviewImport} confirm={staffConfirmImport} />
      <div className="mt-5">
        <ImportHistory rows={history} undo={staffUndoImport} hidden={{ orgId: id }} />
      </div>
    </>
  )
}
