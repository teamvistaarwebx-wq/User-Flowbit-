'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { MailPlus, UserPlus } from 'lucide-react'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input, Textarea } from '@/components/ui/input'
import { CopyButton } from './copy-button'
import { Notice } from './surface'
import { Select } from '@/components/ui/select'
import { inviteMembers } from '@/modules/settings/member-actions'
import type { RoleOption } from '@/modules/settings/members-query'

type EmployeeOption = { id: string; label: string; code: string; email: string }
type InviteLink = { email: string; url: string }

/** "Invite people": opens from the button or from the rail's Invite link (?invite=1). */
export function InviteDialog({ roles, employees, emailConfigured }: { roles: RoleOption[]; employees: EmployeeOption[]; emailConfigured: boolean }) {
  const search = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const wantsInvite = search.get('invite') === '1'
  const [open, setOpen] = useState(wantsInvite)
  // The page stays mounted on same-route navigation, so the rail's Invite link must open it here too.
  const [sawInvite, setSawInvite] = useState(wantsInvite)
  if (wantsInvite !== sawInvite) {
    setSawInvite(wantsInvite)
    if (wantsInvite) setOpen(true)
  }
  const [emails, setEmails] = useState('')
  const [employeeId, setEmployeeId] = useState<string | undefined>(undefined)
  // Links come back only when no email provider is set up (they were not emailed).
  const [links, setLinks] = useState<InviteLink[]>([])

  const onOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) setLinks([])
    if (!next && search.get('invite')) {
      const params = new URLSearchParams(search.toString())
      params.delete('invite')
      router.replace(params.size ? `${pathname}?${params}` : pathname, { scroll: false })
    }
  }

  const chooseEmployee = (id: string) => {
    const employee = employees.find((e) => e.id === id)
    setEmployeeId(id)
    if (employee?.email) setEmails(employee.email)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      title="Invite people"
      description="They get an email with a link to join. The link works for 7 days."
      trigger={
        <Button variant="primary" icon={<UserPlus className="size-4" />}>
          Invite people
        </Button>
      }
    >
      {links.length ? (
        <div className="space-y-4">
          <p className="text-sm text-fg-2">No email provider is set up, so nothing was emailed. Send each person their link yourself; it works for 7 days.</p>
          <ul className="space-y-2">
            {links.map((l) => (
              <li key={l.email} className="flex items-center gap-3 rounded-[10px] bg-white/[0.06] px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-white">{l.email}</span>
                  <span className="block truncate font-mono text-[11px] text-fg-3">{l.url}</span>
                </span>
                <CopyButton value={l.url} label="Copy invite link" />
              </li>
            ))}
          </ul>
          <div className="flex justify-end">
            <Button variant="primary" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <ActionForm
          action={inviteMembers}
          onDone={(result) => {
            setEmails('')
            setEmployeeId(undefined)
            if (result.data?.links.length) setLinks(result.data.links)
            else onOpenChange(false)
          }}
          className="space-y-4"
        >
          {employees.length ? (
            <FormField name="employeeId" label="Link to an employee record" help="Optional. Fills the email and connects self-service.">
              <Select name="employeeId" value={employeeId} onValueChange={chooseEmployee} placeholder="No employee record" options={employees.map((e) => ({ value: e.id, label: e.label, hint: e.code }))} />
            </FormField>
          ) : null}
          <FormField name="emails" label="Emails" required help="Separate addresses with commas, spaces or new lines. Up to 20.">
            <Textarea id="emails" name="emails" rows={3} value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="aditi@company.in, rahul@company.in" />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField name="role" label="Role" required>
              <Select name="role" defaultValue="member" options={roles} />
            </FormField>
            <FormField name="title" label="Job title">
              <Input id="title" name="title" maxLength={60} placeholder="Optional" />
            </FormField>
          </div>
          {!emailConfigured ? (
            <Notice tone="warning" className="text-[13px]">
              No email provider is set up, so invitations are saved in the{' '}
              <Link href="/app/settings/messages?type=k:invite" className="text-link hover:underline">
                Messages log
              </Link>{' '}
              instead of being sent. You can copy each link once you invite.
            </Notice>
          ) : null}
          <div className="flex justify-end">
            <SubmitButton icon={<MailPlus className="size-4" />} pendingLabel="Sending…">
              {emailConfigured ? 'Send invitations' : 'Create invitations'}
            </SubmitButton>
          </div>
        </ActionForm>
      )}
    </Dialog>
  )
}
