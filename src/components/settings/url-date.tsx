'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { DateInput } from '@/components/ui/input'

/** A date filter bound to a URL param ('YYYY-MM-DD'); clearing it removes the param. */
export function UrlDate({ param, label }: { param: string; label: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const search = useSearchParams()
  const onChange = (value: string) => {
    const params = new URLSearchParams(search.toString())
    if (value) params.set(param, value)
    else params.delete(param)
    params.delete('page')
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }
  return (
    <label className="flex items-center gap-2 text-[13px] text-[#959596]">
      <span className="shrink-0">{label}</span>
      <DateInput aria-label={label} defaultValue={search.get(param) ?? ''} onChange={(e) => onChange(e.target.value)} className="w-36" />
    </label>
  )
}
