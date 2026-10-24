'use client'

import { useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, CircleCheck, Crosshair, ExternalLink, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { readPosition } from '@/components/shell/geolocation'
import { DEFAULT_LAPTOP_RADIUS_M, DEFAULT_RADIUS_M, mapsUrl, MAX_RADIUS_M, MIN_RADIUS_M, type Office } from '@/lib/geo'
import { MAPS_KEY, type LatLngLiteral } from '@/lib/google-maps'
import { guard, toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { geocodeForOffice, saveOffice } from '@/modules/muster/settings/geo-actions'
import { AddressSearch } from './address-search'
import { OfficeMap } from './office-map'

const PRESETS = [
  { label: 'Small', radiusM: 50 },
  { label: 'Standard', radiusM: 100 },
  { label: 'Campus', radiusM: 500 },
]

const metres = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`)
/** A typed coordinate; blank is "not set" rather than 0. */
const coordinate = (value: string) => (value.trim() ? Number(value) : Number.NaN)

function Label({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-medium text-fg-2">{children}</label>
}

type Draft = { name: string; address: string; point: LatLngLiteral | null; radiusM: string; laptopRadiusM: string; active: boolean }

const draftOf = (office?: Office): Draft => ({
  name: office?.name ?? '',
  address: office?.address ?? '',
  point: office ? { lat: office.lat, lng: office.lng } : null,
  radiusM: String(office?.radiusM ?? DEFAULT_RADIUS_M),
  laptopRadiusM: String(office?.laptopRadiusM ?? DEFAULT_LAPTOP_RADIUS_M),
  active: office?.active ?? true,
})

/**
 * Add or edit one office area: the name, the address (Google suggestions), the pin on the map (drag it to the
 * entrance; the pin is what check-in is measured from), the phone and laptop circles, and active or paused.
 * Without Google Maps it falls back to latitude and longitude boxes. `geocoding`: the server's Geocoding key is set,
 * so a typed address can be looked up ("Find") and a moved pin named ("Pin near").
 */
export function OfficeDialog({ office, trigger, geocoding }: { office?: Office; trigger: ReactNode; geocoding: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<Draft>(() => draftOf(office))
  // Bumped when the pin moves from outside the coordinate boxes, so those boxes show the new values.
  const [pinVersion, setPinVersion] = useState(0)
  const [near, setNear] = useState<string | null>(null)
  const [note, setNote] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null)
  const [mapsDown, setMapsDown] = useState<string | null>(MAPS_KEY ? null : 'No Google Maps key is set, so enter the coordinates.')
  const [locating, setLocating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const set = (patch: Partial<Draft>) => setDraft((cur) => ({ ...cur, ...patch }))

  const radius = Number(draft.radiusM) || 0
  const laptop = Number(draft.laptopRadiusM) || 0
  const circle = (r: number) => Math.min(MAX_RADIUS_M, Math.max(MIN_RADIUS_M, r || MIN_RADIUS_M))

  const reset = (next: boolean) => {
    setOpen(next)
    if (next) {
      setDraft(draftOf(office))
      setNear(null)
      setErrors({})
      setNote(office ? { tone: 'ok', text: 'Saved location loaded. Drag the pin to adjust.' } : null)
    }
  }

  /** The pin moved: keep the typed address, and show the nearest address as a check. */
  const movePin = (point: LatLngLiteral, text: string) => {
    set({ point })
    setPinVersion((v) => v + 1)
    setErrors((cur) => ({ ...cur, lat: '' }))
    setNote({ tone: 'ok', text })
    setNear(null)
    if (geocoding) {
      void geocodeForOffice(point)
        .then((res) => setNear(res.ok && res.data ? res.data.address : null))
        .catch(() => setNear(null))
    }
  }

  const locateMe = async () => {
    setLocating(true)
    const pos = await readPosition()
    setLocating(false)
    if ('error' in pos) {
      if (!('cancelled' in pos)) toast.error(pos.error)
      return
    }
    movePin({ lat: pos.lat, lng: pos.lng }, `Pin placed at your location (±${metres(pos.accuracy ?? 0)}). Drag it to the entrance.`)
  }

  const save = guard(async () => {
    setSaving(true)
    try {
      const res = await saveOffice({
        ...(office ? { id: office.id } : {}),
        name: draft.name,
        address: draft.address,
        lat: draft.point?.lat ?? Number.NaN,
        lng: draft.point?.lng ?? Number.NaN,
        radiusM: radius,
        laptopRadiusM: laptop,
        active: draft.active,
      })
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {})
        toast.error(res.error)
        return
      }
      toast.success(res.message ?? 'Saved')
      setOpen(false)
      router.refresh()
    } finally {
      setSaving(false)
    }
  })

  return (
    <Dialog
      open={open}
      onOpenChange={reset}
      size="xl"
      trigger={trigger}
      title={<span className="inline-flex items-center gap-2"><Building2 className="size-4 text-link" /> {office ? `Edit ${office.name}` : 'Add office'}</span>}
      description="The pin is what check-in is measured from: drag it to the building's entrance."
      footer={
        <>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="primary" loading={saving} onClick={() => void save()}>{office ? 'Save office' : 'Add office'}</Button>
        </>
      }
    >
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-4">
          <div>
            <Label htmlFor="office-name">Office name</Label>
            <Input id="office-name" value={draft.name} maxLength={80} placeholder="Bhopal head office" onChange={(e) => set({ name: e.target.value })} aria-invalid={Boolean(errors.name) || undefined} />
            {errors.name ? <p className="mt-1 text-xs text-danger">{errors.name}</p> : null}
          </div>

          <div>
            <Label>Address</Label>
            <AddressSearch
              value={draft.address}
              onChange={(address) => set({ address })}
              onPick={({ point }) => movePin(point, 'Pin placed from the address. Drag it to the exact entrance.')}
              suggest={!mapsDown}
              lookup={geocoding}
              invalid={Boolean(errors.address)}
            />
            {note ? (
              <p className={cn('mt-1.5 inline-flex items-start gap-1.5 text-xs', note.tone === 'ok' ? 'text-success' : 'text-warning')}>
                {note.tone === 'ok' ? <CircleCheck className="mt-px size-3.5 shrink-0" /> : <TriangleAlert className="mt-px size-3.5 shrink-0" />}
                {note.text}
              </p>
            ) : null}
            {errors.address ? <p className="mt-1 text-xs text-danger">{errors.address}</p> : null}
          </div>

          <div className="rounded-[10px] bg-white/[0.03] p-3.5">
            <p className="text-sm font-medium text-fg">Check-in circle</p>
            <p className="mt-0.5 text-xs text-fg-2">People must be inside it to count as at this office. Laptops find their place by Wi-Fi, often hundreds of metres out, so their reading is held to the larger laptop circle.</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => set({ radiusM: String(p.radiusM) })}
                  className={cn('rounded-full px-3 py-1 text-xs ring-1 ring-inset transition-colors', radius === p.radiusM ? 'bg-white/[0.08] text-fg ring-white/[0.3]' : 'text-fg-2 ring-white/[0.12] hover:text-fg')}
                >
                  {p.label} · {p.radiusM} m
                </button>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="office-radius">Phone circle (m)</Label>
                <Input id="office-radius" inputMode="numeric" value={draft.radiusM} onChange={(e) => set({ radiusM: e.target.value.replace(/\D/g, '') })} aria-invalid={Boolean(errors.radiusM) || undefined} />
                {errors.radiusM ? <p className="mt-1 text-xs text-danger">{errors.radiusM}</p> : null}
              </div>
              <div>
                <Label htmlFor="office-laptop">Laptop circle (m)</Label>
                <Input id="office-laptop" inputMode="numeric" value={draft.laptopRadiusM} onChange={(e) => set({ laptopRadiusM: e.target.value.replace(/\D/g, '') })} aria-invalid={Boolean(errors.laptopRadiusM) || undefined} />
                {errors.laptopRadiusM ? <p className="mt-1 text-xs text-danger">{errors.laptopRadiusM}</p> : null}
              </div>
            </div>
          </div>

          <Switch
            checked={draft.active}
            onCheckedChange={(active) => set({ active })}
            label="Active for check-in"
            description={draft.active ? 'Check-ins are measured against this office.' : 'Paused: check-ins ignore this office until you turn it back on.'}
          />
        </div>

        <div className="order-first space-y-2 lg:order-none">
          {mapsDown ? (
            <div className="rounded-[10px] bg-white/[0.03] p-3.5">
              <p className="inline-flex items-start gap-1.5 text-xs text-warning"><TriangleAlert className="mt-px size-3.5 shrink-0" /> {mapsDown}</p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="office-lat">Latitude</Label>
                  <Input key={`lat-${pinVersion}`} id="office-lat" inputMode="decimal" placeholder="23.233600" defaultValue={draft.point?.lat ?? ''} onChange={(e) => set({ point: { lat: coordinate(e.target.value), lng: draft.point?.lng ?? Number.NaN } })} />
                </div>
                <div>
                  <Label htmlFor="office-lng">Longitude</Label>
                  <Input key={`lng-${pinVersion}`} id="office-lng" inputMode="decimal" placeholder="77.434300" defaultValue={draft.point?.lng ?? ''} onChange={(e) => set({ point: { lat: draft.point?.lat ?? Number.NaN, lng: coordinate(e.target.value) } })} />
                </div>
              </div>
            </div>
          ) : (
            <OfficeMap
              point={draft.point}
              radiusM={circle(radius)}
              laptopRadiusM={circle(Math.max(radius, laptop))}
              onMove={(point) => movePin(point, 'Pin moved. The circle is measured from here.')}
              onUnavailable={(reason) => setMapsDown(`${reason} Enter the coordinates instead.`)}
              className="h-72 lg:h-[420px]"
            />
          )}
          {errors.lat || errors.lng ? <p className="text-xs text-danger">{errors.lat || errors.lng}</p> : null}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-2">
            <Button size="sm" variant="ghost" loading={locating} icon={<Crosshair className="size-3.5" />} onClick={() => void locateMe()}>Use my location</Button>
            {draft.point && Number.isFinite(draft.point.lat) && Number.isFinite(draft.point.lng) ? (
              <>
                <span className="tabular-nums">{draft.point.lat.toFixed(6)}, {draft.point.lng.toFixed(6)}</span>
                <a href={mapsUrl(draft.point)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-link hover:underline">Open in Google Maps <ExternalLink className="size-3" /></a>
              </>
            ) : (
              <span>{mapsDown ? 'Enter the coordinates, or use your location.' : 'Search the address, click the map, or use your location.'}</span>
            )}
          </div>
          {!mapsDown ? (
            <p className="flex flex-wrap gap-x-3 text-xs text-fg-2">
              <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-[rgb(91,141,239)]" aria-hidden /> Phone {metres(circle(radius))}</span>
              <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-fg-3" aria-hidden /> Laptop {metres(circle(Math.max(radius, laptop)))}</span>
            </p>
          ) : null}
          {near ? <p className="text-xs text-fg-2"><span className="text-fg-3">Pin near:</span> {near}</p> : null}
        </div>
      </div>
    </Dialog>
  )
}
