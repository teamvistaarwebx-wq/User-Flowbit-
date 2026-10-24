'use client'

import { useState } from 'react'
import { Copy, ShieldCheck, ShieldAlert } from 'lucide-react'
import { ActionForm, FormField, SubmitButton, useAction } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { toast } from '@/lib/toast'
import { confirmTwoFactorAction, disableTwoFactorAction, regenerateRecoveryCodesAction, setRequireTwoFactorAdmins, startTwoFactorSetupAction } from '@/lib/auth/two-factor-actions'

export type TwoFactorEnrolment = { qrPath: string; qrSize: number; secret: string }

export type TwoFactorView =
  | { state: 'on'; enabledOn: string; recoveryLeft: number }
  | { state: 'off' }
  | { state: 'unavailable' }

function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const copy = async () => {
    await navigator.clipboard.writeText(codes.join('\n'))
    toast.success('Recovery codes copied')
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-fg-2">Save these recovery codes somewhere safe, such as a password manager. Each works once if you lose your phone. They are not shown again.</p>
      <ul className="grid grid-cols-2 gap-2 rounded-[10px] bg-white/[0.04] p-3 font-mono text-sm text-white">
        {codes.map((c) => <li key={c}>{c}</li>)}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" icon={<Copy className="size-4" />} onClick={copy}>Copy codes</Button>
        <Button onClick={onDone}>I saved them</Button>
      </div>
    </div>
  )
}

function CodeDialog({ open, onOpenChange, title, description, action, submit, danger, onCodes }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  action: typeof disableTwoFactorAction | typeof regenerateRecoveryCodesAction
  submit: string
  danger?: boolean
  onCodes?: (codes: string[]) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} size="sm" title={title} description={description}>
      <ActionForm action={action} onDone={(r) => { const codes = (r.data as { codes?: string[] } | undefined)?.codes; if (codes) onCodes?.(codes); onOpenChange(false) }} className="space-y-4">
        <FormField name="code" label="Code from your app, or a recovery code">
          <Input id="code" name="code" autoComplete="one-time-code" required maxLength={20} />
        </FormField>
        <div className="flex justify-end">
          <SubmitButton variant={danger ? 'danger' : 'primary'}>{submit}</SubmitButton>
        </div>
      </ActionForm>
    </Dialog>
  )
}

/** Not on yet: a Set up button first; the secret and QR are made only after the click. */
function TwoFactorSetup({ required, onCodes }: { required: boolean; onCodes: (codes: string[]) => void }) {
  const [enrolment, setEnrolment] = useState<TwoFactorEnrolment | null>(null)
  const [start, starting] = useAction(startTwoFactorSetupAction, { noRefresh: true, onDone: (r) => r.data && setEnrolment(r.data) })
  const description = required ? 'This workspace requires it for owners and admins. Set it up to continue.' : 'Ask for a code from an authenticator app (Google Authenticator, 1Password, Authy…) after your password or Google.'
  if (!enrolment) {
    return (
      <Card variant="solid">
        <CardHeader label="Two-factor sign-in" icon={<ShieldAlert />} description={description} />
        <div>
          <Button loading={starting} onClick={() => start({})}>Set up two-factor sign-in</Button>
        </div>
      </Card>
    )
  }
  return (
    <Card variant="solid">
      <CardHeader label="Two-factor sign-in" icon={<ShieldAlert />} description={description} />
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <div className="flex flex-col items-center gap-2">
          <svg viewBox={`-2 -2 ${enrolment.qrSize} ${enrolment.qrSize}`} className="size-40 rounded-xl bg-white p-1" role="img" aria-label="QR code for your authenticator app" shapeRendering="crispEdges">
            <path d={enrolment.qrPath} fill="#000" />
          </svg>
          <p className="max-w-[12rem] text-center text-xs text-fg-2">Can&apos;t scan? Key: <span className="break-all font-mono text-white">{enrolment.secret.match(/.{1,4}/g)?.join(' ')}</span></p>
        </div>
        <ActionForm action={confirmTwoFactorAction} onDone={(r) => onCodes(r.data?.codes ?? [])} className="min-w-0 flex-1 space-y-4">
          <FormField name="code" label="Code from the app" help="Scan the QR code, then type the 6 digits your app shows.">
            <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" required maxLength={10} />
          </FormField>
          <SubmitButton pendingLabel="Checking…">Turn on two-factor sign-in</SubmitButton>
        </ActionForm>
      </div>
    </Card>
  )
}

/** Settings → Security: two-factor sign-in for the signed-in user (QR enrolment, recovery codes, turn off). */
export function TwoFactorCard({ view, required }: { view: TwoFactorView; required: boolean }) {
  const [codes, setCodes] = useState<string[] | null>(null)
  const [panel, setPanel] = useState<'disable' | 'renew' | null>(null)
  const close = (open: boolean) => !open && setPanel(null)

  if (codes) {
    return (
      <Card variant="solid">
        <CardHeader label="Recovery codes" icon={<ShieldCheck />} />
        <RecoveryCodes codes={codes} onDone={() => setCodes(null)} />
      </Card>
    )
  }
  if (view.state === 'unavailable') {
    return (
      <Card variant="solid">
        <CardHeader label="Two-factor sign-in" icon={<ShieldAlert />} description="Not available yet: APP_ENCRYPTION_KEY is not set on this server. Ask the person who runs Flowbit to set it." />
      </Card>
    )
  }
  if (view.state === 'off') return <TwoFactorSetup required={required} onCodes={setCodes} />
  return (
    <Card variant="solid">
      <CardHeader
        label="Two-factor sign-in"
        icon={<ShieldCheck />}
        description={`On since ${view.enabledOn}. ${view.recoveryLeft} recovery ${view.recoveryLeft === 1 ? 'code' : 'codes'} left.`}
        actions={
          <>
            <Button size="sm" variant="secondary" onClick={() => setPanel('renew')}>New recovery codes</Button>
            {required ? null : <Button size="sm" variant="ghost" onClick={() => setPanel('disable')}>Turn off</Button>}
          </>
        }
      />
      <p className="text-xs text-fg-2">Lost your phone and your codes? A workspace admin can reset it from Settings → Members.</p>
      <CodeDialog open={panel === 'renew'} onOpenChange={close} title="Make new recovery codes?" description="The old codes stop working." action={regenerateRecoveryCodesAction} submit="Make new codes" onCodes={setCodes} />
      <CodeDialog open={panel === 'disable'} onOpenChange={close} title="Turn off two-factor sign-in?" description="You will sign in with your password or Google alone. Remembered devices are forgotten." action={disableTwoFactorAction} submit="Turn off" danger />
    </Card>
  )
}

/** Settings → Security, org.manage: require two-factor sign-in for owners and admins. */
export function RequireTwoFactorCard({ required, workspace }: { required: boolean; workspace: string }) {
  const [run, pending] = useAction(setRequireTwoFactorAdmins)
  return (
    <Card variant="solid">
      <CardHeader
        label="Require two-factor for admins"
        icon={<ShieldCheck />}
        description={`Owners and admins of ${workspace} must use two-factor sign-in. Those without it are sent to this page until they set it up.`}
        actions={<Switch aria-label="Require two-factor sign-in for admins" checked={required} disabled={pending} onCheckedChange={(next) => run({ required: next })} />}
      />
    </Card>
  )
}
