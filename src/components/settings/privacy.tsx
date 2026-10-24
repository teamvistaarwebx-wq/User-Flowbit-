'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Download, Search, ShieldOff } from 'lucide-react'
import { useAction } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { buttonClass } from '@/components/ui/button-styles'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { erasePersonalData, searchPersonalData } from '@/modules/privacy/actions'
import type { SubjectRef } from '@/modules/privacy/core'
import type { FoundSubject } from '@/modules/privacy/search'

const KIND_WORD: Record<SubjectRef['kind'], string> = { contact: 'contact', lead: 'lead', member: 'member' }
const queryOf = (ref: SubjectRef) => new URLSearchParams(Object.entries(ref)).toString()

/**
 * DPDP for one person: download everything this workspace holds about them,
 * or erase it after typing ERASE. `kept` says what the law makes the
 * workspace keep. Owners and admins only (the page decides whether to show it).
 */
export function PersonalDataActions({ subjectRef, name, kept, afterErase, size = 'sm' }: { subjectRef: SubjectRef; name: string; kept: readonly string[]; afterErase?: string; size?: 'sm' | 'md' }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState('')
  const [erase, pending] = useAction(erasePersonalData, {
    onDone: () => {
      setOpen(false)
      if (afterErase) router.push(afterErase)
    },
  })
  return (
    <span className="flex flex-wrap items-center gap-2">
      <a href={`/api/privacy/export?${queryOf(subjectRef)}`} className={buttonClass('ghost', size)}><Download className="size-3.5" /> Export data</a>
      <Dialog
        open={open}
        onOpenChange={(o) => { setOpen(o); if (!o) setConfirm('') }}
        title={`Erase ${name}'s personal data?`}
        description={`For a data request under the DPDP Act. This removes the ${KIND_WORD[subjectRef.kind]}, their WhatsApp conversations and who your messages went to. It cannot be undone; export first if they asked for a copy.`}
        trigger={<Button size={size} variant="ghost" icon={<ShieldOff className="size-3.5" />}>Erase data</Button>}
      >
        <div className="space-y-4">
          {kept.length ? (
            <ul className="list-disc space-y-1 pl-5 text-sm text-fg-2">
              {kept.map((k) => <li key={k}>{k}</li>)}
            </ul>
          ) : null}
          <label className="block text-sm text-white" htmlFor="erase-confirm">Type ERASE to confirm</label>
          <Input id="erase-confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
          <div className="flex justify-end">
            <Button variant="danger" loading={pending} disabled={confirm !== 'ERASE'} onClick={() => erase({ ref: subjectRef, confirm: 'ERASE' })}>Erase</Button>
          </div>
        </div>
      </Dialog>
    </span>
  )
}

/** Settings → Privacy: find a person by email or phone, then export or erase their data. */
export function PrivacySearch({ kept }: { kept: Record<SubjectRef['kind'], readonly string[]> }) {
  const [query, setQuery] = useState('')
  const [rows, setRows] = useState<FoundSubject[] | null>(null)
  const [search, pending] = useAction(searchPersonalData, { noRefresh: true, onDone: (r) => setRows(r.data ?? []) })
  return (
    <div className="space-y-4">
      <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); void search({ query }) }}>
        <Input aria-label="Email or phone number" placeholder="Full email address or phone number" value={query} onChange={(e) => setQuery(e.target.value)} className="sm:max-w-sm" />
        <Button type="submit" variant="secondary" icon={<Search className="size-4" />} loading={pending}>Find</Button>
      </form>
      {rows ? (
        rows.length ? (
          <ul className="-mx-5 divide-y divide-white/[0.06] border-t border-line">
            {rows.map((r) => (
              <li key={queryOf(r.ref)} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <span className="min-w-0"><span className="block truncate text-sm text-white">{r.name}</span><span className="block text-xs text-fg-2">{r.detail}</span></span>
                <PersonalDataActions subjectRef={r.ref} name={r.name} kept={kept[r.kind]} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-fg-2">Nobody in this workspace has that email or number.</p>
        )
      ) : null}
    </div>
  )
}
