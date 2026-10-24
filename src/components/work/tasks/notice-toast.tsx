'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { toast } from '@/lib/toast'

/** Shows a one-off error toast passed through the URL (e.g. "You don't have access to that task") and drops the param. */
export function NoticeToast({ message, param }: { message: string; param: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const search = useSearchParams()
  const shown = useRef(false)
  useEffect(() => {
    if (shown.current || !search.get(param)) return
    shown.current = true
    toast.error(message)
    const next = new URLSearchParams(search.toString())
    next.delete(param)
    const qs = next.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [message, param, pathname, router, search])
  return null
}
