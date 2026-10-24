'use client'

import { useEffect, useState, useTransition } from 'react'
import { Building2, Handshake, Search, Target, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { searchRecords } from '@/modules/orbit/search.actions'
import type { RecordHit, RecordKind } from '@/modules/orbit/record-types'

const KIND_ICON = { lead: Target, deal: Handshake, client: Building2 }
const DEBOUNCE_MS = 250

export type RecordPickerProps = {
  kinds: RecordKind[]
  value: RecordHit | null
  onChange: (hit: RecordHit | null) => void
  placeholder?: string
  /** Field name used for the error anchor (e.g. 'clientId'). */
  name?: string
}

/** Search-as-you-type picker over leads, deals and clients in your scope. */
export function RecordPicker({ kinds, value, onChange, placeholder = 'Search leads, deals or clients', name }: RecordPickerProps) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<RecordHit[]>([])
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const kindsKey = kinds.join(',')

  useEffect(() => {
    if (value) return
    const timer = setTimeout(() => {
      start(async () => {
        const res = await searchRecords({ q, kinds: kindsKey.split(',') as RecordKind[] })
        if (res.ok) {
          setHits(res.data ?? [])
          setError(null)
        } else setError(res.error)
      })
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [q, kindsKey, value])

  if (value) {
    const Icon = KIND_ICON[value.kind]
    return (
      <div data-field={name} className="flex h-10 items-center gap-2 rounded-full border border-white/[0.18] bg-white/[0.06] pl-4 pr-1.5 text-sm">
        <Icon className="size-4 text-icon-muted" />
        <span className="min-w-0 flex-1 truncate text-white">{value.label}</span>
        <span className="text-xs text-[#979797]">{value.sub}</span>
        <button type="button" onClick={() => onChange(null)} className="rounded-full p-1.5 text-fg-2 transition-colors hover:bg-white/[0.08] hover:text-white" aria-label="Clear">
          <X className="size-3.5" />
        </button>
      </div>
    )
  }

  return (
    <div data-field={name} className="space-y-2">
      <Input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()} placeholder={placeholder} icon={<Search />} aria-label={placeholder} />
      <ul className={cn('max-h-52 overflow-y-auto rounded-[10px] border border-white/[0.12] bg-menu p-1', pending && 'opacity-70')}>
        {error ? <li className="px-3 py-2 text-[13px] text-[#FF6A66]">{error}</li> : null}
        {!error && hits.length === 0 ? <li className="px-3 py-2 text-[13px] text-fg-2">{pending ? 'Searching…' : 'Nothing matches. Try another name.'}</li> : null}
        {hits.map((h) => {
          const Icon = KIND_ICON[h.kind]
          return (
            <li key={`${h.kind}-${h.id}`}>
              <button type="button" onClick={() => onChange(h)} className="flex h-9 w-full items-center gap-2 rounded-[8px] px-3 text-left text-sm text-white transition-colors hover:bg-white/[0.06]">
                <Icon className="size-4 shrink-0 text-icon-muted" />
                <span className="min-w-0 flex-1 truncate">{h.label}</span>
                <span className="text-xs text-[#979797]">{h.sub}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** Hidden inputs for the picked record (leadId / dealId / clientId). */
export function RecordFields({ hit }: { hit: RecordHit | null }) {
  if (!hit) return null
  return <input type="hidden" name={`${hit.kind}Id`} value={hit.id} />
}
