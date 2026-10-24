'use client'

import { Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { deleteDeal } from '@/modules/orbit/deals.actions'
import { deleteLead } from '@/modules/orbit/leads.actions'

/** Admin-only hard delete of a lead or deal with its activity history. */
export function DeleteRecordButton({ kind, id, title, description }: { kind: 'lead' | 'deal'; id: string; title: string; description: string }) {
  const router = useRouter()
  const run = async () => {
    const res = kind === 'lead' ? await deleteLead({ id }) : await deleteDeal({ id })
    if (res.ok && res.redirect) router.push(res.redirect)
    return res
  }
  return (
    <ConfirmDialog
      trigger={<Button variant="ghost" size="sm" icon={<Trash2 className="size-4" />}>Delete</Button>}
      title={title}
      description={description}
      confirmLabel="Delete"
      onConfirm={run}
    />
  )
}
