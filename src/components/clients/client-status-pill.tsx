import { StatusPill } from '@/components/ui/badge'
import { clientStatusLabel } from '@/lib/client-status'

/**
 * A client's status, the same everywhere it shows (Clients, Contacts, deal and contact pages). Active is the normal
 * case, so it stays quiet; a Prospect (stored as 'lead') is the one worth noticing, in the attendance amber; anything else uses the
 * shared status colours.
 */
export function ClientStatusPill({ status }: { status: string | null | undefined }) {
  const label = clientStatusLabel(status)
  if (status === 'active') return <StatusPill status={status} label={label} tone="neutral" className="bg-[#4A494D] text-white" />
  return <StatusPill status={status} label={label} tone={status === 'lead' ? 'warning' : undefined} />
}
