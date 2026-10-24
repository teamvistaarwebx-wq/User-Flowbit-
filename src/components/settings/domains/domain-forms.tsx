'use client'

import { ActionForm, FormField, SubmitButton, useAction } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { addSendingDomain, removeDomain, setPortalDomain, verifyPortalDomain, verifySendingDomain } from '@/modules/domains/actions'

export function AddDomainForm({ kind, placeholder }: { kind: 'sending' | 'portal'; placeholder: string }) {
  return (
    <ActionForm action={kind === 'sending' ? addSendingDomain : setPortalDomain} resetOnSuccess className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <FormField name="domain" label={kind === 'sending' ? 'Your domain' : 'Portal host'} className="min-w-0 flex-1">
        <Input id={`${kind}-domain`} name="domain" placeholder={placeholder} autoComplete="off" spellCheck={false} />
      </FormField>
      <SubmitButton>{kind === 'sending' ? 'Add domain' : 'Save host'}</SubmitButton>
    </ActionForm>
  )
}

export function DomainButtons({ kind, domain }: { kind: 'sending' | 'portal'; domain: string }) {
  const [verify, verifying] = useAction(kind === 'sending' ? verifySendingDomain : verifyPortalDomain)
  return (
    <span className="flex flex-wrap gap-2">
      <Button size="sm" loading={verifying} onClick={() => verify({})}>Verify</Button>
      <ConfirmDialog
        trigger={<Button size="sm" variant="ghost">Remove</Button>}
        title={`Remove ${domain}?`}
        description={kind === 'sending' ? "Client mail goes from Flowbit's address again straight away." : "The portal is served from Flowbit's address again straight away."}
        confirmLabel="Remove"
        onConfirm={() => removeDomain({ kind })}
      />
    </span>
  )
}
