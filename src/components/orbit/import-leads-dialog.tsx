'use client'

import Papa from 'papaparse'
import { useState, type ReactNode } from 'react'
import { FileSpreadsheet, Upload } from 'lucide-react'
import { toast } from '@/lib/toast'
import { useAction } from '@/components/ui/action-form'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Select } from '@/components/ui/select'
import { IMPORT_MAX_ROWS, labelFrom } from '@/modules/orbit/constants'
import { badFields, mapRows, type MapResult } from '@/modules/orbit/csvImport'
import { importLeads } from '@/modules/orbit/leads.actions'
import type { OrbitChoices } from '@/modules/orbit/record-types'

const PREVIEW_ROWS = 50
const MAX_FILE_BYTES = 5 * 1024 * 1024
const READ_FAILED = 'Could not read that file. Save it as a .csv and try again.'

/** Import leads from a CSV: smart column matching, preview, then a server-validated insert. */
/** The one leads import screen (Settings → Import → Leads opens it with `defaultOpen`). */
export function ImportLeadsDialog({ trigger, choices, canAssign, defaultOpen = false }: { trigger: ReactNode; choices: Pick<OrbitChoices, 'sources' | 'sectors' | 'owners' | 'reviewers'>; canAssign: boolean; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  const [fileName, setFileName] = useState('')
  const [result, setResult] = useState<MapResult | null>(null)
  const [ownerId, setOwnerId] = useState<string | undefined>()
  const [reviewerId, setReviewerId] = useState<string | undefined>()
  const [run, pending] = useAction(importLeads, { onDone: () => reset() })

  function reset() {
    setOpen(false)
    setResult(null)
    setFileName('')
  }

  const onFile = (file: File | undefined) => {
    if (!file) return
    if (file.size > MAX_FILE_BYTES) {
      toast.error('That file is larger than 5 MB. Split it and import the parts.')
      return
    }
    setFileName(file.name)
    Papa.parse<string[]>(file, {
      header: false,
      skipEmptyLines: 'greedy',
      complete: (parsed) => {
        const mapped = mapRows(parsed.data, { sectors: choices.sectors, sources: choices.sources })
        if (mapped.tooMany) toast.error(`This file has ${mapped.total.toLocaleString('en-IN')} rows. Import at most ${IMPORT_MAX_ROWS.toLocaleString('en-IN')} at a time.`)
        setResult(mapped)
      },
      error: (error) => {
        console.error('[orbit] lead CSV parse failed', error)
        toast.error(READ_FAILED)
      },
    })
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : reset())} trigger={trigger} title="Import leads" description="CSV with a header row. Columns like Company, Contact, Email, Phone, Instagram, Sector and Source are matched automatically." size="xl">
      <div className="space-y-4">
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-[12px] border border-dashed border-white/[0.22] bg-white/[0.04] px-6 py-8 text-center transition-colors hover:border-white/40 hover:bg-white/[0.06]">
          <FileSpreadsheet className="size-7 text-icon-muted" strokeWidth={1.25} />
          <span className="text-sm text-white">{fileName || 'Choose a .csv file'}</span>
          <span className="text-[13px] text-fg-2">Every lead starts at New and is assigned to {canAssign ? 'the owner you pick' : 'you'}.</span>
          <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
        {result ? (
          <>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge tone="success">{result.rows.length} ready</Badge>
              {result.skippedNoCompany ? <Badge tone="warning">{result.skippedNoCompany} skipped, no company name</Badge> : null}
              {result.withBadFields ? <Badge tone="warning">{result.withBadFields} with a bad email, phone or link (left blank)</Badge> : null}
              {result.mappedToOther.sector ? <Badge>{result.mappedToOther.sector} unknown sectors → Other</Badge> : null}
              {result.mappedToOther.source ? <Badge>{result.mappedToOther.source} unknown sources → Other</Badge> : null}
              <span className="text-[13px] text-fg-2">Duplicates of open leads are skipped on import.</span>
            </div>
            <div className="max-h-72 overflow-auto rounded-[12px] bg-surface-table">
              <table className="w-full border-collapse text-xs">
                <thead className="sticky top-0 bg-[#2b2b2c] text-left text-white">
                  <tr className="border-b border-line">{['Company', 'Contact', 'Email', 'Phone', 'Sector', 'Source'].map((h) => <th key={h} className="h-[33px] px-3 font-normal">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {result.rows.slice(0, PREVIEW_ROWS).map((r, i) => {
                    const bad = badFields(r)
                    return (
                    <tr key={i} className="text-white/80 transition-colors hover:bg-white/[0.04]">
                      <td className="px-3 py-1.5 text-white">
                        {r.companyName}
                        {bad.length ? <span className="block text-[11px] text-[#F5A524]">Row {r.line}: bad {bad.join(', ')}, left blank</span> : null}
                      </td>
                      <td className="px-3 py-1.5">{r.contactName}</td>
                      <td className="px-3 py-1.5">{r.email}</td>
                      <td className="px-3 py-1.5">{r.phone}</td>
                      <td className="px-3 py-1.5">{labelFrom(choices.sectors, r.sector)}</td>
                      <td className="px-3 py-1.5">{labelFrom(choices.sources, r.source)}</td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {result.rows.length > PREVIEW_ROWS ? <p className="text-[13px] text-fg-2">Showing the first {PREVIEW_ROWS} of {result.rows.length} rows.</p> : null}
            {canAssign ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Select aria-label="Owner" value={ownerId} onValueChange={setOwnerId} options={choices.owners} placeholder="Owner: me" />
                <Select aria-label="Reviewer" value={reviewerId} onValueChange={setReviewerId} options={choices.reviewers} placeholder="Reviewer: default" />
              </div>
            ) : null}
          </>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={reset}>Cancel</Button>
          <Button variant="primary" icon={<Upload className="size-4" />} loading={pending} disabled={!result?.rows.length} onClick={() => result && run({ rows: result.rows, ownerId, reviewerId })}>
            Import {result?.rows.length ?? 0} leads
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
