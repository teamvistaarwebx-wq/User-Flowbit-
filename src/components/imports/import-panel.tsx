'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { CircleAlert, CircleCheck, Download, FileSpreadsheet, TriangleAlert, Upload } from 'lucide-react'
import type { ActionResult } from '@/lib/action-types'
import { openLimitPrompt } from '@/lib/limit-prompt'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { buttonClass } from '@/components/ui/button-styles'
import { Card, CardHeader } from '@/components/ui/card'
import type { ImportPreview } from '@/modules/imports/types'

/** 3 MB, as the server (modules/imports/sheet MAX_IMPORT_BYTES). */
const MAX_BYTES = 3 * 1024 * 1024
const ROWS_SHOWN = 200

type Run<T> = (input: FormData) => Promise<ActionResult<T>>

/**
 * Template → upload → preview with row errors → confirm (console spec 9).
 * The same panel serves Settings → Import and the Console's staff-run path;
 * `hidden` carries the workspace id there. The file is sent again on confirm
 * and checked again on the server.
 */
export function ImportPanel({ kind, label, templateHref, columns, hidden = {}, preview: previewAction, confirm: confirmAction, doneHref }: {
  kind: string
  label: string
  templateHref: string
  columns: { key: string; required?: boolean; help?: string }[]
  hidden?: Record<string, string>
  preview: Run<ImportPreview>
  confirm: Run<unknown>
  doneHref?: string
}) {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [checking, startCheck] = useTransition()
  const [importing, startImport] = useTransition()

  const form = (f: File) => {
    const data = new FormData()
    data.set('kind', kind)
    data.set('file', f)
    for (const [k, v] of Object.entries(hidden)) data.set(k, v)
    return data
  }

  const pick = (f: File | undefined) => {
    if (!f) return
    if (f.size > MAX_BYTES) return void toast.error('That file is larger than 3 MB. Split it into smaller files.')
    setFile(f)
    setPreview(null)
    startCheck(async () => {
      const result = await previewAction(form(f))
      if (!result.ok) return void toast.error(result.error)
      setPreview(result.data ?? null)
      if (result.data && result.data.ready === result.data.total) toast.success(result.message ?? 'Ready to import')
      else toast.info(result.message ?? 'Some rows need fixing')
    })
  }

  const run = () => {
    if (!file) return
    startImport(async () => {
      const result = await confirmAction(form(file))
      if (!result.ok) {
        if (!openLimitPrompt(result)) toast.error(result.error)
        return
      }
      toast.success(result.message ?? 'Imported')
      setFile(null)
      setPreview(null)
      if (doneHref) router.push(doneHref)
      router.refresh()
    })
  }

  return (
    <div className="grid grid-cols-12 gap-4">
      <Card className="col-span-12 lg:col-span-4">
        <CardHeader label="1 · Your file" icon={<FileSpreadsheet />} description={`${label}: CSV or Excel (.xlsx), first sheet.`} />
        <label className={cn('flex cursor-pointer flex-col items-center gap-2 rounded-[12px] border border-dashed border-white/20 px-4 py-8 text-center transition-colors hover:bg-white/[0.03]', checking && 'opacity-60')}>
          <Upload className="size-6 text-icon-muted" strokeWidth={1.25} />
          <span className="text-sm font-medium text-white">{file?.name || 'Choose a file'}</span>
          <span className="text-xs text-fg-2">{checking ? 'Checking every row…' : 'Nothing is saved until you confirm.'}</span>
          <input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
        </label>
        <a className={buttonClass('secondary', 'md', 'mt-3 w-full')} href={templateHref} download><Download className="size-4" /> Download the template</a>
        <ul className="mt-4 space-y-1 text-xs leading-relaxed text-fg-2">
          {columns.map((c) => (
            <li key={c.key}><span className="font-mono text-white/90">{c.key}</span>{c.required ? <span className="text-[#F64A45]">*</span> : null}{c.help ? ` · ${c.help}` : ''}</li>
          ))}
        </ul>
      </Card>
      <Card className="col-span-12 lg:col-span-8">
        <CardHeader label="2 · Preview" icon={<CircleCheck />} description={preview ? preview.summary : 'Upload a file to see every row checked.'} actions={preview?.ready ? <Button loading={importing} onClick={run}>Import {preview.ready} {preview.ready === 1 ? 'row' : 'rows'}</Button> : null} />
        {preview?.seatNote ? <p className="mb-3 flex gap-2 rounded-[10px] bg-[#F5B544]/10 px-3 py-2 text-sm text-warning"><TriangleAlert className="mt-0.5 size-4 shrink-0" />{preview.seatNote}</p> : null}
        {preview?.ignored.length ? <p className="mb-3 text-xs text-fg-2">Ignored columns: {preview.ignored.join(', ')}</p> : null}
        {preview ? (
          <ul className="divide-y divide-white/[0.06] text-sm">
            {preview.rows.slice(0, ROWS_SHOWN).map((r) => (
              <li key={r.line} className="flex gap-3 py-2">
                <span className="w-12 shrink-0 text-xs tabular-nums text-[#979797]">Line {r.line}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-white">{r.errors.length ? <CircleAlert className="size-3.5 text-[#F64A45]" /> : <CircleCheck className="size-3.5 text-[#2DCBAF]" />}{r.label}</span>
                  {r.errors.map((e) => <span key={e} className="block text-xs text-[#FF7B77]">{e}</span>)}
                  {r.warnings.map((w) => <span key={w} className="block text-xs text-warning">{w}</span>)}
                </span>
              </li>
            ))}
            {preview.rows.length > ROWS_SHOWN ? <li className="py-2 text-xs text-fg-2">…and {preview.rows.length - ROWS_SHOWN} more rows.</li> : null}
          </ul>
        ) : null}
      </Card>
    </div>
  )
}
