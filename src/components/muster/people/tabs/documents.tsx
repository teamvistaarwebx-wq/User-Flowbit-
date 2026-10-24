import { Archive, Download, FileText } from 'lucide-react'
import { formatDate } from '@/lib/dates'
import { buttonClass } from '@/components/ui/button-styles'
import { EmptyState } from '@/components/ui/empty-state'
import { EmployeeDocument } from '@/models/muster/EmployeeDocument'
import { archiveEmployeeDocument } from '@/modules/muster/people/record-actions'
import { docLabel } from '@/modules/muster/settings/defaults'
import { getPolicy } from '@/modules/muster/settings/queries'
import { ListCard, ListRow, ListRows } from '../../ui/list-card'
import { ActionButton } from '../action-button'
import { DocumentUpload } from '../document-upload'
import type { TabProps } from './types'

const size = (bytes?: number | null) => (!bytes ? '—' : bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`)

/** Documents tab: files on record; download needs people.read_sensitive; archive keeps the trail. */
export async function DocumentsTab({ ctx, employee: e }: TabProps) {
  const [docs, policy] = await Promise.all([ctx.db(EmployeeDocument).find({ employeeId: e._id, deletedAt: null }).sort({ createdAt: -1 }).lean(), getPolicy(ctx)])
  const canWrite = ctx.can('people.write')
  const canDownload = ctx.can('people.read_sensitive')
  const missing = policy.onboarding.mandatoryDocuments.filter((d) => !docs.some((x) => x.docType === d))
  return (
    <ListCard label="Documents" icon={<FileText />} description={missing.length ? `Still needed: ${missing.map(docLabel).join(', ')}.` : 'Every mandatory document is on file.'} actions={canWrite ? <DocumentUpload variant="violet" employeeId={String(e._id)} suggested={missing[0]} /> : null}>
      {docs.length ? (
        <ListRows>
          {docs.map((d) => (
            <ListRow key={String(d._id)}>
              <FileText className="size-4 shrink-0 text-icon-muted" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-white">{docLabel(d.docType)}</p>
                <p className="truncate text-xs text-fg-2">{d.fileName} · {size(d.sizeBytes)} · {d.uploadedByName ?? 'HR'}, {formatDate(d.createdAt)}{d.notes ? ` · ${d.notes}` : ''}</p>
              </div>
              {canDownload ? (
                <a href={`/api/muster/people/documents/${d._id}`} className={buttonClass('secondary', 'sm')} target="_blank" rel="noreferrer"><Download className="size-3.5" /> Open</a>
              ) : null}
              {canWrite ? (
                <ActionButton action={archiveEmployeeDocument} input={{ id: String(d._id) }} label="Archive" icon={<Archive className="size-3.5" />} title={`Archive ${docLabel(d.docType)}?`} description="It disappears from the record but stays in the audit trail." confirmLabel="Archive" reason={{ label: 'Reason', required: true, placeholder: 'Uploaded the wrong file' }} />
              ) : null}
            </ListRow>
          ))}
        </ListRows>
      ) : (
        <EmptyState compact icon={<FileText />} title="No documents yet" description="Upload marksheets, ID proof and signed letters here." />
      )}
    </ListCard>
  )
}
