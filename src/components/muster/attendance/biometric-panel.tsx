'use client'

import { CircleCheck, Fingerprint, RefreshCw, Upload } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { play } from '@/lib/sound'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { Input, NativeSelect } from '@/components/ui/input'
import { DROPZONE } from '../ui/dropzone'
import { Note } from '../ui/note'
import { checkBiometricImport, runBiometricImport, saveBiometricMapping } from '@/modules/muster/attendance/biometric-actions'
import { BIOMETRIC_FORMATS, DEFAULT_CUTOFF, FORMAT_LABELS, PUNCH_FIELDS, type BiometricFormatChoice, type BiometricPreview, type PunchColumns, type PunchField } from '@/modules/muster/attendance/biometric/types'
import { BiometricDays, UnmappedDevices, type EmployeeOption } from './biometric-preview'

const MAX_BYTES = 3 * 1024 * 1024
const FORMAT_OPTIONS = BIOMETRIC_FORMATS.map((f) => ({ value: f, label: f === 'auto' ? 'Detect from the file' : FORMAT_LABELS[f] }))
const FIELD_LABELS: Record<PunchField, string> = { id: 'User id', datetime: 'Date and time', date: 'Date', time: 'Time', direction: 'In / out' }
const LABEL = 'text-xs font-medium text-fg-2'

type Settings = { format: BiometricFormatChoice; cutoff: string; picks: PunchColumns }

function formOf(file: File, s: Settings): FormData {
  const data = new FormData()
  data.set('file', file)
  data.set('format', s.format)
  data.set('cutoff', s.cutoff)
  PUNCH_FIELDS.forEach((f) => (s.picks[f] ? data.set(`map_${f}`, s.picks[f]!) : undefined))
  return data
}

/** Raw punches from an eSSL or ZKTeco device (or any punch file): check every day, map device ids, then write. */
export function BiometricImportPanel({ employees }: { employees: EmployeeOption[] }) {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [settings, setSettings] = useState<Settings>({ format: 'auto', cutoff: DEFAULT_CUTOFF, picks: {} })
  const [preview, setPreview] = useState<BiometricPreview | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [checking, startCheck] = useTransition()
  const [writing, startWrite] = useTransition()

  const check = (target: File, s: Settings) =>
    startCheck(async () => {
      try {
        const result = await checkBiometricImport(formOf(target, s))
        if (!result.ok) return void toast.error(result.error)
        setPreview(result.data ?? null)
        toast.info(result.message ?? 'Checked')
      } catch {
        toast.error('The file could not be checked. Try again.')
      }
    })

  const pick = (picked: File | undefined) => {
    if (!picked) return
    if (picked.size > MAX_BYTES) return void toast.error('That file is larger than 3 MB. Split it into smaller files.')
    const fresh = { ...settings, picks: {} }
    setFile(picked)
    setSettings(fresh)
    setPreview(null)
    play('pop')
    check(picked, fresh)
  }

  const saveMapping = (deviceId: string, employeeId: string) => {
    setSavingId(deviceId)
    startCheck(async () => {
      try {
        const result = await saveBiometricMapping({ deviceId, employeeId })
        if (!result.ok) return void toast.error(result.error)
        toast.success(result.message ?? 'Saved')
        if (file) check(file, settings)
      } catch {
        toast.error('The mapping was not saved. Try again.')
      } finally {
        setSavingId(null)
      }
    })
  }

  const write = () => {
    if (!file) return
    startWrite(async () => {
      try {
        const result = await runBiometricImport(formOf(file, settings))
        if (!result.ok) return void toast.error(result.error)
        toast.success(result.message ?? 'Attendance imported')
        router.push(result.redirect ?? '/app/hr/attendance')
        router.refresh()
      } catch {
        toast.error('The import did not go through. Nothing was written; try again.')
      }
    })
  }

  const setPick = (field: PunchField, header: string) => setSettings((s) => ({ ...s, picks: { ...s.picks, [field]: header || undefined } }))

  return (
    <div className="grid grid-cols-12 gap-4">
      <Card className="col-span-12 lg:col-span-4">
        <CardHeader label="1 · Device export" icon={<Fingerprint />} description="Raw punches: up to 50,000 rows and 3 MB." />
        <label className={cn(DROPZONE, checking && 'opacity-60')}>
          <Upload className="size-6 text-icon-muted" strokeWidth={1.25} />
          <span className="text-sm font-medium text-white">{file?.name || 'Choose the export (.dat, .txt, .csv or .xlsx)'}</span>
          <span className="text-xs text-fg-2">{checking ? 'Reading every punch…' : 'Nothing is saved until you write it.'}</span>
          <input type="file" accept=".dat,.txt,.csv,.tsv,.xlsx,text/plain,text/csv" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
        </label>
        <div className="mt-4 grid gap-3">
          <label className="grid gap-1.5"><span className={LABEL}>Format</span>
            <NativeSelect value={settings.format} options={FORMAT_OPTIONS} onChange={(e) => setSettings((s) => ({ ...s, format: e.target.value as BiometricFormatChoice }))} />
          </label>
          <label className="grid gap-1.5"><span className={LABEL}>Night shift cutoff</span>
            <Input value={settings.cutoff} inputMode="numeric" placeholder="04:00" onChange={(e) => setSettings((s) => ({ ...s, cutoff: e.target.value }))} />
            <span className="text-xs text-fg-2">Punches after midnight and before this time count for the day before.</span>
          </label>
          {preview?.headers.length ? (
            <div className="grid grid-cols-2 gap-2">
              {PUNCH_FIELDS.map((f) => (
                <label key={f} className="grid gap-1"><span className={LABEL}>{FIELD_LABELS[f]}</span>
                  <NativeSelect className="h-9 text-xs" value={settings.picks[f] ?? preview.columns[f] ?? ''} placeholder="Not in this file" options={preview.headers.map((h) => ({ value: h, label: h }))} onChange={(e) => setPick(f, e.target.value)} />
                </label>
              ))}
            </div>
          ) : null}
          <Button variant="secondary" icon={<RefreshCw className="size-4" />} disabled={!file} loading={checking && !savingId} onClick={() => file && check(file, settings)}>Check again</Button>
        </div>
        <ul className="mt-4 space-y-1.5 text-xs leading-relaxed text-fg-2">
          <li>eSSL / eTimeTrackLite attendance logs, ZKTeco attlog.dat or its CSV / Excel export, or any file with a user id and a punch time.</li>
          <li>First punch is the in time, last is the out time. Repeats within 2 minutes are ignored; a single punch is flagged as missing out.</li>
          <li>Device ids match a saved biometric id first, then the employee code.</li>
        </ul>
      </Card>
      <Card variant="table" className="col-span-12 lg:col-span-8" padded={false}>
        <div className="px-5 pb-3 pt-[17px] sm:px-[23px]">
          <CardHeader
            label="2 · Check and write"
            icon={<CircleCheck />}
            description={preview ? `${preview.formatLabel}. ${preview.summary}` : 'Pick a file to see each person’s days.'}
            actions={preview ? <Button variant="primary" loading={writing} disabled={!preview.ready || checking} onClick={write}>Write {preview.ready} {preview.ready === 1 ? 'day' : 'days'}</Button> : null}
          />
          {preview?.skippedCount ? <Note compact tone="warning">{preview.skippedCount} {preview.skippedCount === 1 ? 'line' : 'lines'} could not be read, e.g. line {preview.skipped[0].line}: {preview.skipped[0].reason}</Note> : null}
        </div>
        {preview ? (
          <>
            <UnmappedDevices devices={preview.unmapped} employees={employees} saving={savingId} onSave={saveMapping} />
            <BiometricDays rows={preview.rows} />
          </>
        ) : (
          <p className="border-t border-line px-5 pb-10 pt-8 text-center text-sm text-fg-2">The preview lists every day, what was worked out from the punches, and anything to fix.</p>
        )}
      </Card>
    </div>
  )
}
