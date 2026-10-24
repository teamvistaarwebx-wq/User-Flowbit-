'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, MapPin, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { importLibrary, toLiteral, type LatLngLiteral, type Suggestion } from '@/lib/google-maps'
import { cn } from '@/lib/utils'
import { geocodeForOffice } from '@/modules/muster/settings/geo-actions'

const DEBOUNCE_MS = 300
const MIN_CHARS = 3

export type PickedPlace = { address: string; point: LatLngLiteral }

type Props = {
  value: string
  onChange: (address: string) => void
  /** A suggestion was picked, or the typed address was found: the pin moves there. */
  onPick: (place: PickedPlace) => void
  /** Google suggestions as you type (Places, on the browser key); off when the map is unavailable. */
  suggest: boolean
  /** Enter or "Find" looks the typed address up on the server's Geocoding key; off when it is not set up. */
  lookup: boolean
  invalid?: boolean
}

/**
 * The office address: Google suggests places as you type, and Enter or "Find" looks up a typed or pasted
 * address on the server. Picking one places the pin; the text stays exactly as chosen or typed.
 */
export function AddressSearch({ value, onChange, onPick, suggest, lookup, invalid }: Props) {
  const [suggestions, setSuggestions] = useState<{ id: string; text: string; suggestion: Suggestion }[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const token = useRef<object | null>(null)
  const typed = useRef(false)

  useEffect(() => {
    const input = value.trim()
    if (!suggest || !typed.current || input.length < MIN_CHARS) return
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const { AutocompleteSessionToken, AutocompleteSuggestion } = await importLibrary('places')
        token.current ??= new AutocompleteSessionToken()
        const { suggestions: found } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({ input, sessionToken: token.current })
        if (cancelled) return
        setSuggestions(found.flatMap((s) => (s.placePrediction ? [{ id: s.placePrediction.placeId, text: s.placePrediction.text.toString(), suggestion: s }] : [])))
        setActive(-1)
        setOpen(true)
      } catch {
        if (!cancelled) setSuggestions([])
      }
    }, DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [value, suggest])

  const choose = async (item: { text: string; suggestion: Suggestion }) => {
    setOpen(false)
    setBusy(true)
    setProblem(null)
    try {
      const place = item.suggestion.placePrediction!.toPlace()
      await place.fetchFields({ fields: ['location', 'formattedAddress', 'displayName'] })
      // The session ends with the place details; the next search starts a new one.
      token.current = null
      if (!place.location) throw new Error('no location')
      const address = place.formattedAddress || item.text
      typed.current = false
      onChange(address)
      onPick({ address, point: toLiteral(place.location) })
    } catch {
      setProblem('That place has no location on Google. Try another, or drag the pin.')
    } finally {
      setBusy(false)
    }
  }

  const find = async () => {
    const address = value.trim()
    if (!lookup || address.length < MIN_CHARS) return
    setOpen(false)
    setBusy(true)
    setProblem(null)
    try {
      const res = await geocodeForOffice({ address })
      if (!res.ok) setProblem(res.error)
      else if (!res.data) setProblem(`Google could not find that address. ${suggest ? 'Pick a suggestion, or drag the pin.' : 'Enter the coordinates instead.'}`)
      else onPick({ address, point: res.data.point })
    } catch {
      setProblem('Could not reach Flowbit. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative">
      <Input
        value={value}
        onChange={(e) => {
          typed.current = true
          setProblem(null)
          onChange(e.target.value)
          if (e.target.value.trim().length < MIN_CHARS) setOpen(false)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && open) {
            e.preventDefault()
            setActive((i) => Math.min(suggestions.length - 1, i + 1))
          } else if (e.key === 'ArrowUp' && open) {
            e.preventDefault()
            setActive((i) => Math.max(-1, i - 1))
          } else if (e.key === 'Enter') {
            e.preventDefault()
            if (open && active >= 0 && suggestions[active]) void choose(suggestions[active])
            else void find()
          } else if (e.key === 'Escape' && open) {
            e.stopPropagation()
            setOpen(false)
          }
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={suggest || lookup ? 'Search the address, e.g. MP Nagar Zone 2, Bhopal' : 'Office address'}
        maxLength={300}
        aria-invalid={invalid || undefined}
        aria-autocomplete={suggest ? 'list' : undefined}
        aria-expanded={suggest ? open : undefined}
        role={suggest ? 'combobox' : undefined}
        icon={busy ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
        trailing={
          lookup && value.trim() ? (
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => void find()} className="rounded-full px-2 text-xs font-medium text-link hover:underline">
              Find
            </button>
          ) : undefined
        }
      />
      {open && suggestions.length ? (
        <ul role="listbox" className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-[10px] bg-bg-2 py-1 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.8)] ring-1 ring-white/[0.1]">
          {suggestions.map((s, i) => (
            <li key={s.id} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void choose(s)}
                className={cn('flex w-full items-start gap-2 px-3 py-2 text-left text-sm text-fg hover:bg-white/[0.06]', i === active && 'bg-white/[0.06]')}
              >
                <MapPin className="mt-0.5 size-3.5 shrink-0 text-fg-2" aria-hidden />
                <span className="min-w-0">{s.text}</span>
              </button>
            </li>
          ))}
          <li className="px-3 pb-1 pt-1.5 text-right text-[10px] text-fg-3">Suggestions by Google</li>
        </ul>
      ) : null}
      {problem ? <p className="mt-1.5 text-xs text-warning">{problem}</p> : null}
    </div>
  )
}
