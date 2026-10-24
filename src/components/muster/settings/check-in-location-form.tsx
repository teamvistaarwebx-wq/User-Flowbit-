'use client'

import Link from 'next/link'
import { Building2, Laptop, MapPin, Pencil, Plus, Trash2 } from 'lucide-react'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Badge } from '@/components/ui/badge'
import { Button, IconButton } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Select } from '@/components/ui/select'
import { MAX_OFFICES, type GeoSettings, type Office } from '@/lib/geo'
import { removeOffice, saveCheckInLocation } from '@/modules/muster/settings/geo-actions'
import { OfficeDialog } from './office-dialog'

const MODE_OPTIONS = [
  { value: 'off', label: 'Off: never ask' },
  { value: 'optional', label: 'Optional: ask, allow without' },
  { value: 'required', label: 'Required: no check-in without it' },
]
const OUTSIDE_OPTIONS = [
  { value: 'flag', label: 'Allow, and flag it as outside' },
  { value: 'block', label: 'Block the check-in' },
]

const metres = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`)

/**
 * Location at web check-in: the mode and the outside rule (saved together), then the office areas, each added and
 * saved on its own in the office editor (address, map pin, phone and laptop circles). The location is read only
 * when someone checks in or out, after they accept a notice; remote employees are never asked.
 */
export function CheckInLocationForm({ settings, canWrite, remoteCount, geocoding }: { settings: GeoSettings; canWrite: boolean; remoteCount: number; geocoding: boolean }) {
  return (
    <Card variant="solid" className="mt-4">
      <CardHeader label="Location at check-in" icon={<MapPin />} description="Read once when someone checks in or out on the web or phone, never tracked. People see a notice and agree first." />
      <ActionForm action={saveCheckInLocation}>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField name="mode" label="Ask for location">
            <Select name="mode" defaultValue={settings.mode} options={MODE_OPTIONS} disabled={!canWrite} />
          </FormField>
          <FormField name="outside" label="Outside every office area" help="Only applies when there is at least one active office below.">
            <Select name="outside" defaultValue={settings.outside} options={OUTSIDE_OPTIONS} disabled={!canWrite} />
          </FormField>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-fg-2">
            <Laptop className="size-3.5" aria-hidden />
            Remote employees are never asked for their location.
            <span>{remoteCount === 0 ? 'Nobody is remote yet.' : `${remoteCount} ${remoteCount === 1 ? 'person is' : 'people are'} remote.`}</span>
            <Link href={remoteCount ? '/app/hr/people?mode=remote' : '/app/hr/people'} className="text-link hover:underline">Set work mode in People</Link>
          </p>
          {canWrite ? <SubmitButton>Save location settings</SubmitButton> : null}
        </div>
      </ActionForm>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-fg">Offices</p>
          <p className="text-xs text-fg-2">A check-in inside the circle of any active office counts as at that office. Optional: with none, the location is only saved.</p>
        </div>
        {canWrite && settings.offices.length < MAX_OFFICES ? (
          <OfficeDialog geocoding={geocoding} trigger={<Button size="sm" variant="secondary" icon={<Plus className="size-4" />}>Add office</Button>} />
        ) : null}
      </div>
      {settings.offices.length ? (
        <ul className="mt-3 divide-y divide-white/[0.06] overflow-hidden rounded-[10px] bg-white/[0.03]">
          {settings.offices.map((o) => <OfficeRow key={o.id} office={o} canWrite={canWrite} geocoding={geocoding} />)}
        </ul>
      ) : (
        <p className="mt-3 rounded-[10px] bg-white/[0.03] px-4 py-5 text-center text-sm text-fg-2">No offices yet. Add one to check that people are at work when they check in.</p>
      )}
    </Card>
  )
}

function OfficeRow({ office: o, canWrite, geocoding }: { office: Office; canWrite: boolean; geocoding: boolean }) {
  return (
    <li className="flex items-center gap-3 px-3.5 py-3">
      <Building2 className="size-4 shrink-0 text-fg-2" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-fg">{o.name}</p>
        <p className="truncate text-xs text-fg-2">{o.address || `${o.lat.toFixed(6)}, ${o.lng.toFixed(6)}`}</p>
      </div>
      <span className="hidden whitespace-nowrap text-xs text-fg-2 sm:inline">{metres(o.radiusM)} · laptop {metres(o.laptopRadiusM)}</span>
      <Badge tone={o.active ? 'success' : 'neutral'}>{o.active ? 'Active' : 'Paused'}</Badge>
      {canWrite ? (
        <span className="flex items-center gap-1">
          <OfficeDialog office={o} geocoding={geocoding} trigger={<IconButton label={`Edit ${o.name}`} size="sm"><Pencil className="size-4" /></IconButton>} />
          <ConfirmDialog
            trigger={<IconButton label={`Remove ${o.name}`} size="sm"><Trash2 className="size-4" /></IconButton>}
            title={`Remove ${o.name}?`}
            description="Check-ins are no longer measured against this office. Past check-ins keep the office they were matched to. To stop it for a while, edit it and pause it instead."
            confirmLabel="Remove office"
            onConfirm={() => removeOffice({ id: o.id })}
          />
        </span>
      ) : null}
    </li>
  )
}
