'use client'

import { useState } from 'react'
import { ActionForm, FormField, SubmitButton, useAction } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Dialog } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { createWebhook, removeWebhook, sendTestWebhook, setWebhookActive, updateWebhook } from '@/modules/webhooks/actions'
import { WEBHOOK_EVENTS, WEBHOOK_EVENT_LABEL } from '@/modules/webhooks/events'

const randomSecret = () => {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return `whsec_${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`
}

/** Add a webhook: URL, events and a signing secret (generated in the browser; copy it before saving). */
export function WebhookForm() {
  const [secret, setSecret] = useState('')
  return (
    <ActionForm action={createWebhook} resetOnSuccess onDone={() => setSecret('')} className="space-y-4">
      <FormField name="url" label="URL" required help="https only in production. Private and internal addresses are refused.">
        <Input name="url" type="url" placeholder="https://hooks.zapier.com/hooks/catch/…" required />
      </FormField>
      <FormField name="description" label="Name (optional)">
        <Input name="description" placeholder="Zapier: new tasks to Google Sheets" maxLength={120} />
      </FormField>
      <FormField name="events" label="Events">
        <div className="grid gap-2 sm:grid-cols-2">
          {WEBHOOK_EVENTS.map((e) => <Checkbox key={e} name="events[]" value={e} label={e} description={WEBHOOK_EVENT_LABEL[e]} />)}
        </div>
      </FormField>
      <FormField name="secret" label="Signing secret" required help="Copy it now: Flowbit stores it encrypted and shows only its last four characters.">
        <div className="flex gap-2">
          <Input name="secret" value={secret} onChange={(e) => setSecret(e.target.value)} minLength={16} required autoComplete="off" />
          <Button variant="secondary" onClick={() => setSecret(randomSecret())}>Generate</Button>
        </div>
      </FormField>
      <SubmitButton>Add webhook</SubmitButton>
    </ActionForm>
  )
}

export type WebhookEditValues = { id: string; url: string; description: string; events: string[]; active: boolean }

/** Edit an existing webhook: URL, name, events and whether it is active. The secret is not shown or changed. */
function WebhookEditForm({ webhook, onDone }: { webhook: WebhookEditValues; onDone: () => void }) {
  const [active, setActive] = useState(webhook.active)
  return (
    <ActionForm action={updateWebhook} onDone={onDone} className="space-y-4">
      <input type="hidden" name="id" value={webhook.id} />
      <input type="hidden" name="active" value={active ? 'true' : 'false'} />
      <FormField name="url" label="URL" required help="A new URL is checked again: private and internal addresses are refused.">
        <Input name="url" type="url" defaultValue={webhook.url} required />
      </FormField>
      <FormField name="description" label="Name (optional)">
        <Input name="description" defaultValue={webhook.description} maxLength={120} />
      </FormField>
      <FormField name="events" label="Events">
        <div className="grid gap-2 sm:grid-cols-2">
          {WEBHOOK_EVENTS.map((e) => <Checkbox key={e} name="events[]" value={e} defaultChecked={webhook.events.includes(e)} label={e} description={WEBHOOK_EVENT_LABEL[e]} />)}
        </div>
      </FormField>
      <label className="flex items-center justify-between gap-3 text-sm text-fg">
        <span>Active <span className="block text-xs text-fg-3">Paused webhooks receive nothing.</span></span>
        <Switch aria-label="Webhook active" checked={active} onCheckedChange={setActive} />
      </label>
      <p className="text-xs text-fg-3">The signing secret stays the same. To change it, remove the webhook and add it again.</p>
      <SubmitButton>Save changes</SubmitButton>
    </ActionForm>
  )
}

export function WebhookRowActions({ id, active, webhook }: { id: string; active: boolean; webhook: WebhookEditValues }) {
  const [editing, setEditing] = useState(false)
  const [test, testing] = useAction(sendTestWebhook)
  const [toggle, toggling] = useAction(setWebhookActive)
  const [remove, removing] = useAction(removeWebhook)
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>Edit</Button>
      <Button size="sm" variant="secondary" loading={testing} disabled={!active} onClick={() => test({ id })}>Send test</Button>
      <Button size="sm" variant="secondary" loading={toggling} onClick={() => toggle({ id, active: !active })}>{active ? 'Pause' : 'Resume'}</Button>
      <Button size="sm" variant="ghost" loading={removing} onClick={() => remove({ id })}>Remove</Button>
      <Dialog open={editing} onOpenChange={setEditing} title="Edit webhook" description={webhook.url}>
        <WebhookEditForm webhook={webhook} onDone={() => setEditing(false)} />
      </Dialog>
    </div>
  )
}
