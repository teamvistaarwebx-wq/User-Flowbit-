'use client'

import { useState } from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAction } from '@/components/ui/action-form'
import { Button, IconButton } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { saveDealStages, saveReasons, saveSectors, saveSources } from '@/modules/orbit/settings.actions'
import { STAGE_COLORS, STAGE_COLOR_KEYS, type StageColor } from '@/modules/orbit/constants'
import { dealStageFill } from './palette'

type Item = { key?: string; label: string; active?: boolean; warm?: boolean; primary?: boolean; probability?: number; color?: StageColor }

export type ListKind = 'sources' | 'sectors' | 'lost' | 'won' | 'stages'

const move = <T,>(list: T[], from: number, to: number): T[] => {
  if (to < 0 || to >= list.length) return list
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

function save(kind: ListKind, items: Item[]) {
  const clean = items.map((i) => ({ ...i, label: i.label.trim() }))
  if (kind === 'stages') return saveDealStages({ items: clean.map((i) => ({ key: i.key, label: i.label, probability: Math.round(Number(i.probability ?? 0)), color: i.color ?? 'sky' })) })
  if (kind === 'sources') return saveSources({ items: clean.map((i) => ({ key: i.key, label: i.label, warm: Boolean(i.warm), active: i.active !== false })) })
  if (kind === 'sectors') return saveSectors({ items: clean.map((i) => ({ key: i.key, label: i.label, primary: Boolean(i.primary), active: i.active !== false })) })
  return saveReasons({ kind, items: clean.map((i) => ({ key: i.key, label: i.label, active: i.active !== false })) })
}

/** Ordered list editor for Orbit settings (rename, reorder, flags, add, remove). */
export function ListEditor({ kind, initial, canEdit, hint }: { kind: ListKind; initial: Item[]; canEdit: boolean; hint?: string }) {
  const [items, setItemsRaw] = useState<Item[]>(initial)
  // Per-row errors from the server ('items.2.probability'); any edit clears them since row indexes may shift.
  const [errors, setErrors] = useState<Record<string, string>>({})
  const setItems: typeof setItemsRaw = (next) => {
    setErrors({})
    setItemsRaw(next)
  }
  const [run, pending] = useAction((list: Item[]) => save(kind, list))
  const submit = async () => {
    const result = await run(items)
    setErrors(result.ok ? {} : (result.fieldErrors ?? {}))
  }
  const rowError = (i: number) => errors[`items.${i}.label`] ?? errors[`items.${i}.probability`] ?? errors[`items.${i}.color`] ?? null
  const patch = (i: number, p: Partial<Item>) => setItems((list) => list.map((item, idx) => (idx === i ? { ...item, ...p } : kind === 'sectors' && p.primary ? { ...item, primary: false } : item)))
  const add = () => setItems((list) => [...list, kind === 'stages' ? { label: '', probability: 50, color: 'orchid' } : { label: '', active: true }])
  const decreasing = kind === 'stages' && items.some((s, i) => i > 0 && Number(s.probability ?? 0) < Number(items[i - 1].probability ?? 0))

  return (
    <div className="space-y-3">
      {hint ? <p className="text-[13px] text-fg-2">{hint}</p> : null}
      <ul>
        {items.map((item, i) => (
          <li key={item.key ?? `new-${i}`} className={cn('flex flex-wrap items-center gap-2 border-b border-white/[0.07] py-2.5', item.active === false && 'opacity-60')}>
            <div className="flex flex-col">
              <IconButton label="Move up" size="sm" disabled={!canEdit || i === 0} onClick={() => setItems((l) => move(l, i, i - 1))}><ArrowUp className="size-3.5" /></IconButton>
              <IconButton label="Move down" size="sm" disabled={!canEdit || i === items.length - 1} onClick={() => setItems((l) => move(l, i, i + 1))}><ArrowDown className="size-3.5" /></IconButton>
            </div>
            <Input value={item.label} onChange={(e) => patch(i, { label: e.target.value })} disabled={!canEdit} aria-label="Label" aria-invalid={Boolean(errors[`items.${i}.label`])} maxLength={40} className={cn('min-w-40 flex-1', errors[`items.${i}.label`] && 'ring-1 ring-danger')} inputSize="sm" placeholder="Label" />
            {kind === 'stages' ? (
              <>
                <Input value={String(item.probability ?? 0)} onChange={(e) => patch(i, { probability: Number(e.target.value.replace(/\D/g, '')) })} disabled={!canEdit} aria-label="Probability %" aria-invalid={Boolean(errors[`items.${i}.probability`])} inputMode="numeric" className={cn('w-24', errors[`items.${i}.probability`] && 'ring-1 ring-danger')} inputSize="sm" trailing="%" />
                <div className="flex gap-1.5 px-1" role="radiogroup" aria-label="Colour">
                  {STAGE_COLOR_KEYS.map((c) => (
                    <button key={c} type="button" role="radio" aria-checked={item.color === c} aria-label={c} disabled={!canEdit} onClick={() => patch(i, { color: c })} title={c} className={cn('size-5 rounded-[6px] transition-[box-shadow,transform] duration-150', item.color === c ? 'shadow-[0_0_0_2px_#171717,0_0_0_3.5px_#fff]' : 'hover:scale-105')} style={{ background: dealStageFill(STAGE_COLORS[c]).bg }} />
                  ))}
                </div>
              </>
            ) : null}
            {kind === 'sources' ? <Switch checked={Boolean(item.warm)} onCheckedChange={(v) => patch(i, { warm: v })} disabled={!canEdit} label="Warm" /> : null}
            {kind === 'sectors' ? (
              <label className="inline-flex items-center gap-1.5 text-[13px] text-white"><input type="radio" name="primary-sector" checked={Boolean(item.primary)} onChange={() => patch(i, { primary: true })} disabled={!canEdit} className="accent-[#56397D]" />Primary</label>
            ) : null}
            {kind !== 'stages' ? <Switch checked={item.active !== false} onCheckedChange={(v) => patch(i, { active: v })} disabled={!canEdit} label="Active" /> : null}
            {canEdit && !(kind === 'lost' && item.key === 'other') ? (
              <IconButton label="Remove" size="sm" onClick={() => setItems((l) => l.filter((_, idx) => idx !== i))}><Trash2 className="size-4" /></IconButton>
            ) : null}
            {rowError(i) ? <p role="alert" className="basis-full pl-9 text-xs text-danger">{rowError(i)}</p> : null}
          </li>
        ))}
        {kind === 'stages' ? (
          <>
            <li className="flex h-11 items-center justify-between pl-9 pr-2 text-sm text-fg-2"><span className="text-white">Won</span><span className="text-[13px] text-[#979797]">100% · fixed</span></li>
            <li className="flex h-11 items-center justify-between pl-9 pr-2 text-sm text-fg-2"><span className="text-white">Lost</span><span className="text-[13px] text-[#979797]">0% · fixed</span></li>
          </>
        ) : null}
      </ul>
      {decreasing ? <p className="text-[13px] text-warning">Probability usually rises down the list. Check the order.</p> : null}
      {canEdit ? (
        <div className="flex flex-wrap justify-between gap-2">
          <Button size="sm" variant="ghost" icon={<Plus className="size-4" />} onClick={add} disabled={kind === 'stages' && items.length >= 8}>Add</Button>
          <Button size="sm" variant="primary" loading={pending} onClick={submit}>Save</Button>
        </div>
      ) : null}
    </div>
  )
}
