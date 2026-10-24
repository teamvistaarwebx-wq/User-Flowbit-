'use client'

import { useState } from 'react'
import { MoreHorizontal, Pause, Pencil, Play, Receipt, Square, Zap } from 'lucide-react'
import { useAction } from '@/components/ui/action-form'
import { Button, IconButton } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { DropdownMenu } from '@/components/ui/dropdown-menu'
import { billRetainerNow, setRetainerStatus } from '@/modules/folio/recurring/actions'
import { RetainerDialog, type RetainerValues } from './RetainerDialog'

type Option = { value: string; label: string }

type Props = {
  values: RetainerValues & { id: string }
  status: string
  invoicesHref: string
  canEdit: boolean
  canBill: boolean
  clients: Option[]
  entities: (Option & { kind: string })[]
  taxRates: number[]
}

/** Row actions for a retainer: Bill now, Edit, Pause/Resume, End, View invoices. */
export function RetainerRowActions({ values, status, invoicesHref, canEdit, canBill, clients, entities, taxRates }: Props) {
  const [bill, billing] = useAction(billRetainerNow)
  const [setStatus, changing] = useAction(setRetainerStatus)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const items = [
    ...(canEdit && status !== 'ended' ? [{ label: status === 'paused' ? 'Resume' : 'Pause', icon: status === 'paused' ? <Play /> : <Pause />, onSelect: () => void setStatus({ id: values.id, status: status === 'paused' ? 'active' : 'paused' }) }] : []),
    ...(canEdit && status !== 'ended' ? [{ label: 'End retainer', icon: <Square />, danger: true, onSelect: () => setConfirmEnd(true) }] : []),
    { label: 'View invoices', icon: <Receipt />, href: invoicesHref },
  ]
  return (
    <div className="flex items-center justify-end gap-1">
      {canBill && status === 'active' ? <Button size="sm" variant="secondary" icon={<Zap className="size-4" />} loading={billing} onClick={() => bill({ id: values.id })}>Bill now</Button> : null}
      {canEdit && status !== 'ended' ? <RetainerDialog trigger={<IconButton label="Edit retainer" size="sm"><Pencil className="size-4" /></IconButton>} values={values} clients={clients} entities={entities} taxRates={taxRates} /> : null}
      <DropdownMenu trigger={<IconButton label="More" size="sm"><MoreHorizontal className="size-4" /></IconButton>} items={items} />
      <Dialog
        open={confirmEnd}
        onOpenChange={setConfirmEnd}
        size="sm"
        title={`End ${values.name}?`}
        description="No more drafts will be created. Drafts and invoices already raised stay as they are."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmEnd(false)}>Cancel</Button>
            <Button variant="danger" loading={changing} onClick={async () => (await setStatus({ id: values.id, status: 'ended' })).ok && setConfirmEnd(false)}>End retainer</Button>
          </>
        }
      />
    </div>
  )
}
