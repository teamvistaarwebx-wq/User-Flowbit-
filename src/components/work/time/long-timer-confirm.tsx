'use client'

import type { ReactElement } from 'react'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { formatDuration } from '@/lib/dates'
import { stopTimer } from '@/modules/work/time/actions'

/**
 * Wraps a Stop button for a timer that looks forgotten (over 10 h or past midnight):
 * the button opens a confirm instead of logging the whole span straight away.
 * The wrapped button must not stop the timer itself (leave its onClick unset).
 */
export function LongTimerConfirm({ minutes, trigger, onStopped }: { minutes: number; trigger: ReactElement; onStopped: () => void }) {
  return (
    <ConfirmDialog
      trigger={trigger}
      title="Log this long timer?"
      description={`This timer has been running for ${formatDuration(minutes)}. Stopping it logs all of that on the day it started. If you forgot it, stop it and then fix the time in the entries list.`}
      confirmLabel={`Log ${formatDuration(minutes)}`}
      tone="primary"
      onConfirm={async () => {
        const result = await stopTimer({ confirmLong: true })
        if (result.ok) onStopped()
        return result
      }}
    />
  )
}
