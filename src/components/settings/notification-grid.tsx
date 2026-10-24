'use client'

import { useState } from 'react'
import { Lock } from 'lucide-react'
import type { ActionResult } from '@/lib/action-types'
import type { Channel } from '@/modules/messaging/events'
import type { GridRowData } from '@/modules/messaging/grid-rows'
import { cn } from '@/lib/utils'
import { useAction } from '@/components/ui/action-form'
import { Switch } from '@/components/ui/switch'
import { Tooltip } from '@/components/ui/tooltip'
import { useWhatsAppOn } from '@/components/shell/shell-context'

type GridChannel = Channel
type GridRow = GridRowData

type SetCell = (input: { group: string; channel: GridChannel; value: boolean | null }) => Promise<ActionResult>

const COLUMNS: { key: GridChannel; label: string }[] = [
  { key: 'inapp', label: 'In-app' },
  { key: 'email', label: 'Email' },
  { key: 'whatsapp', label: 'WhatsApp' },
]

const GRID = 'sm:grid-cols-[1fr_5.5rem_5.5rem_6.5rem]'
/** In-app and Email only, while the platform WhatsApp flag is off (lib/feature-flags). */
const GRID_NO_WHATSAPP = 'sm:grid-cols-[1fr_5.5rem_5.5rem]'

/**
 * Event group × channel switches (notifications-v2 §5). WhatsApp is shown but
 * disabled until it can be used (`whatsappBlocked` says why); fixed rules
 * show a lock. `followLabel` names what an untouched cell follows
 * ("Flowbit default", "workspace default").
 */
export function NotificationGrid({ rows: initial, setCell, followLabel, whatsappBlocked = 'Connect WhatsApp in Settings → Integrations' }: { rows: GridRow[]; setCell: SetCell; followLabel: string; /** Why WhatsApp cannot be switched on, or null when it can. */ whatsappBlocked?: string | null }) {
  const [rows, setRows] = useState(initial)
  const [run, pending] = useAction(setCell, { noRefresh: true })
  const whatsappOn = useWhatsAppOn()
  const columns = whatsappOn ? COLUMNS : COLUMNS.filter((c) => c.key !== 'whatsapp')
  const grid = whatsappOn ? GRID : GRID_NO_WHATSAPP

  const toggle = async (group: string, channel: GridChannel, value: boolean) => {
    const previous = rows
    setRows(rows.map((r) => (r.group === group ? { ...r, cells: { ...r.cells, [channel]: { ...r.cells[channel], on: value, overridden: true } } } : r)))
    const result = await run({ group, channel, value })
    if (!result.ok) setRows(previous)
  }

  const reset = async (group: string, channel: GridChannel) => {
    const result = await run({ group, channel, value: null })
    if (result.ok) setRows(rows.map((r) => (r.group === group ? { ...r, cells: { ...r.cells, [channel]: { ...r.cells[channel], overridden: false } } } : r)))
  }

  return (
    <div className="border-t border-line">
      <div aria-hidden className={cn('hidden h-[33px] items-center gap-3 border-b border-line px-[23px] text-sm text-white sm:grid', grid)}>
        <span>Alert</span>
        {columns.map((c) => (
          <span key={c.key} className="text-center">
            {c.label}
          </span>
        ))}
      </div>
      <ul className="divide-y divide-white/[0.06]">
        {rows.map((row) => (
          <li key={row.group} className={cn('grid grid-cols-1 gap-3 px-[23px] py-3 sm:items-center', grid)}>
            <div className="min-w-0">
              <p className="text-sm text-white">{row.label}</p>
              <p className="text-xs text-[#959596]">{row.description}</p>
            </div>
            {columns.map((c) => (
              <Cell key={c.key} row={row} channel={c.key} label={c.label} disabled={pending} followLabel={followLabel} blocked={c.key === 'whatsapp' ? whatsappBlocked : null} onToggle={toggle} onReset={reset} />
            ))}
          </li>
        ))}
      </ul>
    </div>
  )
}

function Cell({ row, channel, label, disabled, followLabel, blocked, onToggle, onReset }: { row: GridRow; channel: GridChannel; label: string; disabled: boolean; followLabel: string; blocked: string | null; onToggle: (g: string, c: GridChannel, v: boolean) => void; onReset: (g: string, c: GridChannel) => void }) {
  const cell = row.cells[channel]
  const whatsapp = Boolean(blocked)
  const control = (
    <span className="flex items-center gap-2 sm:justify-center">
      <span className="w-16 text-xs text-fg-3 sm:hidden">{label}</span>
      <Switch aria-label={`${row.label}: ${label}`} checked={cell.on} disabled={disabled || cell.fixed || whatsapp} onCheckedChange={(v) => onToggle(row.group, channel, v)} />
      {cell.fixed ? <Lock className="size-3.5 text-icon-muted" aria-label="Fixed by Flowbit" /> : null}
      {cell.overridden && !cell.fixed && !whatsapp ? (
        <button type="button" className="text-[11px] text-link hover:underline" onClick={() => onReset(row.group, channel)} disabled={disabled}>
          Reset
        </button>
      ) : null}
    </span>
  )
  if (blocked) return <Tooltip content={blocked}>{control}</Tooltip>
  if (cell.fixed) return <Tooltip content="Fixed by Flowbit: security emails always go; account notices never come from your workspace's WhatsApp.">{control}</Tooltip>
  return cell.overridden ? control : <Tooltip content={`Following the ${followLabel}`}>{control}</Tooltip>
}
