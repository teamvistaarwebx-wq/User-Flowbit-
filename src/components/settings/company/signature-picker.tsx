'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { ImagePlus } from 'lucide-react'
import { DEFAULT_BACKGROUND_THRESHOLD } from '@/lib/image-bytes'
import { toast } from '@/lib/toast'
import { Button } from '@/components/ui/button'
import { toPngFile } from '@/components/ui/image-convert'
import { Switch } from '@/components/ui/switch'

const ACCEPT = 'image/png,image/jpeg'
/** Long side of a stored signature or seal: crisp in a 36pt-high signature block. */
const SIGNATURE_EDGE = 600
const MIN_THRESHOLD = 150
const MAX_THRESHOLD = 250

/** Puts the processed file into the real <input type=file> so the surrounding ActionForm submits it. */
function attach(input: HTMLInputElement | null, file: File) {
  if (!input) return
  const transfer = new DataTransfer()
  transfer.items.add(file)
  input.files = transfer.files
}

/**
 * A PNG or JPEG signature (or seal) picked here, optionally with its light background made transparent
 * (a simple brightness threshold on a canvas), previewed on paper, and submitted as a PNG under `name`.
 */
export function SignaturePicker({ name, label, hasCurrent, clearByDefault }: { name: string; label: string; hasCurrent: boolean; clearByDefault: boolean }) {
  const field = useRef<HTMLInputElement>(null)
  const picker = useRef<HTMLInputElement>(null)
  const [original, setOriginal] = useState<File | null>(null)
  const [clear, setClear] = useState(clearByDefault)
  const [threshold, setThreshold] = useState(DEFAULT_BACKGROUND_THRESHOLD)
  const [preview, setPreview] = useState<string | null>(null)

  useEffect(() => {
    if (!original) return
    let cancelled = false
    let url: string | null = null
    toPngFile(original, { edge: SIGNATURE_EDGE, clearBelow: clear ? threshold : null })
      .then((png) => {
        if (cancelled) return
        attach(field.current, png)
        url = URL.createObjectURL(png)
        setPreview(url)
      })
      .catch((error: unknown) => {
        console.error('[signature] could not read the image', error)
        if (!cancelled) toast.error('That image could not be read. Try a PNG or JPEG.')
      })
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [original, clear, threshold])

  const pick = (file: File | undefined) => {
    if (!file) return
    if (!ACCEPT.split(',').includes(file.type)) {
      toast.error('Use a PNG or JPEG image.')
      return
    }
    setOriginal(file)
  }

  return (
    <div className="space-y-3">
      <input ref={field} type="file" name={name} accept="image/png" className="hidden" tabIndex={-1} aria-hidden />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {/* Paper-white, as it prints: the checkered pattern would hide a too-faint signature. */}
        <div className="flex h-20 w-full shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-white ring-1 ring-white/[0.12] sm:w-48">
          {preview ? (
            // unoptimized: local preview of the picked file, never a served URL
            <Image src={preview} alt={`${label} preview`} width={192} height={80} unoptimized className="h-auto max-h-full w-auto max-w-full object-contain p-2" />
          ) : (
            <span className="px-2 text-center text-xs text-[#6B6478]">{hasCurrent ? `${label} on file (private)` : `No ${label.toLowerCase()} yet`}</span>
          )}
        </div>
        <Button type="button" size="sm" variant="secondary" icon={<ImagePlus className="size-4" />} onClick={() => picker.current?.click()}>
          {hasCurrent || original ? `Replace ${label.toLowerCase()}` : `Choose ${label.toLowerCase()}`}
        </Button>
        <input ref={picker} type="file" accept={ACCEPT} className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
      </div>
      {original ? (
        <div className="space-y-2">
          <Switch checked={clear} onCheckedChange={setClear} label="Remove background" description="Makes the paper behind the ink transparent" />
          {clear ? (
            <label className="flex items-center gap-3 text-xs text-fg-2">
              <span className="shrink-0">Clear more</span>
              <input type="range" min={MIN_THRESHOLD} max={MAX_THRESHOLD} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} className="w-full accent-[var(--orchid)]" aria-label="Background threshold" />
              <span className="shrink-0">Clear less</span>
            </label>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
