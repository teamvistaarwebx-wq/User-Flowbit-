'use client'

import { useEffect, type ReactNode } from 'react'
import { RotateCcw, TriangleAlert } from 'lucide-react'
import { Button } from './button'
import { EmptyState } from './empty-state'

export type RouteErrorProps = {
  error: Error & { digest?: string }
  /** Re-fetches the segment from the server and renders it again. */
  retry: () => void
  /** Tag for the console log, e.g. "console". */
  area: string
  title?: string
  description?: ReactNode
  className?: string
}

/** The body of a route `error.tsx`: logs the digest (never shows the message) and offers a retry. */
export function RouteError({ error, retry, area, title = 'This page hit a problem', description = 'Nothing you saved was lost. Try again in a moment.', className = 'glass' }: RouteErrorProps) {
  useEffect(() => {
    console.error(`[${area}] page error`, error.digest ?? error.message)
  }, [area, error])
  return (
    <div className={className} role="alert">
      <EmptyState
        icon={<TriangleAlert />}
        title={title}
        description={description}
        action={
          <Button variant="primary" icon={<RotateCcw className="size-4" />} onClick={retry}>
            Try again
          </Button>
        }
      />
    </div>
  )
}
