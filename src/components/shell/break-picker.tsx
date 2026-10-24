'use client'

import { useState, type ReactElement } from 'react'
import { breakUsage, type BreakMinutes, type BreakPolicies, type BreakType } from '@/lib/break-types'
import { cn } from '@/lib/utils'
import { Popover } from '@/components/ui/popover'
import { GlassBreakIcon } from '@/components/muster/ui/glass-break-icon'
import { useT } from './use-t'

/**
 * Take break → which one: Lunch, Power Nap, Tea/Coffee, Personal/Rest, each
 * with paid or unpaid and the minutes left today. A type whose daily limit is
 * used up is shown but cannot be picked (the server refuses it too).
 */
export function BreakPicker({ trigger, policies, used, onPick, disabled }: { trigger: ReactElement; policies: BreakPolicies; used: BreakMinutes; onPick: (type: BreakType) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  const t = useT()
  return (
    <Popover trigger={trigger} open={open} onOpenChange={setOpen} align="start" className="w-64 p-1.5">
      <p className="px-2.5 pb-1.5 pt-1 text-xs text-fg-3">{t('break.which')}</p>
      <ul>
        {breakUsage(used, policies).map((u) => {
          const spent = u.left === 0
          return (
            <li key={u.type}>
              <button
                type="button"
                disabled={disabled || spent}
                onClick={() => {
                  setOpen(false)
                  onPick(u.type)
                }}
                className={cn('flex w-full items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-left transition-colors', spent ? 'cursor-not-allowed opacity-45' : 'hover:bg-white/[0.06]')}
              >
                <GlassBreakIcon type={u.type} size={30} progress={u.limit ? u.used / u.limit : null} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-white">{t(`break.${u.type}`)}</span>
                  <span className="block text-[11px] text-fg-3">{u.paid ? t('common.paid') : t('common.unpaid')} · {spent ? t('break.used', { limit: u.limit }) : t('break.left', { left: u.left, limit: u.limit })}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </Popover>
  )
}
