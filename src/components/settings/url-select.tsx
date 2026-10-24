'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import { Select, type SelectOption } from '@/components/ui/select'
import { cn } from '@/lib/utils'

/**
 * A filter select bound to a URL param. Choosing `allValue` removes the
 * param; any change resets ?page.
 */
export function UrlSelect({ param, options, allValue = 'all', label, className }: { param: string; options: SelectOption[]; allValue?: string; label: string; className?: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const search = useSearchParams()
  const [pending, startTransition] = useTransition()
  const value = search.get(param) ?? allValue
  const onChange = (next: string) => {
    const params = new URLSearchParams(search.toString())
    if (next === allValue) params.delete(param)
    else params.set(param, next)
    params.delete('page')
    const qs = params.toString()
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }))
  }
  return <Select aria-label={label} value={value} onValueChange={onChange} options={options} className={cn('w-full sm:w-48', pending && 'opacity-70', className)} />
}
