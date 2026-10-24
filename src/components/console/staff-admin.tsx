'use client'

import { useState } from 'react'
import { Copy, Mail, RotateCcw, UserPlus } from 'lucide-react'
import { ActionForm, FormField, SubmitButton, useAction } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { STAFF_ROLE_LABEL, STAFF_ROLES } from '@/lib/console/roles'
import { toast } from '@/lib/toast'
import { addStaff, resetStaffAccess, sendPendingSetupLinks, setStaffActive, setStaffRole } from '@/modules/console/staff-actions'

const ROLE_OPTIONS = STAFF_ROLES.map((r) => ({ value: r, label: STAFF_ROLE_LABEL[r] }))

function LinkNote({ link }: { link: string }) {
  const copy = async () => {
    await navigator.clipboard.writeText(link)
    toast.success('Link copied')
  }
  return (
    <div className="space-y-2">
      <p className="text-sm text-fg-2">The link was emailed. If email is not set up, copy it and send it yourself (it works once, for 48 hours).</p>
      <Button size="sm" variant="secondary" icon={<Copy className="size-3.5" />} onClick={copy}>Copy setup link</Button>
    </div>
  )
}

export function AddStaffButton() {
  const [open, setOpen] = useState(false)
  const [link, setLink] = useState<string | null>(null)
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setLink(null) }} title="Add a staff member" description="They choose a password from an emailed link, then set up two-factor sign-in." trigger={<Button size="sm" icon={<UserPlus className="size-3.5" />}>Add staff</Button>}>
      {link ? <LinkNote link={link} /> : (
        <ActionForm action={addStaff} onDone={(r) => setLink((r.data as { link: string | null } | undefined)?.link ?? null)} className="space-y-4">
          <FormField name="name" label="Name" required><Input id="name" name="name" /></FormField>
          <FormField name="email" label="Work email" required><Input id="email" name="email" type="email" /></FormField>
          <FormField name="role" label="Role"><Select name="role" defaultValue="sales" options={ROLE_OPTIONS} /></FormField>
          <div className="flex justify-end"><SubmitButton>Add</SubmitButton></div>
        </ActionForm>
      )}
    </Dialog>
  )
}

/** Emails setup links to staff who have no Console password yet (migrated Admins, lost first links). */
export function SendSetupLinksButton({ count }: { count: number }) {
  const [send, pending] = useAction(sendPendingSetupLinks)
  if (!count) return null
  return <Button size="sm" variant="secondary" icon={<Mail className="size-3.5" />} loading={pending} onClick={() => send({})}>Send setup links ({count})</Button>
}

export function StaffRowActions({ staffId, role, active, self }: { staffId: string; role: string; active: boolean; self: boolean }) {
  const [changeRole, rolePending] = useAction(setStaffRole)
  const [toggle, togglePending] = useAction(setStaffActive)
  const [reset, resetPending] = useAction(resetStaffAccess)
  return (
    <span className="flex flex-wrap items-center justify-end gap-2">
      <Select size="sm" value={role} disabled={rolePending} onValueChange={(next) => next !== role && changeRole({ staffId, role: next as (typeof STAFF_ROLES)[number] })} options={ROLE_OPTIONS} aria-label="Role" className="w-[130px]" />
      {!self ? <Button size="sm" variant="ghost" loading={togglePending} onClick={() => toggle({ staffId, active: !active })}>{active ? 'Disable' : 'Enable'}</Button> : null}
      <Button size="sm" variant="ghost" icon={<RotateCcw className="size-3.5" />} loading={resetPending} onClick={() => reset({ staffId })}>Reset sign-in</Button>
    </span>
  )
}
