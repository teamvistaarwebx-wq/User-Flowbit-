'use client'

import { ActionForm, FormField, SubmitButton, useAction } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { disconnectRazorpayAction, saveRazorpayAction } from '@/modules/payments/actions'

type Saved = { connected: boolean; keyId: string; keySecret: string; webhookSecret: string }

/**
 * The workspace's own Razorpay keys. Secrets are write-only: the form shows
 * only their last four characters, and a blank secret keeps the stored one.
 */
export function RazorpayForm({ saved, disabled }: { saved: Saved; disabled: boolean }) {
  const [disconnect] = useAction(disconnectRazorpayAction)
  const keep = (last4: string) => (saved.connected && last4 ? `Saved (${last4}). Leave blank to keep it.` : undefined)
  return (
    <ActionForm action={saveRazorpayAction} className="space-y-4">
      <FormField name="keyId" label="Key id" required help={saved.connected ? `Saved key ends ${saved.keyId}. Enter it again to save changes.` : 'From Razorpay Dashboard → Account & Settings → API keys. Starts rzp_test_ or rzp_live_.'}>
        <Input id="keyId" name="keyId" autoComplete="off" spellCheck={false} placeholder="rzp_live_…" disabled={disabled} />
      </FormField>
      <FormField name="keySecret" label="Key secret" required={!saved.connected} help={keep(saved.keySecret)}>
        <Input id="keySecret" name="keySecret" type="password" autoComplete="new-password" disabled={disabled} />
      </FormField>
      <FormField name="webhookSecret" label="Webhook secret" required={!saved.connected} help={keep(saved.webhookSecret) ?? 'The secret you type when you add the webhook below in Razorpay.'}>
        <Input id="webhookSecret" name="webhookSecret" type="password" autoComplete="new-password" disabled={disabled} />
      </FormField>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pendingLabel="Saving…" disabled={disabled}>
          {saved.connected ? 'Save keys' : 'Connect Razorpay'}
        </SubmitButton>
        {saved.connected ? (
          <ConfirmDialog
            trigger={<Button variant="ghost">Disconnect</Button>}
            title="Disconnect Razorpay?"
            description="The keys are deleted from Flowbit. Payment links already sent keep working in Razorpay, but their payments will no longer be recorded here automatically."
            confirmLabel="Disconnect"
            onConfirm={() => disconnect({})}
          />
        ) : null}
      </div>
    </ActionForm>
  )
}
