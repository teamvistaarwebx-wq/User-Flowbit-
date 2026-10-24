'use client'

import { Upload } from 'lucide-react'
import { useState } from 'react'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { FileUpload } from '@/components/ui/file-upload'
import { Input, NativeSelect } from '@/components/ui/input'
import { uploadMyDocument } from '@/modules/muster/me/document-actions'
import { uploadEmployeeDocument } from '@/modules/muster/people/record-actions'
import { docLabel, DOCUMENT_TYPES } from '@/modules/muster/settings/defaults'
import { MAX_UPLOAD_LABEL } from '@/lib/upload-limit'

type Props = {
  /** HR filing on someone's record; leave out for the signed-in person's own upload. */
  employeeId?: string
  suggested?: string
  label?: string
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'violet'
}

/** File a document (PDF or image, up to MAX_UPLOAD_MB) on an employee's record, or on your own from self-service. */
export function DocumentUpload({ employeeId, suggested, label = 'Upload document', variant = 'primary' }: Props) {
  const [open, setOpen] = useState(false)
  const self = !employeeId
  return (
    <Dialog open={open} onOpenChange={setOpen} trigger={<Button variant={variant} size="sm" icon={<Upload className="size-4" />}>{label}</Button>} title={self ? 'Upload a document' : 'File a document'} description={`PDF, PNG, JPEG, WebP or HEIC, up to ${MAX_UPLOAD_LABEL}. A clear photo of the page is fine.`}>
      <ActionForm action={self ? uploadMyDocument : uploadEmployeeDocument} onDone={() => setOpen(false)} resetOnSuccess className="space-y-4">
        {employeeId ? <input type="hidden" name="employeeId" value={employeeId} /> : null}
        <FormField name="docType" label="Document type" required>
          <NativeSelect id="docType" name="docType" defaultValue={suggested ?? DOCUMENT_TYPES[0]} options={DOCUMENT_TYPES.map((t) => ({ value: t, label: docLabel(t) }))} />
        </FormField>
        <FormField name="file" label="File" required>
          <FileUpload name="file" accept="application/pdf,image/png,image/jpeg,image/webp,image/heic,image/heif" hint="One file" />
        </FormField>
        <FormField name="notes" label="Notes"><Input id="notes" name="notes" placeholder="Optional" /></FormField>
        {self ? null : <FormField name="expiresOn" label="Expires on" help="For IDs, contracts and visas: HR is reminded 30 days before."><Input id="expiresOn" name="expiresOn" type="date" /></FormField>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <SubmitButton pendingLabel="Uploading…">Upload</SubmitButton>
        </div>
      </ActionForm>
    </Dialog>
  )
}
