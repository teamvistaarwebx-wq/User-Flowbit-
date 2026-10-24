'use client'

import { useEffect, useRef, useState, type DragEvent } from 'react'
import { FileText, UploadCloud, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { play } from '@/lib/sound'
import { fileTooLargeMessage, MAX_UPLOAD_MB } from '@/lib/upload-limit'

const MB = 1024 * 1024

const sizeLabel = (bytes: number) => (bytes >= MB / 10 ? `${(bytes / MB).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`)

export type FileUploadProps = {
  /** Form field name; files are submitted with the form. */
  name: string
  accept?: string
  multiple?: boolean
  /** Max size per file in MB (checked on the client; the server checks again). */
  maxMb?: number
  hint?: string
  className?: string
  onFiles?: (files: File[]) => void
}

/** Drag-and-drop file picker that keeps a real <input type=file> for FormData. */
export function FileUpload({ name, accept, multiple, maxMb = MAX_UPLOAD_MB, hint, className, onFiles }: FileUploadProps) {
  const input = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<File[]>([])
  const [over, setOver] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // A form reset (e.g. ActionForm resetOnSuccess) clears the native input; clear the list shown with it.
  useEffect(() => {
    const form = input.current?.form
    if (!form) return
    const onReset = () => {
      setFiles([])
      setError(null)
    }
    form.addEventListener('reset', onReset)
    return () => form.removeEventListener('reset', onReset)
  }, [])

  const apply = (list: FileList | null) => {
    if (!list) return
    const picked = Array.from(list)
    const tooBig = picked.find((f) => f.size > maxMb * MB)
    if (tooBig) {
      // Drop the pick from the native input too, or the form still submits it and the server refuses the body.
      if (input.current) input.current.value = ''
      setFiles([])
      onFiles?.([])
      setError(fileTooLargeMessage(tooBig.name, maxMb))
      play('error')
      return
    }
    setError(null)
    setFiles(picked)
    onFiles?.(picked)
    play('pop')
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setOver(false)
    if (!input.current) return
    const dt = new DataTransfer()
    Array.from(e.dataTransfer.files)
      .slice(0, multiple ? undefined : 1)
      .forEach((f) => dt.items.add(f))
    input.current.files = dt.files
    apply(dt.files)
  }

  const clear = () => {
    if (input.current) input.current.value = ''
    setFiles([])
    setError(null)
    onFiles?.([])
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={cn(
          'flex w-full flex-col items-center justify-center gap-2 rounded-[12px] border border-dashed px-4 py-7 text-center transition-colors',
          over ? 'border-white/50 bg-white/[0.06]' : 'border-white/[0.2] bg-white/[0.03] hover:border-white/[0.35] hover:bg-white/[0.05]',
        )}
      >
        <UploadCloud className="size-6 text-icon-muted" />
        <span className="text-sm text-fg">
          <span className="font-medium text-link">Choose {multiple ? 'files' : 'a file'}</span> or drag {multiple ? 'them' : 'it'} here
        </span>
        <span className="text-xs text-fg-3">{hint ?? `Up to ${maxMb} MB${accept ? ` · ${accept.replaceAll(',', ', ')}` : ''}`}</span>
      </button>
      <input ref={input} type="file" name={name} accept={accept} multiple={multiple} className="sr-only" onChange={(e) => apply(e.target.files)} />
      {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
      {files.length ? (
        <ul className="mt-3 space-y-2">
          {files.map((f) => (
            <li key={f.name} className="flex items-center gap-2 rounded-[10px] border border-white/[0.12] bg-white/[0.04] px-3 py-2 text-sm">
              <FileText className="size-4 text-fg-3" />
              <span className="flex-1 truncate text-fg">{f.name}</span>
              <span className="text-xs text-fg-3">{sizeLabel(f.size)}</span>
            </li>
          ))}
          <li>
            <button type="button" onClick={clear} className="inline-flex items-center gap-1 text-xs text-fg-3 hover:text-fg">
              <X className="size-3" /> Clear
            </button>
          </li>
        </ul>
      ) : null}
    </div>
  )
}
