'use client'

import type { ReactElement } from 'react'
import { formatDuration, formatTime } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { BreakPicker } from './break-picker'
import type { ClockTone } from './glossy-clock'
import { PunchDial } from './punch-dial'
import { currentBreakMinutes, dialView } from './punch-dial-model'
import { PUNCH_ICON as ICON, usePunch } from './use-punch'
import { useT } from './use-t'
import { LocatingDialog, LocationConsentDialog } from './location-consent-dialog'

/** Light the disc throws onto the card's top edge and right side. */
const LEAK: Record<ClockTone, string> = { in: 'rgba(80,220,140,0.55)', break: 'rgba(255,130,40,0.6)', out: 'rgba(200,200,210,0.25)' }

/** The pill under the card: transparent, a 1px gradient stroke lit at the left and bottom (Figma). */
const strokeButton =
  'edge-stroke press inline-flex h-8 items-center justify-center gap-1.5 rounded-full text-xs font-medium text-white transition-[background-color] hover:bg-white/[0.04] disabled:opacity-50 [--stroke:var(--grad-stroke-brand)]'

/** Side-panel check-in card (Figma 232 x 77): state label, live timer, the punch dial (clock or break icon), and the punch button. */
export function CheckInWidget() {
  const { state, now, mounted, worked, onBreak, run, disabled, remote, breaks, workdayMinutes, consent, locating } = usePunch()
  const t = useT()
  const LABEL = (p: keyof typeof ICON) => t(`punch.${p}`)

  const [primary, secondary] = state.allowed
  const notStarted = state.state === 'out' && !state.lastOut && !state.firstIn
  const tone: ClockTone = state.state
  const detail = [
    state.firstIn ? t('punch.inAt', { time: formatTime(state.firstIn) }) : null,
    currentBreakMinutes(state, now) >= 1 ? `${t('punch.breakNow', { m: Math.round(currentBreakMinutes(state, now)) })}${state.breakType ? ` (${t(`break.${state.breakType}`)})` : ''}` : null,
    state.firstIn ? t('punch.effectivePayable', { effective: formatDuration(state.workedMinutes), payable: formatDuration(state.payableMinutes) }) : null,
  ].filter(Boolean).join(' · ')
  // Worked time while working, the running break's own time on a break; the dial's ring follows the same state.
  const dial = dialView({ today: state, now, worked, onBreak, policies: breaks, dayMinutes: workdayMinutes }, t)
  const breakPicker = (button: ReactElement) => <BreakPicker trigger={button} policies={breaks} used={state.breakByType} onPick={(t) => run('break_start', t)} disabled={disabled} />

  return (
    <div data-tour="check-in">
      <LocationConsentDialog {...consent} />
      <LocatingDialog {...locating} />
      <div
        className="edge-stroke h-[77px] overflow-hidden rounded-[10px] bg-[linear-gradient(180deg,#202020_0%,#171717_70%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] [--stroke:linear-gradient(120deg,rgba(255,255,255,0.45)_0%,rgba(255,255,255,0.1)_40%,rgba(255,255,255,0.05)_70%,rgba(255,255,255,0.14)_100%)]"
        title={detail || undefined}
      >
        {/* Coloured light leaking onto the top edge above the disc and down the right side. */}
        <span aria-hidden className="absolute -top-3 right-2 h-6 w-28 rounded-full blur-[10px]" style={{ background: LEAK[tone] }} />
        <span aria-hidden className="absolute -right-3 top-6 h-12 w-5 rounded-full blur-[9px]" style={{ background: LEAK[tone] }} />
        <div className="relative z-[1] pl-[17px] pt-[19px]">
          <div className="flex items-center gap-1.5 text-[13px] font-semibold uppercase leading-4 tracking-[0.02em] text-[#8D8D8D]">
            <span className="truncate">{notStarted ? t('punch.in') : state.state === 'break' && state.breakType ? t(`break.${state.breakType}`) : t(`punch.state.${state.state}`)}</span>
            {remote ? (
              <span title={t('punch.remoteHint')} className="shrink-0 rounded-full bg-white/[0.08] px-1.5 py-px text-[10px] font-medium normal-case tracking-normal text-fg-2">{t('punch.remote')}</span>
            ) : null}
          </div>
          {/* The break timer reads the client clock, so its first paint may differ from the server's by a minute. */}
          <div className="mt-px text-[17px] font-bold uppercase leading-[22px] tabular-nums tracking-[0.01em] text-white" suppressHydrationWarning>
            {dial.timer}
          </div>
        </div>
        <PunchDial visual={dial.visual} ring={dial.ring} status={dial.status} time={new Date(dial.handsAt)} mounted={mounted} size={92} className="absolute -bottom-[22px] right-0 z-[1] drop-shadow-[0_6px_14px_rgba(0,0,0,0.45)]" />
      </div>
      {state.locked ? (
        <p className="mt-3 text-center text-xs text-fg-2">{t('punch.lockedToday')}</p>
      ) : (
        <div className="mt-3 flex gap-2">
          {primary ? (
            (() => {
              const I = ICON[primary]
              const button = (
                <button type="button" disabled={disabled} onClick={primary === 'break_start' ? undefined : () => run(primary)} className={cn(strokeButton, 'flex-1')}>
                  <I className="size-3.5" strokeWidth={1.5} />
                  {LABEL(primary)}
                </button>
              )
              return primary === 'break_start' ? breakPicker(button) : button
            })()
          ) : null}
          {secondary ? (
            (() => {
              const I = ICON[secondary]
              const button = (
                <button type="button" disabled={disabled} onClick={secondary === 'break_start' ? undefined : () => run(secondary)} title={LABEL(secondary)} aria-label={LABEL(secondary)} className={cn(strokeButton, 'w-8')}>
                  <I className="size-3.5" strokeWidth={1.5} />
                </button>
              )
              return secondary === 'break_start' ? breakPicker(button) : button
            })()
          ) : null}
        </div>
      )}
    </div>
  )
}
