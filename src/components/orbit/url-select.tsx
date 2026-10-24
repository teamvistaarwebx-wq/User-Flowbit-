'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import { cn } from '@/lib/utils'
import { Select } from '@/components/ui/select'

export type UrlSelectProps = {
  param: string
  options: { value: string; label: string }[]
  /** Value meaning "no filter" (removes the param). */
  allValue?: string
  allLabel?: string
  label: string
  className?: string
}

/** A filter select bound to a URL search param (resets the page). */
export function UrlSelect({ param, options, allValue = 'all', allLabel = 'All', label, className }: UrlSelectProps) {
  const router = useRouter()
  const pathname = usePathname()
  const search = useSearchParams()
  const [pending, start] = useTransition()
  const value = search.get(param) ?? allValue
  const change = (next: string) => {
    const params = new URLSearchParams(search.toString())
    if (next === allValue) params.delete(param)
    else params.set(param, next)
    params.delete('page')
    const qs = params.toString()
    start(() => router.replace(qs ? `${pathname}?${qs}` : pathname))
  }
  return (
    <div className={cn('min-w-36', pending && 'opacity-70', className)}>
      <Select size="sm" aria-label={label} value={value} onValueChange={change} options={[{ value: allValue, label: allLabel }, ...options]} />
    </div>
  )
}
