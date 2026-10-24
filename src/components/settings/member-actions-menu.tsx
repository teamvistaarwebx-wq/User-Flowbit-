'use client'

import { useState } from 'react'
import { Crown, MoreHorizontal, Pencil, RotateCw, Shield, ShieldOff, UserCheck, UserX, XCircle } from 'lucide-react'
import { ActionForm, FormField, SubmitButton, useAction } from '@/components/ui/action-form'
import { Button, IconButton } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Dialog } from '@/components/ui/dialog'
import { DropdownMenu, type MenuItem } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { changeMemberRole, resendInvitation, revokeInvitation, setMemberStatus, transferOwnership, updateMemberDetails } from '@/modules/settings/member-actions'
import type { MemberRow, RoleOption } from '@/modules/settings/members-query'
import { resetMemberTwoFactor } from '@/lib/auth/two-factor-actions'

type Props = { member: MemberRow; roles: RoleOption[]; managers: RoleOption[]; viewerIsOwner: boolean; workspaceName: string }
type Panel = 'details' | 'role' | 'status' | 'transfer' | 'twoFactor' | null

/** Row menu on Members: edit details, change role, disable/enable, transfer ownership. */
export function MemberActionsMenu({ member, roles, managers, viewerIsOwner, workspaceName }: Props) {
  const [panel, setPanel] = useState<Panel>(null)
  const [role, setRole] = useState(member.role)
  const [runRole, savingRole] = useAction(changeMemberRole, { onDone: () => setPanel(null) })
  const [runStatus, savingStatus] = useAction(setMemberStatus, { onDone: () => setPanel(null) })
  const [runReset, resetting] = useAction(resetMemberTwoFactor, { onDone: () => setPanel(null) })
  const linked = Boolean(member.employee)
  const protectedRow = member.isOwner || member.isYou
  const close = (open: boolean) => !open && setPanel(null)

  const items: MenuItem[] = [
    { label: 'Edit details', icon: <Pencil />, onSelect: () => setPanel('details') },
    ...(!protectedRow ? [{ label: 'Change role', icon: <Shield />, onSelect: () => setPanel('role') }] : []),
    ...(!protectedRow
      ? [member.status === 'active' ? { label: 'Disable', icon: <UserX />, danger: true, onSelect: () => setPanel('status') } : { label: 'Enable', icon: <UserCheck />, onSelect: () => setPanel('status') }]
      : []),
    ...(member.twoFactor && !member.isYou && (!member.isOwner || viewerIsOwner) ? [{ label: 'Reset two-factor sign-in', icon: <ShieldOff />, onSelect: () => setPanel('twoFactor') }] : []),
    ...(viewerIsOwner && !member.isYou && member.status === 'active' ? [{ type: 'separator' as const }, { label: 'Transfer ownership', icon: <Crown />, onSelect: () => setPanel('transfer') }] : []),
  ]

  return (
    <>
      <DropdownMenu trigger={<IconButton label={`Actions for ${member.name}`} size="sm"><MoreHorizontal className="size-4" /></IconButton>} items={items} />

      <Dialog open={panel === 'details'} onOpenChange={close} title={`Details for ${member.name}`} description={linked ? 'Department and manager are managed in HR → People.' : undefined}>
        <ActionForm action={updateMemberDetails} onDone={() => setPanel(null)} className="space-y-4">
          <input type="hidden" name="memberId" value={member.id} />
          <FormField name="title" label="Job title">
            <Input id="title" name="title" defaultValue={member.title} maxLength={60} />
          </FormField>
          <FormField name="department" label="Department">
            <Input id="department" name="department" defaultValue={member.department} maxLength={60} disabled={linked} />
          </FormField>
          <FormField name="managerId" label="Manager">
            <Select name="managerId" defaultValue={member.managerId || 'none'} disabled={linked} options={[{ value: 'none', label: 'No manager' }, ...managers.filter((m) => m.value !== member.id)]} />
          </FormField>
          <div className="flex justify-end">
            <SubmitButton>Save details</SubmitButton>
          </div>
        </ActionForm>
      </Dialog>

      <Dialog
        open={panel === 'role'}
        onOpenChange={close}
        title={`Change role for ${member.name}`}
        description="It applies on their next request."
        footer={
          <>
            <Button variant="ghost" onClick={() => setPanel(null)}>Cancel</Button>
            <Button variant="primary" loading={savingRole} disabled={role === member.role} onClick={() => runRole({ memberId: member.id, role })}>
              Change role
            </Button>
          </>
        }
      >
        <Select value={role} onValueChange={setRole} options={roles} aria-label="Role" />
      </Dialog>

      <Dialog
        open={panel === 'status'}
        onOpenChange={close}
        size="sm"
        title={member.status === 'active' ? `Disable ${member.name}?` : `Enable ${member.name}?`}
        description={
          member.status === 'active'
            ? `They're signed out of ${workspaceName} now and can't sign back in. Their tasks, records and history stay. This frees a seat.`
            : 'They can sign in again. This uses a seat.'
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setPanel(null)}>Cancel</Button>
            <Button variant={member.status === 'active' ? 'danger' : 'primary'} loading={savingStatus} onClick={() => runStatus({ memberId: member.id, status: member.status === 'active' ? 'disabled' : 'active' })}>
              {member.status === 'active' ? 'Disable' : 'Enable'}
            </Button>
          </>
        }
      />

      <Dialog
        open={panel === 'twoFactor'}
        onOpenChange={close}
        size="sm"
        title={`Reset two-factor sign-in for ${member.name}?`}
        description="Use this when they lost their phone and recovery codes. They sign in with their password or Google alone until they set it up again. This is recorded in the audit log and they get an email."
        footer={
          <>
            <Button variant="ghost" onClick={() => setPanel(null)}>Cancel</Button>
            <Button variant="danger" loading={resetting} onClick={() => runReset({ memberId: member.id })}>Reset</Button>
          </>
        }
      />

      <Dialog open={panel === 'transfer'} onOpenChange={close} size="sm" title={`Make ${member.name} the owner?`} description="They get the subscription and the right to delete the workspace. You become an admin.">
        <ActionForm action={transferOwnership} onDone={() => setPanel(null)} className="space-y-4">
          <input type="hidden" name="memberId" value={member.id} />
          <FormField name="confirm" label={`Type ${workspaceName} to confirm`} required>
            <Input id="confirm" name="confirm" autoComplete="off" />
          </FormField>
          <div className="flex justify-end">
            <SubmitButton variant="danger" pendingLabel="Transferring…">Transfer ownership</SubmitButton>
          </div>
        </ActionForm>
      </Dialog>
    </>
  )
}

/** Resend and revoke on the Invitations table. */
export function InvitationActions({ memberId, email }: { memberId: string; email: string }) {
  const [resend, resending] = useAction(resendInvitation)
  return (
    <span className="flex justify-end gap-1.5">
      <Button size="sm" variant="secondary" loading={resending} icon={<RotateCw className="size-3.5" />} onClick={() => resend({ memberId })}>
        Resend
      </Button>
      <ConfirmDialog
        trigger={<Button size="sm" variant="ghost" icon={<XCircle className="size-3.5" />}>Revoke</Button>}
        title={`Revoke the invitation for ${email}?`}
        description="The link stops working and the seat is freed."
        confirmLabel="Revoke"
        onConfirm={() => revokeInvitation({ memberId })}
      />
    </span>
  )
}
