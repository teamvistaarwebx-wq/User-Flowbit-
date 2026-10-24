'use client'

import { Globe, UserMinus } from 'lucide-react'
import { ActionForm, FormField, SubmitButton, useAction } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { CopyButton } from '@/components/settings/copy-button'
import { inviteClientContact, revokeClientContact, setClientPortal } from '@/modules/portal/agency-actions'

export type PortalContactRow = { id: string; name: string; email: string; status: 'active' | 'revoked'; lastSignIn: string | null }

/** Client page → Contacts: portal on/off, the portal link, invited people and invites. */
export function ClientPortalCard({ clientId, clientName, enabled, url, contacts, canEdit }: { clientId: string; clientName: string; enabled: boolean; url: string; contacts: PortalContactRow[]; canEdit: boolean }) {
  const [toggle, saving] = useAction(setClientPortal)
  const active = contacts.filter((c) => c.status === 'active')
  return (
    <Card variant="solid" className="mt-4">
      <CardHeader
        label="Client portal"
        icon={<Globe />}
        description={`${clientName} sees shared projects, client-visible tasks, approvals, invoices and files. Read-only, apart from approvals.`}
        actions={canEdit ? <Switch aria-label="Client portal on or off" checked={enabled} disabled={saving} onCheckedChange={(next) => toggle({ clientId, enabled: next })} /> : null}
      />
      {enabled ? (
        <div className="space-y-4">
          <div className="flex h-10 items-center gap-2 rounded-full bg-control pl-4 pr-1.5 ring-1 ring-inset ring-white/10">
            <code className="min-w-0 flex-1 truncate text-xs text-fg-2">{url}</code>
            <CopyButton value={url} />
          </div>
          {active.length ? (
            <ul className="divide-y divide-white/[0.06]">
              {active.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                  <span className="min-w-0 flex-1 text-white">{c.name}<span className="block text-xs text-fg-2">{c.email}{c.lastSignIn ? ` · last signed in ${c.lastSignIn}` : ' · not signed in yet'}</span></span>
                  {canEdit ? (
                    <ConfirmDialog trigger={<Button size="sm" variant="ghost" icon={<UserMinus className="size-3.5" />}>Remove</Button>} title={`Remove ${c.name} from the portal?`} description="They are signed out and cannot sign in again unless you invite them." confirmLabel="Remove" onConfirm={() => revokeClientContact({ contactId: c.id })} />
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-fg-2">Nobody from {clientName} is invited yet.</p>
          )}
          {canEdit ? (
            <ActionForm action={inviteClientContact} resetOnSuccess className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <input type="hidden" name="clientId" value={clientId} />
              <FormField name="name" label="Name" required>
                <Input id="portalName" name="name" maxLength={80} />
              </FormField>
              <FormField name="email" label="Email" required>
                <Input id="portalEmail" name="email" type="email" />
              </FormField>
              <SubmitButton pendingLabel="Inviting…">Invite</SubmitButton>
            </ActionForm>
          ) : null}
          <p className="text-xs text-fg-3">Share a project from its page, and mark tasks &ldquo;Client can see this&rdquo; or ask for an approval from the task.</p>
        </div>
      ) : (
        <p className="text-sm text-fg-2">Off. Turn it on to invite {clientName}&apos;s people.</p>
      )}
    </Card>
  )
}
