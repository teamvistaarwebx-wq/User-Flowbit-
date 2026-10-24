'use client'

import { Download, FileText, Image as ImageIcon, Link2, Paperclip, Trash2, Upload } from 'lucide-react'
import { useRef, useState, useTransition } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { addLinkAttachment, deleteAttachment, uploadAttachment } from '@/modules/work/tasks/attachment-actions'
import { ATTACHMENT_ACCEPT } from '@/modules/work/tasks/constants'
import { TimeAgo } from '@/components/ui/time-ago'
import { formatBytes } from '@/lib/utils'
import { guard, toast } from '@/lib/toast'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Button, IconButton } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useTaskData } from '../task-data'
import { fileTooLargeMessage, MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL } from '@/lib/upload-limit'

export type AttachmentRow = { id: string; kind: 'file' | 'link'; title: string; url: string; downloadUrl?: string; mime?: string; size?: number; uploadedById: string; uploadedAt?: string }

const previewable = (a: AttachmentRow) => a.kind === 'file' && Boolean(a.mime && (a.mime.startsWith('image/') || a.mime === 'application/pdf'))

/** Files (MAX_UPLOAD_MB each) and links on a task; images and PDFs preview inline. */
export function AttachmentsPanel({ taskId, items, canEdit }: { taskId: string; items: AttachmentRow[]; canEdit: boolean }) {
  const router = useRouter()
  const data = useTaskData()
  const input = useRef<HTMLInputElement>(null)
  const [uploading, start] = useTransition()
  const [preview, setPreview] = useState<AttachmentRow | null>(null)
  const [linking, setLinking] = useState(false)

  const upload = (files: FileList | null) => {
    if (!files?.length) return
    start(guard(async () => {
      for (const file of Array.from(files)) {
        if (file.size > MAX_UPLOAD_BYTES) {
          toast.error(fileTooLargeMessage(file.name))
          continue
        }
        const form = new FormData()
        form.set('taskId', taskId)
        form.set('file', file)
        const res = await uploadAttachment(form)
        if (res.ok) toast.success(res.message ?? `Attached ${file.name}`)
        else toast.error(res.error)
      }
      if (input.current) input.current.value = ''
      router.refresh()
    }, `The upload did not finish. Check the file is under ${MAX_UPLOAD_LABEL} and try again.`))
  }

  return (
    <div className="space-y-3">
      {items.length === 0 ? <p className="text-[13px] text-fg-2">Drop files here or add a link.</p> : null}
      <ul className="space-y-1.5">
        {items.map((a) => (
          <li key={a.id} className="group flex items-center gap-3 rounded-[10px] border border-white/[0.08] bg-white/[0.03] px-3 py-2 transition-colors hover:border-white/[0.16]">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-control text-white">
              {a.kind === 'link' ? <Link2 className="size-4" /> : a.mime?.startsWith('image/') ? <ImageIcon className="size-4" /> : <FileText className="size-4" />}
            </span>
            <div className="min-w-0 flex-1">
              {previewable(a) ? (
                <button type="button" onClick={() => setPreview(a)} className="block max-w-full truncate text-left text-sm font-medium text-white transition-colors hover:text-blush">{a.title}</button>
              ) : (
                <a href={a.url} target="_blank" rel="noopener noreferrer" className="block truncate text-sm font-medium text-white transition-colors hover:text-blush">{a.title}</a>
              )}
              <p className="truncate text-xs text-[#979797]">
                {a.kind === 'link' ? a.url : a.size ? formatBytes(a.size) : 'File'} · {data.nameOf(a.uploadedById)}{a.uploadedAt ? <> · <TimeAgo value={a.uploadedAt} /></> : null}
              </p>
            </div>
            {a.downloadUrl ? (
              <a href={a.downloadUrl} aria-label={`Download ${a.title}`} className="rounded-full p-2 text-fg-3 transition-colors hover:bg-white/[0.06] hover:text-white"><Download className="size-4" /></a>
            ) : null}
            {canEdit ? (
              <ConfirmDialog
                trigger={<IconButton label={`Remove ${a.title}`} size="sm"><Trash2 className="size-3.5" /></IconButton>}
                title={`Remove ${a.title}?`}
                description={a.kind === 'file' ? 'The file is deleted for everyone.' : undefined}
                confirmLabel="Remove"
                onConfirm={() => deleteAttachment({ taskId, attachmentId: a.id })}
              />
            ) : null}
          </li>
        ))}
      </ul>
      {canEdit ? (
        <div
          className="flex flex-wrap gap-2"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            upload(e.dataTransfer.files)
          }}
        >
          <input ref={input} type="file" multiple accept={ATTACHMENT_ACCEPT} className="sr-only" onChange={(e) => upload(e.target.files)} aria-label="Upload files" />
          <Button size="sm" variant="secondary" icon={uploading ? undefined : <Upload className="size-3.5" />} loading={uploading} onClick={() => input.current?.click()}>
            {uploading ? 'Uploading…' : 'Upload files'}
          </Button>
          <Button size="sm" variant="ghost" icon={<Paperclip className="size-3.5" />} onClick={() => setLinking(true)}>
            Add link
          </Button>
        </div>
      ) : null}
      <Dialog open={linking} onOpenChange={setLinking} title="Add a link" size="sm">
        <ActionForm action={addLinkAttachment} onDone={() => setLinking(false)} className="space-y-4">
          <input type="hidden" name="taskId" value={taskId} />
          <FormField name="title" label="Title" required>
            <Input id="title" name="title" placeholder="Figma — homepage v2" />
          </FormField>
          <FormField name="url" label="URL" required>
            <Input id="url" name="url" type="url" placeholder="https://" />
          </FormField>
          <div className="flex justify-end"><SubmitButton>Add link</SubmitButton></div>
        </ActionForm>
      </Dialog>
      <Dialog open={Boolean(preview)} onOpenChange={(open) => !open && setPreview(null)} title={preview?.title ?? 'Preview'} size="xl">
        {preview?.mime === 'application/pdf' ? (
          <iframe src={preview.url} title={preview.title} className="h-[70vh] w-full rounded-[10px] border border-white/[0.12] bg-white" />
        ) : preview ? (
          // unoptimized: /api/files checks the viewer's session, which the image optimizer would not send
          <Image src={preview.url} alt={preview.title} width={1200} height={900} unoptimized loading="eager" className="mx-auto h-auto max-h-[70vh] w-auto max-w-full rounded-[10px]" />
        ) : null}
      </Dialog>
    </div>
  )
}
