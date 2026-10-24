'use client'

import { KeyRound, LogOut, MonitorSmartphone } from 'lucide-react'
import { ActionForm, FormField, SubmitButton, useAction } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { TableCard } from './surface'
import { changePassword, revokeOtherSessions, revokeSession } from '@/modules/settings/account-actions'

export function PasswordCard({ hasPassword }: { hasPassword: boolean }) {
  return (
    <Card variant="solid">
      <CardHeader
        label={hasPassword ? 'Password' : 'Set a password'}
        icon={<KeyRound />}
        description={hasPassword ? 'Changing it signs you out everywhere else.' : 'You sign in with Google. Add a password to sign in with your email too.'}
      />
      <ActionForm action={changePassword} resetOnSuccess className="grid gap-4">
        {hasPassword ? (
          <FormField name="currentPassword" label="Current password" required>
            <Input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" />
          </FormField>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField name="newPassword" label="New password" required help="At least 8 characters, with a letter and a number.">
            <Input id="newPassword" name="newPassword" type="password" autoComplete="new-password" />
          </FormField>
          <FormField name="confirm" label="Type it again" required>
            <Input id="confirm" name="confirm" type="password" autoComplete="new-password" />
          </FormField>
        </div>
        <div className="flex justify-end">
          <SubmitButton>{hasPassword ? 'Change password' : 'Set password'}</SubmitButton>
        </div>
      </ActionForm>
    </Card>
  )
}

export type SessionRow = { id: string; device: string; workspace: string; lastActive: string; signedIn: string; current: boolean }

function SignOutButton({ id }: { id: string }) {
  const [run, pending] = useAction(revokeSession)
  return (
    <Button size="sm" variant="secondary" loading={pending} icon={<LogOut className="size-3.5" />} onClick={() => run({ id })}>
      Sign out
    </Button>
  )
}

export function SessionsCard({ sessions }: { sessions: SessionRow[] }) {
  const others = sessions.filter((s) => !s.current).length
  return (
    <TableCard
      icon={<MonitorSmartphone strokeWidth={1.5} />}
      label="Sessions"
      description="Where you're signed in, across all your workspaces."
      actions={
        others ? (
          <ConfirmDialog
            trigger={<Button size="sm" variant="secondary">Sign out everywhere else</Button>}
            title={`Sign out of ${others} other ${others === 1 ? 'session' : 'sessions'}?`}
            description="Those devices will need your password or Google to sign in again."
            confirmLabel="Sign out"
            onConfirm={() => revokeOtherSessions({})}
          />
        ) : null
      }
    >
      <ul className="border-t border-line pb-2 pt-1">
        {sessions.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center gap-3 px-[23px] py-2.5 transition-colors hover:bg-white/[0.04]">
            <MonitorSmartphone className="size-4 shrink-0 text-icon-muted" strokeWidth={1.5} />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-sm text-white">
                {s.device}
                {s.current ? <span className="text-xs font-medium text-mint">This device</span> : null}
              </p>
              <p className="text-xs text-[#979797]">
                {s.workspace} · Last active {s.lastActive} · Signed in {s.signedIn}
              </p>
            </div>
            {s.current ? null : <SignOutButton id={s.id} />}
          </li>
        ))}
      </ul>
    </TableCard>
  )
}
