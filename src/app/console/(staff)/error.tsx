'use client'

import { RouteError } from '@/components/ui/route-error'

export default function ConsoleError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <RouteError error={error} retry={retry} area="console" description="Nothing was changed. Reports and billing can take a while; try again, and if it keeps failing, check the server logs for this time." />
}
