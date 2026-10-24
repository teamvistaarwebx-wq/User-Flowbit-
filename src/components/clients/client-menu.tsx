'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Archive, ArchiveRestore, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { useAction } from '@/components/ui/action-form'
import { Button, IconButton } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { DropdownMenu } from '@/components/ui/dropdown-menu'
import { deleteClient, setClientStatus } from '@/modules/clients/actions'

/** Overflow menu on a client: edit, mark inactive/active, delete (guarded server side). */
export function ClientMenu({ id, name, status, canWrite, canDelete }: { id: string; name: string; status: 'lead' | 'active' | 'inactive'; canWrite: boolean; canDelete: boolean }) {
  const router = useRouter()
  const [confirm, setConfirm] = useState(false)
  const [toggle] = useAction(setClientStatus)
  const [remove, removing] = useAction(deleteClient, { onDone: () => setConfirm(false) })
  if (!canWrite && !canDelete) return null
  return (
    <>
      <DropdownMenu
        trigger={<IconButton label="More actions" variant="outline"><MoreHorizontal className="size-4" /></IconButton>}
        items={[
          ...(canWrite
            ? [
                { label: 'Edit details', icon: <Pencil />, onSelect: () => router.push(`/app/clients/${id}#details`) },
                { label: status === 'inactive' ? 'Mark active' : 'Mark inactive', icon: status === 'inactive' ? <ArchiveRestore /> : <Archive />, onSelect: () => toggle({ id, status: status === 'inactive' ? 'active' : 'inactive' }) },
              ]
            : []),
          ...(canDelete ? [{ type: 'separator' as const }, { label: 'Delete client', icon: <Trash2 />, danger: true, onSelect: () => setConfirm(true) }] : []),
        ]}
      />
      <Dialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Delete ${name}?`}
        description="Only clients with no leads, deals, projects, tasks or invoices can be deleted. Otherwise mark it inactive."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(false)} disabled={removing}>Cancel</Button>
            <Button variant="danger" loading={removing} onClick={() => remove({ id })}>Delete</Button>
          </>
        }
      />
    </>
  )
}
