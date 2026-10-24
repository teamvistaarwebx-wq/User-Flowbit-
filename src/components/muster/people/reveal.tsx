'use client'

import { Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import { play } from '@/lib/sound'

/** Shows a masked value with a toggle to reveal it (bank account, Aadhaar). */
export function Reveal({ masked, value }: { masked: string; value: string }) {
  const [shown, setShown] = useState(false)
  return (
    <span className="inline-flex items-center gap-2">
      <span className="font-mono">{shown ? value : masked}</span>
      <button
        type="button"
        onClick={() => {
          play('toggle')
          setShown((s) => !s)
        }}
        className="rounded-full p-1 text-fg-2 transition-colors hover:bg-white/[0.08] hover:text-white"
        aria-label={shown ? 'Hide' : 'Reveal'}
      >
        {shown ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
      </button>
    </span>
  )
}
