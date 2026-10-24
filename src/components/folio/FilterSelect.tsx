'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { NativeSelect } from '@/components/ui/input'
import { play } from '@/lib/sound'
import { cn } from '@/lib/utils'

/** A select bound to one URL search param (resets the page). Blank = all. */
export function FilterSelect({ param, options, placeholder, className }: { param: string; options: { value: string; label: string }[]; placeholder: string; className?: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const search = useSearchParams()
  const onChange = (value: string) => {
    play('toggle')
    const next = new URLSearchParams(search.toString())
    if (value) next.set(param, value)
    else next.delete(param)
    next.delete('page')
    const qs = next.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
  }
  return <NativeSelect aria-label={placeholder} value={search.get(param) ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} options={options} className={cn('h-10 w-auto min-w-36 border-[#535153] bg-transparent pl-4 text-sm', className)} />
}
