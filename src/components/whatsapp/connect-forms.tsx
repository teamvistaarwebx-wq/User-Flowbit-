'use client'

import { Send, Trash2 } from 'lucide-react'
import { ActionForm, FormField, SubmitButton, useAction } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input, NativeSelect } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { deleteCannedReplyAction, disconnectWhatsAppAction, saveCannedReplyAction, saveTemplateMappingAction, saveWhatsAppAction, setWhatsAppBotAction, testWhatsAppAction } from '@/modules/whatsapp/workspace-actions'
import { CUSTOMER_TEMPLATE_KEYS, CUSTOMER_TEMPLATE_SHAPES, type CustomerTemplateRegistry } from '@/modules/whatsapp/customer-templates'
import { WA_CATEGORIES } from '@/modules/whatsapp/templates'

type Saved = { connected: boolean; apiKey: string; webhookSecret: string; displayName: string; phone: string }

/**
 * "Bring your own Interakt account": the API key and webhook secret are
 * write-only (the form shows their last four characters; blank keeps them).
 */
export function ByoConnectForm({ saved, disabled }: { saved: Saved; disabled: boolean }) {
  const [disconnect] = useAction(disconnectWhatsAppAction)
  const keep = (last4: string) => (saved.connected && last4 ? `Saved (${last4}). Leave blank to keep it.` : undefined)
  return (
    <ActionForm action={saveWhatsAppAction} className="space-y-4">
      <FormField name="apiKey" label="Interakt API key" required={!saved.connected} help={keep(saved.apiKey) ?? 'Interakt → Settings → Developer Settings → API key. Needs the Growth plan or higher (Starter has no API).'}>
        <Input id="apiKey" name="apiKey" type="password" autoComplete="new-password" spellCheck={false} disabled={disabled} />
      </FormField>
      <FormField name="webhookSecret" label="Webhook secret" required={!saved.connected} help={keep(saved.webhookSecret) ?? 'Make up a long random value (16+ characters). It goes at the end of the webhook URL you paste in Interakt.'}>
        <Input id="webhookSecret" name="webhookSecret" type="password" autoComplete="new-password" spellCheck={false} disabled={disabled} />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField name="displayName" label="Display name" required help="The business name customers see on WhatsApp.">
          <Input id="displayName" name="displayName" defaultValue={saved.displayName} disabled={disabled} />
        </FormField>
        <FormField name="phone" label="WhatsApp number" required help="With the country code: +91 98765 43210.">
          <Input id="phone" name="phone" inputMode="tel" defaultValue={saved.phone} disabled={disabled} />
        </FormField>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pendingLabel="Saving…" disabled={disabled}>{saved.connected ? 'Save' : 'Connect WhatsApp'}</SubmitButton>
        {saved.connected ? (
          <ConfirmDialog
            trigger={<Button variant="ghost">Disconnect</Button>}
            title="Disconnect WhatsApp?"
            description="The API key and webhook secret are deleted from Flowbit and the webhook URL stops working. Messages fall back to email or the manual WhatsApp queue. Your template mapping is kept."
            confirmLabel="Disconnect"
            onConfirm={() => disconnect({})}
          />
        ) : null}
      </div>
    </ActionForm>
  )
}

const TESTABLE = CUSTOMER_TEMPLATE_KEYS.filter((k) => CUSTOMER_TEMPLATE_SHAPES[k].header === 'none')

/** Sends one approved template to a number the admin types in. */
export function TestSendForm({ defaultTo }: { defaultTo: string }) {
  return (
    <ActionForm action={testWhatsAppAction} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <FormField name="to" label="Send a test to"><Input id="to" name="to" inputMode="tel" placeholder="+91 98765 43210" defaultValue={defaultTo} /></FormField>
      <FormField name="key" label="Template">
        <NativeSelect id="key" name="key" defaultValue="task_alert" options={TESTABLE.map((k) => ({ value: k, label: CUSTOMER_TEMPLATE_SHAPES[k].label }))} />
      </FormField>
      <SubmitButton pendingLabel="Sending…" icon={<Send className="size-4" />}>Send test</SubmitButton>
    </ActionForm>
  )
}

/** The template mapping: the exact name, language, category and variable order of each approved template. */
export function TemplateMappingForm({ registry }: { registry: CustomerTemplateRegistry }) {
  return (
    <ActionForm action={saveTemplateMappingAction} className="space-y-4">
      {CUSTOMER_TEMPLATE_KEYS.map((k) => {
        const shape = CUSTOMER_TEMPLATE_SHAPES[k]
        const t = registry[k]
        const base = `templates.${k}`
        const extras = [shape.header === 'document' ? 'PDF header' : null, shape.button === 'url' ? `URL button "${shape.buttonLabel}"` : null].filter(Boolean).join(' · ')
        return (
          <div key={k} className="grid gap-3 border-b border-line pb-4 last:border-0 sm:grid-cols-[1.4fr_0.5fr_0.8fr_1.4fr]">
            <FormField name={`${base}.name`} label={shape.label} help={extras || 'Text only'}>
              <Input id={`${base}.name`} name={`${base}.name`} defaultValue={t.name} spellCheck={false} />
            </FormField>
            <FormField name={`${base}.language`} label="Language"><Input id={`${base}.language`} name={`${base}.language`} defaultValue={t.language} /></FormField>
            <FormField name={`${base}.category`} label="Category">
              <NativeSelect id={`${base}.category`} name={`${base}.category`} defaultValue={t.category} options={WA_CATEGORIES.map((c) => ({ value: c, label: c[0].toUpperCase() + c.slice(1) }))} />
            </FormField>
            <FormField name={`${base}.params`} label="Variables, in order" help={`Allowed: ${shape.variables.join(', ')}`}>
              <Input id={`${base}.params`} name={`${base}.params`} defaultValue={t.params.join(', ')} spellCheck={false} />
            </FormField>
          </div>
        )
      })}
      <div className="flex justify-end"><SubmitButton>Save template mapping</SubmitButton></div>
    </ActionForm>
  )
}

/** The employee bot switch (BYO only). */
export function BotSwitch({ enabled, available }: { enabled: boolean; available: boolean }) {
  const [set, pending] = useAction(setWhatsAppBotAction)
  return <Switch label="Employee WhatsApp bot" description={available ? 'Verified, opted-in employees can check in and out, see leave balance, apply for leave and get a payslip link by writing to your number.' : 'Connect with your own Interakt account first.'} checked={enabled} disabled={pending || !available} onCheckedChange={(next) => void set({ enabled: next })} />
}

/** Saved replies for the inbox: list with remove, and a short add form. */
export function CannedRepliesEditor({ replies }: { replies: readonly { id: string; title: string; text: string }[] }) {
  const [remove, removing] = useAction(deleteCannedReplyAction)
  return (
    <div className="space-y-3">
      {replies.length ? (
        <ul className="divide-y divide-line text-sm">
          {replies.map((r) => (
            <li key={r.id} className="flex items-start justify-between gap-3 py-2">
              <span className="min-w-0">
                <span className="block font-medium text-white">{r.title}</span>
                <span className="line-clamp-2 block text-xs text-fg-2">{r.text}</span>
              </span>
              <Button size="sm" variant="ghost" loading={removing} icon={<Trash2 className="size-3.5" />} onClick={() => void remove({ id: r.id })} aria-label={`Remove ${r.title}`} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-fg-2">No saved replies yet.</p>
      )}
      <ActionForm action={saveCannedReplyAction} resetOnSuccess className="grid gap-3 sm:grid-cols-[180px_1fr_auto] sm:items-end">
        <FormField name="title" label="Name">
          <Input id="title" name="title" maxLength={60} placeholder="Bank details" />
        </FormField>
        <FormField name="text" label="Reply">
          <Input id="text" name="text" maxLength={1000} placeholder="Our UPI ID is …" />
        </FormField>
        <SubmitButton pendingLabel="Saving…">Add</SubmitButton>
      </ActionForm>
    </div>
  )
}
