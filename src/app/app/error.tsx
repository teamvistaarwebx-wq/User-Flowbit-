'use client'

import { RouteError } from '@/components/ui/route-error'

export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <RouteError error={error} retry={retry} area="app" description="Nothing you saved was lost. Try again, and if it keeps happening, tell your workspace admin." />
}
