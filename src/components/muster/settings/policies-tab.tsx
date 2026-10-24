'use client'

import { Archive, BookOpenText, Download, Upload } from 'lucide-react'
import { formatDate } from '@/lib/dates'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Badge } from '@/components/ui/badge'
import { buttonClass } from '@/components/ui/button-styles'
import { Card, CardHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { FileUpload } from '@/components/ui/file-upload'
import { Input } from '@/components/ui/input'
import { ActionButton } from '@/components/muster/people/action-button'
import { archivePolicyDocument, uploadPolicyDocument } from '@/modules/muster/settings/rule-actions'
import { ListCard, ListRow, ListRows } from '../ui/list-card'
import { MAX_UPLOAD_LABEL } from '@/lib/upload-limit'

type Row = { id: string; title: string; category: string | null; description: string | null; fileUrl: string; publishedBy: string | null; createdAt: string }

/** Company policy PDFs, shown to everyone under My documents. */
export function PoliciesTab({ rows, canWrite }: { rows: Row[]; canWrite: boolean }) {
  return (
    <div className="grid grid-cols-12 gap-4">
      {canWrite ? (
        <Card variant="solid" className="col-span-12 self-start lg:col-span-5">
          <CardHeader label="Publish a policy" icon={<Upload />} description={`PDF up to ${MAX_UPLOAD_LABEL}.`} />
          <ActionForm action={uploadPolicyDocument} resetOnSuccess className="space-y-4">
            <FormField name="title" label="Title" required><Input id="title" name="title" placeholder="Leave policy 2026" /></FormField>
            <FormField name="category" label="Category"><Input id="category" name="category" placeholder="Leave, Code of conduct…" /></FormField>
            <FormField name="description" label="Summary"><Input id="description" name="description" placeholder="One line on what it covers" /></FormField>
            <FormField name="file" label="PDF" required><FileUpload name="file" accept="application/pdf" /></FormField>
            <div className="flex justify-end"><SubmitButton pendingLabel="Publishing…">Publish</SubmitButton></div>
          </ActionForm>
        </Card>
      ) : null}
      <ListCard className={canWrite ? 'col-span-12 lg:col-span-7' : 'col-span-12'} label="Published policies" icon={<BookOpenText />} description={`${rows.length} ${rows.length === 1 ? 'document' : 'documents'} everyone can read`}>
        {rows.length ? (
          <ListRows>
            {rows.map((r) => (
              <ListRow key={r.id}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-white">{r.title} {r.category ? <Badge className="ml-1">{r.category}</Badge> : null}</span>
                  <span className="block truncate text-xs text-fg-2">{r.description ? `${r.description} · ` : ''}{r.publishedBy ?? 'HR'}, {formatDate(r.createdAt)}</span>
                </span>
                <a href={r.fileUrl} target="_blank" rel="noreferrer" className={buttonClass('secondary', 'sm')}><Download className="size-3.5" /> Open</a>
                {canWrite ? <ActionButton action={archivePolicyDocument} input={{ id: r.id }} label="Archive" icon={<Archive className="size-3.5" />} title={`Archive "${r.title}"?`} description="Employees stop seeing it." confirmLabel="Archive" reason={{ label: 'Reason', required: true, placeholder: 'Replaced by the 2027 version' }} /> : null}
              </ListRow>
            ))}
          </ListRows>
        ) : (
          <EmptyState compact icon={<BookOpenText />} title="No policies published" description="Upload the handbook, leave policy and code of conduct for everyone to read." />
        )}
      </ListCard>
    </div>
  )
}
