'use client'

import { Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { createContext, useCallback, useContext, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { quickAddTask } from '@/modules/work/tasks/actions'
import { TITLE_MIN } from '@/modules/work/tasks/constants'
import { addPending, confirmPending, dropPending, type PendingRow } from '@/lib/optimistic-list'
import { toast } from '@/lib/toast'
import { parsedFields, QuickChips, useQuickParse } from '../tasks/quick-parse-chips'

type Pending = PendingRow<{ title: string }>
type QuickFields = ReturnType<typeof parsedFields>
type QuickAddApi = { pending: Pending[]; personal: boolean; add: (title: string, fields?: QuickFields) => Promise<boolean> }

const QuickAddContext = createContext<QuickAddApi | null>(null)

/**
 * Home → "Assign to me" quick add: type a title, press Enter, and the task is
 * created assigned to me. The row shows at once ("Adding…") and stays until
 * the refreshed list carries it; a failed save drops it and gives the title back.
 */
export function AssignedQuickAddProvider({ serverIds, personal, children }: { serverIds: string[]; personal: boolean; children: ReactNode }) {
  const router = useRouter()
  const [pending, setPending] = useState<Pending[]>([])
  const seq = useRef(0)
  const add = useCallback(
    async (title: string, fields: QuickFields = {}) => {
      seq.current += 1
      const key = `new-${seq.current}`
      setPending((list) => addPending(list, key, { title }))
      try {
        const result = await quickAddTask({ ...fields, title, personal: personal || undefined })
        if (!result.ok) {
          toast.error(result.error)
          setPending((list) => dropPending(list, key))
          return false
        }
        setPending((list) => (result.data?.id ? confirmPending(list, key, result.data.id) : dropPending(list, key)))
        router.refresh()
        return true
      } catch (error) {
        console.error('[home] quick add failed', error)
        toast.error('Could not add the task. Try again.')
        setPending((list) => dropPending(list, key))
        return false
      }
    },
    [personal, router],
  )
  const shown = useMemo(() => pending.filter((p) => !p.serverId || !serverIds.includes(p.serverId)), [pending, serverIds])
  return <QuickAddContext.Provider value={{ pending: shown, personal, add }}>{children}</QuickAddContext.Provider>
}

const useQuickAdd = (): QuickAddApi => useContext(QuickAddContext) ?? { pending: [], personal: false, add: async () => false }

/** The slim inline input under the card header. */
export function AssignedQuickAddInput() {
  const { add, personal } = useQuickAdd()
  const [title, setTitle] = useState('')
  const { parsed, dismiss, reset, load, warning } = useQuickParse(title, { personal })
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const clean = parsed.title.trim()
    if (!title.trim()) return
    if (clean.length < TITLE_MIN) {
      toast.error(`Title must be at least ${TITLE_MIN} characters`)
      return
    }
    const typed = title
    const fields = parsedFields(parsed)
    setTitle('')
    reset()
    if (!(await add(clean, fields))) setTitle((now) => now || typed)
  }
  return (
    <div className="mx-[23px] mb-3">
      <form onSubmit={(e) => void submit(e)} className="flex items-center gap-2 rounded-full border border-dashed border-white/[0.14] px-3 transition-colors hover:border-white/[0.24] focus-within:border-solid focus-within:border-white/40 focus-within:bg-white/[0.04]">
        <Plus className="size-3.5 shrink-0 text-icon-muted" aria-hidden />
        <input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value)
            if (!e.target.value) reset()
          }}
          onFocus={load}
          placeholder="Add a task for me…"
          aria-label="Add a task assigned to me"
          maxLength={200}
          className="h-8 min-w-0 flex-1 bg-transparent text-[13px] text-fg placeholder:text-fg-4 focus:outline-none"
        />
        {title.trim() ? <kbd className="hidden rounded-[6px] bg-control px-1.5 py-0.5 font-sans text-[11px] text-fg-2 sm:block">Enter</kbd> : null}
      </form>
      <QuickChips tokens={parsed.tokens} onDismiss={dismiss} warning={warning} />
    </div>
  )
}

/** New tasks in the table, above the server rows, until the refreshed list has them. */
export function AssignedPendingRows() {
  const { pending } = useQuickAdd()
  if (!pending.length) return null
  return (
    <tbody>
      {pending.map((p) => (
        <tr key={p.key} aria-busy={!p.serverId || undefined} className="h-8 opacity-70">
          <td />
          <td className="pr-4">
            <span className="flex items-center gap-[11px]">
              <span aria-hidden className="size-4 shrink-0 rounded-full border border-dashed border-white/40" />
              <span className="truncate text-[13px] text-white">{p.row.title}</span>
            </span>
          </td>
          <td colSpan={3} className="text-[13px] text-[#979797]">{p.serverId ? 'Added' : 'Adding…'}</td>
          <td />
        </tr>
      ))}
    </tbody>
  )
}

/** The same rows as a list, for the empty state (no table yet). */
export function AssignedPendingList() {
  const { pending } = useQuickAdd()
  if (!pending.length) return null
  return (
    <ul className="space-y-1 px-[23px] pb-2">
      {pending.map((p) => (
        <li key={p.key} aria-busy={!p.serverId || undefined} className="flex items-center gap-[11px] text-[13px] text-white opacity-70">
          <span aria-hidden className="size-4 shrink-0 rounded-full border border-dashed border-white/40" />
          <span className="truncate">{p.row.title}</span>
          <span className="ml-auto text-[#979797]">{p.serverId ? 'Added' : 'Adding…'}</span>
        </li>
      ))}
    </ul>
  )
}
