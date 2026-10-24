'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Laptop, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { guard, toast } from '@/lib/toast'
import type { WorkMode } from '@/modules/muster/people/lifecycle'
import type { WorkModeRow } from '@/modules/muster/people/work-mode'
import { saveWorkModes } from '@/modules/muster/people/work-mode-actions'

/** People → Work mode: tick who works remotely, for many people at once. Remote people are never asked for a location at check-in. */
export function WorkModeDialog({ rows }: { rows: WorkModeRow[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [modes, setModes] = useState<Record<string, WorkMode>>({})
  const [saving, setSaving] = useState(false)

  const modeOf = (row: WorkModeRow) => modes[row.id] ?? row.workMode
  const changed = rows.filter((r) => modeOf(r) !== r.workMode)
  const remoteCount = rows.filter((r) => modeOf(r) === 'remote').length
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? rows.filter((r) => `${r.name} ${r.code} ${r.department ?? ''}`.toLowerCase().includes(q)) : rows
  }, [rows, query])

  const reset = (next: boolean) => {
    setOpen(next)
    if (!next) {
      setModes({})
      setQuery('')
    }
  }
  const save = guard(async () => {
    setSaving(true)
    try {
      const res = await saveWorkModes({ remote: changed.filter((r) => modeOf(r) === 'remote').map((r) => r.id), office: changed.filter((r) => modeOf(r) === 'office').map((r) => r.id) })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(res.message ?? 'Saved')
      reset(false)
      router.refresh()
    } finally {
      setSaving(false)
    }
  })

  return (
    <Dialog
      open={open}
      onOpenChange={reset}
      size="md"
      trigger={<Button variant="secondary" icon={<Laptop className="size-4" />}>Work mode</Button>}
      title="Who works remotely"
      description="Tick everyone who works remotely. They are never asked for their location at check-in; everyone else follows the workspace's location setting."
      footer={
        <>
          <span className="mr-auto self-center text-xs text-fg-2">{remoteCount} remote · {changed.length ? `${changed.length} to save` : 'no changes'}</span>
          <Button variant="ghost" onClick={() => reset(false)}>Cancel</Button>
          <Button variant="primary" loading={saving} disabled={!changed.length} onClick={() => void save()}>Save</Button>
        </>
      }
    >
      <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, code or team" icon={<Search className="size-4" />} aria-label="Search people" />
      <ul className="mt-3 max-h-[50dvh] divide-y divide-white/[0.06] overflow-y-auto rounded-[10px] bg-white/[0.03]">
        {shown.map((r) => (
          <li key={r.id} className="flex items-center gap-3 px-3 py-2">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-fg">{r.name}</span>
              <span className="block truncate text-xs text-fg-2">{[r.code, r.department].filter(Boolean).join(' · ')}</span>
            </span>
            <Checkbox
              checked={modeOf(r) === 'remote'}
              onCheckedChange={(on) => setModes((cur) => ({ ...cur, [r.id]: on ? 'remote' : 'office' }))}
              label="Remote"
              aria-label={`${r.name} works remotely`}
            />
          </li>
        ))}
        {!shown.length ? <li className="px-3 py-6 text-center text-sm text-fg-2">Nobody matches that search.</li> : null}
      </ul>
    </Dialog>
  )
}
