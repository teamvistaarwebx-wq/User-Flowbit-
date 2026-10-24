import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronRight, Upload } from 'lucide-react'
import { breadcrumbFor } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { Card, CardHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { ImportHistory } from '@/components/imports/import-history'
import { undoImportAction } from '@/modules/imports/actions'
import { importHistory } from '@/modules/imports/history'
import { IMPORTERS } from '@/modules/imports/registry'
import { IMPORT_KINDS, isImportKind } from '@/modules/imports/types'
import { importHref } from '@/modules/imports/entry'

export const metadata: Metadata = { title: 'Import' }

/** Settings → Import (console spec 9): every importer this person may run, and the history with Undo (7 days). */
export default async function ImportHubPage() {
  const ctx = await requireMember()
  const usable = IMPORT_KINDS.filter((k) => {
    const importer = IMPORTERS[k]
    return (!importer.product || ctx.has(importer.product)) && ctx.can(importer.perm)
  })
  const history = await importHistory(ctx.db, (row) => isImportKind(row.kind) && usable.includes(row.kind))
  return (
    <>
      <PageHeader title="Import" description="Bring your data in from a spreadsheet: download a template, upload it, check every row, then confirm." breadcrumb={breadcrumbFor('/app/settings/import')} />
      <Card className="rounded-[16px]">
        <CardHeader label="What you can import" icon={<Upload strokeWidth={1.5} />} description="CSV or Excel (.xlsx). Nothing is saved until you confirm, and each import can be undone for 7 days." />
        {usable.length ? (
          <ul className="-mx-5 border-t border-line">
            {usable.map((k) => (
              <li key={k}>
                <Link href={importHref(k)} className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-white/[0.04]">
                  <span className="min-w-0"><span className="block text-sm text-white">{IMPORTERS[k].label}</span><span className="block text-xs text-fg-2">{IMPORTERS[k].description}</span></span>
                  <ChevronRight className="size-4 shrink-0 text-fg-2" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState compact icon={<Upload />} title="Nothing to import with your role" description="Ask a workspace admin for access, or ask them to run the import." />
        )}
      </Card>
      <div className="mt-5"><ImportHistory rows={history} undo={undoImportAction} /></div>
    </>
  )
}
