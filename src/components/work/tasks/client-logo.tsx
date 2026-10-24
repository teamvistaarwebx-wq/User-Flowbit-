'use client'

import { ClientMark } from '@/components/clients/client-mark'
import { useTaskData } from './task-data'

/** The task's client logo (only when the client has one), small, before the title. */
export function TaskClientLogo({ clientId, size = 'xs' }: { clientId: string | null; size?: 'xs' | 'md' }) {
  const { clients } = useTaskData()
  const client = clientId ? clients.find((c) => c.id === clientId) : undefined
  if (!client?.logoUrl) return null
  return (
    <span title={client.name} className="inline-flex shrink-0">
      <ClientMark name={client.name} logoUrl={client.logoUrl} size={size} />
    </span>
  )
}
