'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, Upload } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { NativeSelect } from '@/components/ui/input'
import { formatDate } from '@/lib/dates'
import { formatINR } from '@/lib/money'
import { toast } from '@/lib/toast'
import { importStatementAction, previewStatementAction, type PreviewResult } from '@/modules/folio/bank/actions'
import { BANK_PRESET_LABEL, BANK_PRESETS, MAP_FIELD_LABEL, MAP_FIELDS } from '@/modules/folio/bank/presets'

export type FirmOption = { id: string; name: string; accounts: { id: string; label: string }[] }

const FAILED = 'Could not read the statement. Check your connection and try again.'

/** Upload → preview (duplicates marked, columns shown) → import. "Other bank" lets the person map each column. */
export function StatementImport({ firms }: { firms: FirmOption[] }) {
  const router = useRouter()
  const form = useRef<HTMLFormElement>(null)
  const [entityId, setEntityId] = useState(firms[0]?.id ?? '')
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [pending, start] = useTransition()
  const firm = firms.find((f) => f.id === entityId)

  const run = (kind: 'preview' | 'import') => {
    if (!form.current) return
    const data = new FormData(form.current)
    if (!(data.get('file') instanceof File) || !(data.get('file') as File).size) {
      toast.error('Choose the statement file (.csv or .xlsx).')
      return
    }
    start(async () => {
      try {
        if (kind === 'preview') {
          const res = await previewStatementAction(data)
          if (!res.ok) return void toast.error(res.error)
          setPreview(res.data ?? null)
          return
        }
        const res = await importStatementAction(data)
        if (!res.ok) return void toast.error(res.error)
        toast.success(res.message ?? 'Imported.')
        setPreview(null)
        form.current?.reset()
        router.refresh()
      } catch (error) {
        console.error('[bank] statement action failed', error)
        toast.error(FAILED)
      }
    })
  }

  return (
    <Card variant="solid">
      <CardHeader label="Import a bank statement" icon={<Upload />} description="CSV or Excel (.xlsx) from net banking. Rows already imported are skipped." />
      <form ref={form} onSubmit={(e) => e.preventDefault()} className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm text-fg-2">
          Entity
          <NativeSelect name="entityId" value={entityId} onChange={(e) => setEntityId(e.target.value)} options={firms.map((f) => ({ value: f.id, label: f.name }))} />
        </label>
        <label className="grid gap-1.5 text-sm text-fg-2">
          Bank account
          <NativeSelect name="bankAccountId" options={(firm?.accounts ?? []).map((a) => ({ value: a.id, label: a.label }))} placeholder="Not recorded" />
        </label>
        <label className="grid gap-1.5 text-sm text-fg-2">
          Bank
          <NativeSelect name="preset" defaultValue="auto" options={BANK_PRESETS.map((p) => ({ value: p, label: BANK_PRESET_LABEL[p] }))} />
        </label>
        <label className="grid gap-1.5 text-sm text-fg-2">
          Statement file
          <input name="file" type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={() => setPreview(null)} className="h-10 rounded-full bg-control px-4 py-2 text-sm text-white file:mr-3 file:rounded-full file:border-0 file:bg-white/10 file:px-3 file:text-white" />
        </label>
        {preview ? (
          <fieldset className="grid gap-2 rounded-[10px] bg-white/[0.03] p-3 sm:col-span-2 sm:grid-cols-4">
            <legend className="px-1 text-xs text-fg-2">Columns ({BANK_PRESET_LABEL[preview.preset as keyof typeof BANK_PRESET_LABEL] ?? preview.preset}). Change any that are wrong, then preview again.</legend>
            {MAP_FIELDS.map((f) => (
              <label key={f} className="grid gap-1 text-xs text-fg-2">
                {MAP_FIELD_LABEL[f]}
                <NativeSelect name={`map_${f}`} defaultValue={preview.mapping[f] ?? ''} options={preview.headers.map((h) => ({ value: h, label: h }))} placeholder="Not in this file" className="h-9 text-xs" />
              </label>
            ))}
          </fieldset>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2 sm:col-span-2">
          <Button variant="secondary" loading={pending} icon={<Eye className="size-4" />} onClick={() => run('preview')}>Preview</Button>
          {preview && preview.fresh > 0 ? (
            <Button loading={pending} icon={<Upload className="size-4" />} onClick={() => run('import')}>
              Import {preview.fresh} new {preview.fresh === 1 ? 'row' : 'rows'}
            </Button>
          ) : null}
        </div>
      </form>
      {preview ? <PreviewTable preview={preview} /> : null}
    </Card>
  )
}

function PreviewTable({ preview }: { preview: PreviewResult }) {
  return (
    <div className="mt-4 border-t border-line pt-3">
      <p className="mb-2 text-sm text-fg-2">
        {preview.total} transactions: {preview.credits} in, {preview.debits} out are new{preview.duplicates ? `; ${preview.duplicates} already imported` : ''}{preview.skipped ? `; ${preview.skipped} other lines (balances, totals) left out` : ''}.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <tbody>
            {preview.rows.map((r) => (
              <tr key={r.line} className="border-b border-white/[0.06] last:border-0">
                <td className="whitespace-nowrap py-1.5 pr-3 text-fg-2">{formatDate(r.date)}</td>
                <td className="max-w-[320px] truncate py-1.5 pr-3 text-white/85" title={r.narration}>{r.narration}</td>
                <td className={r.direction === 'credit' ? 'whitespace-nowrap py-1.5 pr-3 text-right tabular-nums text-mint' : 'whitespace-nowrap py-1.5 pr-3 text-right tabular-nums text-white/70'}>
                  {r.direction === 'credit' ? '+' : '−'}{formatINR(r.amountPaise)}
                </td>
                <td className="py-1.5 text-right">{r.duplicate ? <Badge tone="neutral">Already in</Badge> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {preview.total > preview.rows.length ? <p className="mt-2 text-xs text-fg-3">Showing the first {preview.rows.length}.</p> : null}
    </div>
  )
}
