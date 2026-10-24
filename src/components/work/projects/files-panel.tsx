'use client'

import { Download, FileText, Link2, Trash2, Upload } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useRef, useTransition, type ReactNode } from 'react'
import { deleteProjectFile, uploadProjectFile } from '@/modules/work/projects/file-actions'
import type { FileRow } from '@/modules/work/projects/detail'
import { ATTACHMENT_ACCEPT } from '@/modules/work/tasks/constants'
import { TimeAgo } from '@/components/ui/time-ago'
import { formatBytes } from '@/lib/utils'
import { guard, toast } from '@/lib/toast'
import { Button, IconButton } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import type { Person } from '../tasks/types'
import { fileTooLargeMessage, MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL } from '@/lib/upload-limit'


function FileLine({ file, people, action }: { file: FileRow; people: Map<string, Person>; action?: ReactNode }) {
  return (
    <li className="flex items-center gap-3 rounded-[10px] border border-white/[0.08] bg-white/[0.03] px-3 py-2 transition-colors hover:border-white/[0.16]">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-control text-white">{file.isLink ? <Link2 className="size-4" /> : <FileText className="size-4" />}</span>
      <div className="min-w-0 flex-1">
        <a href={file.url} target="_blank" rel="noopener noreferrer" className="block truncate text-sm font-medium text-white transition-colors hover:text-blush">{file.name}</a>
        <p className="truncate text-xs text-[#979797]">
          {file.size ? `${formatBytes(file.size)} · ` : ''}{people.get(file.uploadedById)?.name ?? 'Someone'}{file.uploadedAt ? <> · <TimeAgo value={file.uploadedAt} /></> : null}
          {file.taskId ? <> · <Link href={`/app/work/tasks/${file.taskId}`} className="transition-colors hover:text-white">{file.taskKey}</Link></> : null}
        </p>
      </div>
      {file.downloadUrl ? <a href={file.downloadUrl} aria-label={`Download ${file.name}`} className="rounded-full p-2 text-fg-3 transition-colors hover:bg-white/[0.06] hover:text-white"><Download className="size-4" /></a> : null}
      {action}
    </li>
  )
}

/** Project uploads (anyone on the project) and a read-only roll-up of task attachments. */
export function FilesPanel({ projectId, uploads, taskFiles, people, me, canManage }: { projectId: string; uploads: FileRow[]; taskFiles: FileRow[]; people: Person[]; me: string; canManage: boolean }) {
  const router = useRouter()
  const input = useRef<HTMLInputElement>(null)
  const [pending, start] = useTransition()
  const byId = new Map(people.map((p) => [p.id, p]))
  const upload = (files: FileList | null) => {
    if (!files?.length) return
    start(guard(async () => {
      for (const file of Array.from(files)) {
        if (file.size > MAX_UPLOAD_BYTES) {
          toast.error(fileTooLargeMessage(file.name))
          continue
        }
        const form = new FormData()
        form.set('projectId', projectId)
        form.set('file', file)
        const res = await uploadProjectFile(form)
        if (res.ok) toast.success(res.message ?? `Uploaded ${file.name}`)
        else toast.error(res.error)
      }
      if (input.current) input.current.value = ''
      router.refresh()
    }, `The upload did not finish. Check the file is under ${MAX_UPLOAD_LABEL} and try again.`))
  }
  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="section-label">Project files</h3>
          <input ref={input} type="file" multiple accept={ATTACHMENT_ACCEPT} className="sr-only" onChange={(e) => upload(e.target.files)} aria-label="Upload project files" />
          <Button size="sm" variant="primary" icon={<Upload className="size-3.5" />} loading={pending} onClick={() => input.current?.click()}>{pending ? 'Uploading…' : 'Upload'}</Button>
        </div>
        {uploads.length === 0 ? <EmptyState compact icon={<FileText />} title="No files yet" description={`Briefs, contracts and assets for this project. ${MAX_UPLOAD_LABEL} per file.`} /> : null}
        <ul className="space-y-2">
          {uploads.map((f) => (
            <FileLine
              key={f.id}
              file={f}
              people={byId}
              action={
                f.uploadedById === me || canManage ? (
                  <ConfirmDialog trigger={<IconButton label={`Delete ${f.name}`} size="sm"><Trash2 className="size-3.5" /></IconButton>} title={`Delete ${f.name}?`} description="The file is removed for everyone." confirmLabel="Delete file" onConfirm={() => deleteProjectFile({ projectId, fileId: f.id })} />
                ) : undefined
              }
            />
          ))}
        </ul>
      </section>
      <section className="space-y-3">
        <h3 className="section-label">From tasks</h3>
        {taskFiles.length === 0 ? <p className="text-[13px] text-fg-2">No task attachments in this project yet.</p> : null}
        <ul className="space-y-2">{taskFiles.map((f) => <FileLine key={`${f.taskId}-${f.id}`} file={f} people={byId} />)}</ul>
      </section>
    </div>
  )
}
