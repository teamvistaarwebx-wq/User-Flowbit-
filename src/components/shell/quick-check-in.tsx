'use client'

import { cn } from '@/lib/utils'
import type { PunchType } from '@/lib/attendance-core'
import { BreakPicker } from './break-picker'
import { PUNCH_ICON, usePunch } from './use-punch'
import { useT } from './use-t'
import { LocatingDialog, LocationConsentDialog } from './location-consent-dialog'
import { PunchDial } from './punch-dial'
import { dialView } from './punch-dial-model'

/** State colour on the button's dot: green while working, amber on a break, grey when out. */
const DOT = { in: 'bg-success', break: 'bg-warning', out: 'bg-fg-3' } as const

/**
 * Phone and tablet top bar: one tap to check in, out or resume, without opening the drawer (the side panel's
 * check-in card is only in the drawer below 1024px). Hidden when today is locked or nothing can be punched.
 */
export function QuickCheckIn() {
  const { state, now, mounted, worked, onBreak, run, disabled, breaks, workdayMinutes, consent, locating } = usePunch({ refresh: true })
  const t = useT()
  // On a break, Resume comes first; checked in, Check out is the quick action, with Take break (the picker) beside it.
  const action = state.state === 'in' ? state.allowed.find((a) => a === 'out') : state.allowed[0]
  if (state.locked || !action) return null
  const Icon = PUNCH_ICON[action]
  const canBreak = state.allowed.includes('break_start')
  const BreakGlyph = PUNCH_ICON.break_start
  const dial = dialView({ today: state, now, worked, onBreak, policies: breaks, dayMinutes: workdayMinutes }, t)
  return (
    <span className="inline-flex items-center">
      <LocationConsentDialog {...consent} />
      <LocatingDialog {...locating} />
      {/* The same dial as the side-panel card, small: the clock, or the break's icon while on a break. */}
      <PunchDial visual={dial.visual} ring={dial.ring} status={dial.status} time={new Date(dial.handsAt)} mounted={mounted} size={30} className="mx-1" />
      {canBreak ? (
        <BreakPicker
          policies={breaks}
          used={state.breakByType}
          disabled={disabled}
          onPick={(t) => run('break_start', t)}
          trigger={
            <button type="button" disabled={disabled} aria-label={t('punch.break_start')} title={t('punch.break_start')} className="press inline-flex size-10 items-center justify-center rounded-full text-fg transition-colors hover:bg-white/[0.06] disabled:opacity-50">
              <BreakGlyph className="size-[18px]" strokeWidth={1.5} aria-hidden />
            </button>
          }
        />
      ) : null}
      <QuickPunchButton label={t(`punch.${action}`)} Icon={Icon} dot={DOT[state.state]} disabled={disabled} onClick={() => run(action)} />
    </span>
  )
}

function QuickPunchButton({ label, Icon, dot, disabled, onClick }: { label: string; Icon: (typeof PUNCH_ICON)[PunchType]; dot: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="press relative inline-flex h-10 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-medium text-fg transition-colors hover:bg-white/[0.06] disabled:opacity-50"
    >
      <span className="relative">
        <Icon className="size-[18px]" strokeWidth={1.5} aria-hidden />
        <span aria-hidden className={cn('absolute -right-0.5 -top-0.5 size-2 rounded-full ring-2 ring-[#191719]', dot)} />
      </span>
      <span className="hidden min-[400px]:inline">{label}</span>
    </button>
  )
}
