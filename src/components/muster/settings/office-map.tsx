'use client'

import { useEffect, useRef, useState } from 'react'
import { importLibrary, MAP_ID, onMapsRefused, toLiteral, type GCircle, type GMap, type GMarker, type LatLngLiteral } from '@/lib/google-maps'
import { cn } from '@/lib/utils'

/** India, zoomed out, until there is a pin. */
const INDIA = { lat: 20.5937, lng: 78.9629 }
const PIN_ZOOM = 16

type Props = {
  point: LatLngLiteral | null
  radiusM: number
  laptopRadiusM: number
  /** The pin was dragged, or the map clicked. */
  onMove: (point: LatLngLiteral) => void
  /** Google could not be loaded or refused the key: the editor shows coordinate boxes instead. */
  onUnavailable: (reason: string) => void
  className?: string
}

/** The office editor's map: a draggable pin, the phone circle (solid) and the laptop circle (dashed grey). Click to move the pin. */
export function OfficeMap({ point, radiusM, laptopRadiusM, onMove, onUnavailable, className }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<GMap | null>(null)
  const marker = useRef<GMarker | null>(null)
  const circles = useRef<{ phone: GCircle; laptop: GCircle } | null>(null)
  const [ready, setReady] = useState(false)
  // Latest callbacks for the Google listeners, which are attached once.
  const moveRef = useRef(onMove)
  const unavailableRef = useRef(onUnavailable)
  useEffect(() => {
    moveRef.current = onMove
    unavailableRef.current = onUnavailable
  })

  useEffect(() => {
    let cancelled = false
    const stopRefused = onMapsRefused(() => unavailableRef.current('Google refused the Maps key. Check its website and API restrictions.'))
    Promise.all([importLibrary('maps'), importLibrary('marker')])
      .then(([{ Map, Circle }, { AdvancedMarkerElement }]) => {
        if (cancelled || !box.current) return
        const m = new Map(box.current, {
          center: INDIA,
          zoom: 4,
          mapId: MAP_ID,
          colorScheme: 'DARK',
          disableDefaultUI: true,
          zoomControl: true,
          fullscreenControl: true,
          clickableIcons: false,
          gestureHandling: 'greedy',
        })
        const pin = new AdvancedMarkerElement({ gmpDraggable: true, title: 'Office pin. Drag to the entrance.' })
        pin.addListener('dragend', () => {
          if (pin.position) moveRef.current(toLiteral(pin.position))
        })
        m.addListener('click', (e) => {
          if (e.latLng) moveRef.current(toLiteral(e.latLng))
        })
        circles.current = {
          laptop: new Circle({ strokeColor: '#9a9a9a', strokeOpacity: 0.7, strokeWeight: 1, fillColor: '#9a9a9a', fillOpacity: 0.06, clickable: false }),
          phone: new Circle({ strokeColor: '#5b8def', strokeOpacity: 0.95, strokeWeight: 2, fillColor: '#5b8def', fillOpacity: 0.18, clickable: false }),
        }
        map.current = m
        marker.current = pin
        setReady(true)
      })
      .catch((error: unknown) => {
        if (!cancelled) unavailableRef.current(error instanceof Error ? error.message : 'Google Maps could not load.')
      })
    return () => {
      cancelled = true
      stopRefused()
    }
  }, [])

  // Follow the pin and the radii; the view recentres only when the pin moves somewhere new.
  const shownAt = useRef<string | null>(null)
  useEffect(() => {
    const m = map.current
    const c = circles.current
    if (!ready || !m || !marker.current || !c) return
    if (!point) {
      marker.current.map = null
      c.phone.setMap(null)
      c.laptop.setMap(null)
      return
    }
    marker.current.position = point
    marker.current.map = m
    for (const [circle, r] of [[c.laptop, laptopRadiusM], [c.phone, radiusM]] as const) {
      circle.setCenter(point)
      circle.setRadius(r)
      circle.setMap(m)
    }
    const key = `${point.lat.toFixed(5)},${point.lng.toFixed(5)}`
    if (shownAt.current !== key) {
      if (shownAt.current === null) m.setZoom(PIN_ZOOM)
      m.panTo(point)
      shownAt.current = key
    }
  }, [ready, point, radiusM, laptopRadiusM])

  return (
    <div className={cn('relative overflow-hidden rounded-[10px] bg-white/[0.03] ring-1 ring-inset ring-white/[0.08]', className)}>
      <div ref={box} className="absolute inset-0" aria-label="Office location map" role="application" />
      {!ready ? <p className="absolute inset-0 flex items-center justify-center text-xs text-fg-2">Loading the map…</p> : null}
    </div>
  )
}
