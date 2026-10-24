'use client'

import { CircleAlert, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { formatDate } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/input'
import { TABLE } from '../ui/list-card'
import { Note } from '../ui/note'
import type { BiometricPreviewRow, UnmappedDeviceRow } from '@/modules/muster/attendance/biometric/types'

/** Days with problems first, then the rest; the browser shows at most this many. */
const ROWS_SHOWN = 1000
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

export type EmployeeOption = { value: string; label: string }

/** Device ids nobody is mapped to: pick the person and save, and later imports map them too. */
export function UnmappedDevices({ devices, employees, saving, onSave }: { devices: UnmappedDeviceRow[]; employees: EmployeeOption[]; saving: string | null; onSave: (deviceId: string, employeeId: string) => void }) {
  const [picked, setPicked] = useState<Record<string, string>>({})
  if (!devices.length) return null
  return (
    <div className="border-t border-line px-5 py-4 sm:px-[23px]">
      <Note compact tone="warning" title={`${devices.length} device ${devices.length === 1 ? 'id is' : 'ids are'} not mapped`}>
        Pick who each one is. The mapping is saved on their profile for the next import.
      </Note>
      <ul className="mt-3 space-y-2">
        {devices.map((d) => (
          <li key={d.deviceId} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="w-28 font-mono text-white">{d.deviceId}</span>
            <span className="w-36 text-xs text-fg-2">{d.days} {d.days === 1 ? 'day' : 'days'} · {d.punches} punches</span>
            <NativeSelect aria-label={`Who is device id ${d.deviceId}`} className="h-9 min-w-56 flex-1 text-xs" value={picked[d.deviceId] ?? ''} placeholder="Choose the person" options={employees} onChange={(e) => setPicked((p) => ({ ...p, [d.deviceId]: e.target.value }))} />
            <Button variant="secondary" size="sm" loading={saving === d.deviceId} disabled={!picked[d.deviceId] || saving !== null} onClick={() => onSave(d.deviceId, picked[d.deviceId])}>Save</Button>
          </li>
        ))}
      </ul>
    </div>
  )
}

const order = (r: BiometricPreviewRow) => (r.errors.length ? 0 : r.warnings.length ? 1 : 2)

function Messages({ row }: { row: BiometricPreviewRow }) {
  return (
    <>
      {row.errors.length ? (
        <ul className="space-y-1">{row.errors.map((e) => <li key={e} className="flex gap-1.5 text-[#FF6A66]"><CircleAlert className="mt-0.5 size-3.5 shrink-0" />{e}</li>)}</ul>
      ) : (
        <Badge tone="success">Ready</Badge>
      )}
      {row.warnings.length ? <ul className="mt-1 space-y-1">{row.warnings.map((w) => <li key={w} className="flex gap-1.5 text-warning"><TriangleAlert className="mt-0.5 size-3.5 shrink-0" />{w}</li>)}</ul> : null}
    </>
  )
}

/** Per-day results: person, day, in and out, the worked-out status, and any errors or warnings. */
export function BiometricDays({ rows }: { rows: BiometricPreviewRow[] }) {
  const shown = [...rows].sort((a, b) => order(a) - order(b)).slice(0, ROWS_SHOWN)
  if (!rows.length) return <p className="border-t border-line px-5 pb-10 pt-8 text-center text-sm text-fg-2">No mapped days yet. Map the device ids above, then check again.</p>
  return (
    <div className="max-h-[560px] overflow-auto border-t border-line">
      <table className={TABLE.table}>
        <thead className="sticky top-0 z-10 bg-[#2c2c2d]">
          <tr className={TABLE.headRow}>
            <th className={TABLE.th}>Person and day</th><th className={TABLE.th}>In – out</th><th className={TABLE.th}>Status</th><th className={TABLE.th}>Result</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <tr key={r.line} className={cn(TABLE.row, 'align-top')}>
              <td className="px-4 py-2.5"><span className="block text-white">{r.name ?? r.code}</span><span className="text-xs text-fg-2">{r.code} · {ISO_DAY.test(r.date) ? formatDate(r.date) : r.date}</span></td>
              <td className="px-4 py-2.5 font-mono text-xs text-fg-2">{r.in || '—'} – {r.out ?? '—'}<span className="block font-sans">{r.punches} {r.punches === 1 ? 'punch' : 'punches'}</span></td>
              <td className="px-4 py-2.5 text-fg-2">{r.status || '—'}</td>
              <td className="px-4 py-2.5"><Messages row={r} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > shown.length ? <p className="px-5 py-3 text-xs text-fg-2">Showing {shown.length.toLocaleString('en-IN')} of {rows.length.toLocaleString('en-IN')} days, problems first. Writing covers every ready day.</p> : null}
    </div>
  )
}
