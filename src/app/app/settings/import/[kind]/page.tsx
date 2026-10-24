import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { breadcrumbFor } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { PageHeader } from '@/components/ui/page-header'
import { ImportPanel } from '@/components/imports/import-panel'
import { confirmImportAction, previewImportAction } from '@/modules/imports/actions'
import { IMPORTERS } from '@/modules/imports/registry'
import { isImportKind } from '@/modules/imports/types'
import { first, type SearchParams } from '@/lib/list'
import { IMPORT_HOME, importBack } from '@/modules/imports/entry'
import Link from 'next/link'
import { Notice } from '@/components/settings/surface'

export const metadata: Metadata = { title: 'Import' }

/** The one import screen for `kind`. `?from=` (clients, people, attendance, setup): opened from that page's Import button, so Back and Done return there. */
export default async function ImportKindPage({ params, searchParams }: { params: Promise<{ kind: string }>; searchParams: Promise<SearchParams> }) {
  const [{ kind }, sp] = await Promise.all([params, searchParams])
  const back = importBack(first(sp.from))
  if (!isImportKind(kind)) notFound()
  const home = IMPORT_HOME[kind]
  if (home) redirect(home)
  const importer = IMPORTERS[kind]
  const ctx = await requireMember(importer.product ? { product: importer.product } : {})
  if (!ctx.can(importer.perm)) redirect('/app/denied')
  return (
    <>
      <PageHeader title={`Import ${importer.label.toLowerCase()}`} description={importer.description} breadcrumb={breadcrumbFor('/app/settings/import')} back={back} />
      {kind === 'attendance' ? <Notice tone="info" className="mb-4">From a biometric device instead? Upload its export on <Link href="/app/hr/attendance?view=import" className="text-fg underline-offset-2 hover:underline">Attendance → Import</Link>, which maps device IDs to people.</Notice> : null}
      <ImportPanel kind={kind} label={importer.label} templateHref={`/api/import-template/${kind}`} columns={importer.columns.map((c) => ({ key: c.key, required: c.required, help: c.help }))} preview={previewImportAction} confirm={confirmImportAction} doneHref={back.href} />
    </>
  )
}
