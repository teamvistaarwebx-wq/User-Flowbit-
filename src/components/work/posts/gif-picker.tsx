'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, Search } from 'lucide-react'
import Image from 'next/image'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import type { GifResult } from '@/modules/work/posts/gifs'

const DEBOUNCE_MS = 350

/**
 * "GIF" in the composer: searches the GIF library through Flowbit's server
 * (featured GIFs before typing). Picking one hands it to `onPick`; the server
 * copies it into the workspace. Shown only when GIF search is set up.
 */
export function GifPicker({ onPick, disabled }: { onPick: (gif: GifResult) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GifResult[]>([])
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const seq = useRef(0)

  useEffect(() => {
    if (!open) return
    const mine = ++seq.current
    const timer = setTimeout(() => {
      setLoading(true)
      setFailed(false)
      fetch(`/api/work/gifs?q=${encodeURIComponent(query.trim())}`)
        .then(async (res) => {
          if (!res.ok) throw new Error(String(res.status))
          return ((await res.json()) as { results?: GifResult[] }).results ?? []
        })
        .then((list) => mine === seq.current && setResults(list))
        .catch(() => mine === seq.current && (setResults([]), setFailed(true)))
        .finally(() => mine === seq.current && setLoading(false))
    }, query ? DEBOUNCE_MS : 0)
    return () => clearTimeout(timer)
  }, [open, query])

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      size="lg"
      title="Add a GIF"
      description="Search the GIF library. The GIF you pick is saved with the post."
      trigger={
        <button type="button" disabled={disabled} aria-label="Add a GIF" title="Add a GIF" className="inline-flex h-8 items-center justify-center rounded-full px-2.5 text-[11px] font-bold tracking-wide text-fg-2 ring-1 ring-inset ring-white/[0.14] transition-colors hover:bg-white/[0.06] hover:text-white disabled:opacity-40">
          GIF
        </button>
      }
    >
      <div className="space-y-3">
        <Input autoFocus icon={<Search className="size-4" />} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search GIFs, e.g. thank you, party, well done" maxLength={50} aria-label="Search GIFs" />
        <div className="min-h-[240px]">
          {loading && !results.length ? (
            <p className="flex items-center justify-center gap-2 py-16 text-sm text-fg-2"><Loader2 className="size-4 animate-spin" /> Searching…</p>
          ) : results.length ? (
            <ul className="grid max-h-[55dvh] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3" aria-label="GIF results">
              {results.map((g) => (
                <li key={g.id || g.url}>
                  <button
                    type="button"
                    onClick={() => {
                      onPick(g)
                      setOpen(false)
                    }}
                    className="group block w-full overflow-hidden rounded-[8px] bg-white/[0.04] ring-1 ring-white/[0.08] transition-transform hover:ring-white/30 focus-visible:ring-2 focus-visible:ring-white/60 active:scale-[0.98]"
                    aria-label={`Add GIF: ${g.title}`}
                  >
                    {/* unoptimized: remote GIF preview from the GIF library (animated, and not on our image allowlist) */}
                    <Image src={g.previewUrl} alt={g.title} width={200} height={150} unoptimized className="aspect-[4/3] h-auto w-full object-cover" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-16 text-center text-sm text-fg-2">{failed ? 'GIF search is not answering right now. Try again, or upload a GIF instead.' : query ? 'No GIFs found. Try other words.' : 'Type to search.'}</p>
          )}
        </div>
        <p className="text-right text-[11px] text-fg-3">Powered by KLIPY</p>
      </div>
    </Dialog>
  )
}
