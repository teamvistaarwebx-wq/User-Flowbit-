'use client'

import { Clock } from 'lucide-react'
import { useEffect, useState } from 'react'
import { localTimeIn } from '@/lib/skills'

const MINUTE = 60_000

/** "3:42 pm local", refreshed each minute. Rendered after mount so server and browser clocks never disagree. */
export function LocalTime({ zone, className }: { zone: string; className?: string }) {
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    const tick = () => setNow(new Date())
    const first = setTimeout(tick, 0)
    const timer = setInterval(tick, MINUTE)
    return () => {
      clearTimeout(first)
      clearInterval(timer)
    }
  }, [])
  return (
    <span className={className} title={zone}>
      <Clock className="mr-1 inline size-3 align-[-2px]" strokeWidth={1.5} aria-hidden />
      {now ? `${localTimeIn(zone, now)} local` : ' '}
    </span>
  )
}
