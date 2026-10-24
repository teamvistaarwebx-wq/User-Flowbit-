'use client'

import { useState } from 'react'
import { BellOff, Layers, MoonStar } from 'lucide-react'
import { formatDateTime } from '@/lib/dates'
import { useAction } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { DateInput } from '@/components/ui/input'
import { RadioCards } from '@/components/ui/radio-cards'
import { SurfaceHeader } from '@/components/settings/surface'
import { resetMyPrefs, setMyDelivery, snoozeMyAlerts } from '@/modules/messaging/settings-actions'

type Digest = 'off' | 'hourly' | 'daily'
type QuietMode = 'workspace' | 'custom' | 'off'
type Quiet = { enabled: boolean; start: string; end: string }

export type PersonalDeliveryProps = { digest: Digest; quietMode: QuietMode; quietHours: Quiet; workspaceQuiet: string | null; snoozedUntil: string | null; hasOverrides: boolean }

/** Snooze, digest and quiet hours for one person. */
export function PersonalDelivery(props: PersonalDeliveryProps) {
  return (
    <div className="space-y-4">
      <SnoozeCard snoozedUntil={props.snoozedUntil} />
      <DeliveryCard {...props} />
    </div>
  )
}

function SnoozeCard({ snoozedUntil }: { snoozedUntil: string | null }) {
  const [date, setDate] = useState('')
  const [snooze, pending] = useAction(snoozeMyAlerts)
  return (
    <section className="card-table p-5">
      <SurfaceHeader icon={<BellOff strokeWidth={1.5} />} label="Snooze" description={snoozedUntil ? `Alert emails are paused until ${formatDateTime(snoozedUntil)}. The bell still collects them.` : 'Pause alert emails for a while. Security emails still go.'} />
      <div className="mt-4 flex flex-wrap gap-2">
        {snoozedUntil ? (
          <Button variant="primary" size="sm" loading={pending} onClick={() => snooze({ preset: 'off' })}>
            Resume now
          </Button>
        ) : (
          <>
            <Button variant="secondary" size="sm" disabled={pending} onClick={() => snooze({ preset: '1h' })}>
              1 hour
            </Button>
            <Button variant="secondary" size="sm" disabled={pending} onClick={() => snooze({ preset: 'today' })}>
              Rest of today
            </Button>
          </>
        )}
      </div>
      {!snoozedUntil ? (
        <div className="mt-3 flex items-center gap-2">
          <DateInput aria-label="Snooze until" value={date} onChange={(e) => setDate(e.target.value)} className="flex-1" />
          <Button variant="secondary" size="sm" disabled={pending || !date} onClick={() => snooze({ preset: 'date', date })}>
            Until then
          </Button>
        </div>
      ) : null}
    </section>
  )
}

function DeliveryCard({ digest: d, quietMode: qm, quietHours: qh, workspaceQuiet, hasOverrides }: PersonalDeliveryProps) {
  const [digest, setDigest] = useState<Digest>(d)
  const [quietMode, setQuietMode] = useState<QuietMode>(qm)
  const [quiet, setQuiet] = useState<Quiet>({ ...qh, enabled: true })
  const [save, saving] = useAction(setMyDelivery)
  const [reset, resetting] = useAction(resetMyPrefs)
  return (
    <section className="card-table space-y-5 p-5">
      <div>
        <SurfaceHeader icon={<Layers strokeWidth={1.5} />} label="Digest" description="Batch alert emails instead of one email per alert. Urgent ones still go at once." />
        <RadioCards
          className="mt-3"
          columns={1}
          value={digest}
          onValueChange={(v) => setDigest(v as Digest)}
          options={[
            { value: 'off', title: 'One email per alert', description: 'Comments still come as an hourly digest.' },
            { value: 'hourly', title: 'Hourly digest', description: 'At most one alert email an hour.' },
            { value: 'daily', title: 'End-of-day digest', description: 'One email at 6 pm.' },
          ]}
        />
      </div>
      <div>
        <SurfaceHeader icon={<MoonStar strokeWidth={1.5} />} label="Quiet hours" description="Alert emails in these hours wait until they end." />
        <RadioCards
          className="mt-3"
          columns={1}
          value={quietMode}
          onValueChange={(v) => setQuietMode(v as QuietMode)}
          options={[
            { value: 'workspace', title: 'Workspace quiet hours', description: workspaceQuiet ? `${workspaceQuiet} IST` : 'The workspace has none.' },
            { value: 'custom', title: 'My own hours', description: 'Set below.' },
            { value: 'off', title: 'No quiet hours', description: 'Email me at any hour.' },
          ]}
        />
        {quietMode === 'custom' ? (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="space-y-1 text-xs text-fg-3">
              <span>From</span>
              <DateInput type="time" value={quiet.start} onChange={(e) => setQuiet({ ...quiet, start: e.target.value })} />
            </label>
            <label className="space-y-1 text-xs text-fg-3">
              <span>Until</span>
              <DateInput type="time" value={quiet.end} onChange={(e) => setQuiet({ ...quiet, end: e.target.value })} />
            </label>
          </div>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" loading={saving} onClick={() => save({ digest, quietMode, quietHours: quiet })}>
          Save
        </Button>
        {hasOverrides ? (
          <Button variant="ghost" loading={resetting} onClick={() => reset({})}>
            Use workspace defaults
          </Button>
        ) : null}
      </div>
    </section>
  )
}
