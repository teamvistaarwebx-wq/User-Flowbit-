'use client'

import { useState, type MouseEvent, type ReactNode } from 'react'
import { downloadErrorMessage, DOWNLOAD_FAILED, filenameFromDisposition } from '@/lib/download'
import { toast } from '@/lib/toast'

type DownloadLinkProps = {
  href: string
  className?: string
  /** Used when the response names no file. */
  fallbackName?: string
  children: ReactNode
}

/**
 * A download that stays on the page: fetches the file and saves it, or toasts
 * the route's error instead of leaving Flowbit for a page of raw JSON (R2 15.2).
 * The plain link still works without JavaScript.
 */
export function DownloadLink({ href, className, fallbackName = 'download', children }: DownloadLinkProps) {
  const [busy, setBusy] = useState(false)

  const download = async (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
    event.preventDefault()
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch(href, { credentials: 'same-origin' })
      if (!res.ok) {
        toast.error(downloadErrorMessage(res.headers.get('content-type'), await res.text()))
        return
      }
      saveBlob(await res.blob(), filenameFromDisposition(res.headers.get('content-disposition'), fallbackName))
    } catch (error) {
      console.error('[download] failed', error)
      toast.error(DOWNLOAD_FAILED)
    } finally {
      setBusy(false)
    }
  }

  return (
    <a href={href} className={className} onClick={download} aria-busy={busy || undefined} data-busy={busy || undefined}>
      {children}
    </a>
  )
}

function saveBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  // Give the browser a moment to start the download before the URL is released.
  setTimeout(() => URL.revokeObjectURL(url), 1_000)
}
