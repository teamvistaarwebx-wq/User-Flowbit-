'use client'

import { useState } from 'react'
import { useAction } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { DateInput } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { setWorkspaceQuietHours } from '@/modules/messaging/settings-actions'

type Quiet = { enabled: boolean; start: string; end: string }

/** Workspace quiet hours (IST): default 21:00 to 08:00. */
export function QuietHoursForm({ initial }: { initial: Quiet }) {
  const [quiet, setQuiet] = useState(initial)
  const [save, saving] = useAction(setWorkspaceQuietHours)
  return (
    <div className="space-y-4">
      <Switch label="Hold alert emails at night" description={quiet.enabled ? `From ${quiet.start} to ${quiet.end} IST` : 'Off: alerts email at any hour'} checked={quiet.enabled} onCheckedChange={(enabled) => setQuiet({ ...quiet, enabled })} />
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1 text-xs text-fg-3">
          <span>From</span>
          <DateInput type="time" value={quiet.start} disabled={!quiet.enabled} onChange={(e) => setQuiet({ ...quiet, start: e.target.value })} />
        </label>
        <label className="space-y-1 text-xs text-fg-3">
          <span>Until</span>
          <DateInput type="time" value={quiet.end} disabled={!quiet.enabled} onChange={(e) => setQuiet({ ...quiet, end: e.target.value })} />
        </label>
      </div>
      <Button variant="primary" loading={saving} onClick={() => save(quiet)}>
        Save quiet hours
      </Button>
    </div>
  )
}
