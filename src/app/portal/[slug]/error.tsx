'use client'

import { RouteError } from '@/components/ui/route-error'

export default function PortalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-black px-4">
      <RouteError
        error={error}
        retry={retry}
        area="portal"
        title="This page could not load"
        description="Try again in a moment. If it keeps happening, contact the team that shared this portal with you."
        className="glass-hero lit-edge-bright w-full max-w-md px-6"
      />
    </main>
  )
}
