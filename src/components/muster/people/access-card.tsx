'use client'

import { KeyRound, Link2, Mail, Unlink } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { Select } from '@/components/ui/select'
import { useAction } from '@/components/ui/action-form'
import { inviteEmployee, linkEmployeeMember, unlinkEmployeeMember } from '@/modules/muster/people/actions'
import { ActionButton } from './action-button'

type Linked = { name: string; email: string; status: string; role: string } | null

/** Flowbit login for this employee: linked member, or link an existing one, or invite by work email. */
export function AccessCard({ employeeId, name, workEmail, linked, members, canWrite }: { employeeId: string; name: string; workEmail: string; linked: Linked; members: { value: string; label: string }[]; canWrite: boolean }) {
  const [memberId, setMemberId] = useState('')
  const [link, linking] = useAction(linkEmployeeMember)
  const [invite, inviting] = useAction(inviteEmployee)
  return (
    <Card>
      <CardHeader label="Flowbit access" icon={<KeyRound />} description="A linked login gets self-service, check-in and approvals." />
      {linked ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm text-white">{linked.name}</p>
            <p className="truncate text-xs text-fg-2">{linked.email}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={linked.status === 'active' ? 'success' : 'warning'}>{linked.status === 'active' ? 'Linked' : 'Invite sent'}</Badge>
            {canWrite ? (
              <ActionButton action={unlinkEmployeeMember} input={{ id: employeeId }} label="Unlink" icon={<Unlink className="size-3.5" />} title={`Unlink ${name}?`} description="Their login stays, but it stops showing this employee record and their check-ins stop feeding the register." confirmLabel="Unlink" />
            ) : null}
          </div>
        </div>
      ) : canWrite ? (
        <div className="space-y-3">
          <p className="text-sm text-fg-2">{name} has no Flowbit login yet.</p>
          {members.length ? (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Select options={members} value={memberId || undefined} onValueChange={setMemberId} placeholder="Link an existing member…" className="sm:flex-1" aria-label="Member" />
              <Button variant="secondary" icon={<Link2 className="size-4" />} loading={linking} disabled={!memberId} onClick={() => link({ id: employeeId, memberId })}>Link</Button>
            </div>
          ) : null}
          <Button variant="violet" icon={<Mail className="size-4" />} loading={inviting} onClick={() => invite({ id: employeeId, role: 'member' })}>Invite {workEmail}</Button>
        </div>
      ) : (
        <p className="text-sm text-fg-2">Not linked to a login.</p>
      )}
    </Card>
  )
}
