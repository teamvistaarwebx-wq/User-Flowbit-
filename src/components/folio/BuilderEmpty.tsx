import { Building2, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import type { BuilderOptions } from '@/modules/folio/invoices/builder-data'
import { SetupCallout } from './SetupCallout'

/** What the builder shows instead of the form when there is no entity or no active client. Null when ready. */
export function BuilderEmpty({ options, canSetUp }: { options: BuilderOptions; canSetUp: boolean }) {
  if (!options.entities.length) {
    return (
      <>
        <SetupCallout canSetUp={canSetUp} />
        <Card variant="solid"><EmptyState icon={<Building2 />} title="No firm yet" description="Every document is issued from a business. Add yours in Folio settings first." /></Card>
      </>
    )
  }
  if (!options.clients.length) {
    return (
      <Card variant="solid">
        <EmptyState icon={<Users />} title="Add a client first" description="Documents are raised against an active client." action={<Button variant="primary" href="/app/clients/new">Add a client</Button>} />
      </Card>
    )
  }
  return null
}
