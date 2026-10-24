'use client'

import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { CopyButton } from '@/components/settings/copy-button'
import { ActionForm, FormField, SubmitButton, useAction } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { pullIndiamartNowAction, regenerateCaptureKeyAction, saveIndiamartAction, saveLeadAssignmentAction, saveLeadFormAction, saveLeadHookAction } from '@/modules/orbit/capture/actions'

/** Orbit → Settings → Lead capture: website form (HTML and script), webhook, IndiaMART, assignment. */

export type LeadCaptureProps = Readonly<{
  formEnabled: boolean
  allowedOrigins: readonly string[]
  thankYouUrl: string
  formUrl: string
  embedUrl: string
  hookEnabled: boolean
  hookUrl: string
  hookTokenLast4: string
  assignMode: 'owner' | 'round_robin'
  ownerMemberId: string | null
  poolMemberIds: readonly string[]
  people: readonly { id: string; name: string }[]
  indiamart: Readonly<{ enabled: boolean; keyLast4: string; lastPulled: string | null; lastError: string; lastCount: number }>
  canEdit: boolean
}>

function Snippet({ label, code }: { label: string; code: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs uppercase tracking-[0.04em] text-fg-3">{label}</span>
        <CopyButton value={code} />
      </div>
      <pre className="max-h-48 overflow-auto rounded-[10px] bg-black/40 p-3 text-[11px] leading-4 text-white/80 ring-1 ring-inset ring-white/10">{code}</pre>
    </div>
  )
}

const htmlSnippet = (url: string) => `<form action="${url}" method="POST">
  <input name="name" placeholder="Name" required>
  <input name="email" type="email" placeholder="Email">
  <input name="phone" type="tel" placeholder="Phone">
  <input name="company" placeholder="Company">
  <textarea name="message" placeholder="How can we help?"></textarea>
  <!-- Leave this hidden field empty: it catches bots. -->
  <input name="company_website" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px">
  <!-- Optional: utm_source, utm_medium, utm_campaign as hidden fields. -->
  <button type="submit">Send</button>
</form>`

const scriptSnippet = (url: string) => `<div data-flowbit-lead-form></div>
<script src="${url}" async></script>`

function HookForm({ enabled, last4, canEdit }: { enabled: boolean; last4: string; canEdit: boolean }) {
  const [token, setToken] = useState<string | null>(null)
  return (
    <ActionForm action={saveLeadHookAction} className="space-y-3" onDone={(r) => setToken((r.data as { token?: string } | undefined)?.token ?? null)}>
      <Checkbox name="hookEnabled" defaultChecked={enabled} label="Accept leads on this webhook" disabled={!canEdit} />
      <Checkbox name="newToken" label={last4 ? `Make a new token (now ${last4})` : 'Make the token'} disabled={!canEdit} />
      {token ? (
        <div className="flex items-center gap-2 rounded-full bg-control py-1.5 pl-4 pr-1.5 ring-1 ring-inset ring-white/10">
          <code className="min-w-0 flex-1 truncate text-xs text-white">{token}</code>
          <CopyButton value={token} />
        </div>
      ) : null}
      <SubmitButton pendingLabel="Saving…" disabled={!canEdit}>Save webhook</SubmitButton>
    </ActionForm>
  )
}

export function LeadCaptureSettings(props: LeadCaptureProps) {
  const [regenerate, regenerating] = useAction(regenerateCaptureKeyAction)
  const [pull, pulling] = useAction(pullIndiamartNowAction)
  const [mode, setMode] = useState(props.assignMode)
  const peopleOptions = props.people.map((p) => ({ value: p.id, label: p.name }))
  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-[0.04em] text-white">Website form</h3>
        <p className="text-[13px] text-fg-2">Paste either snippet on your site. Only the websites listed here can post; a hidden field catches bots; each visitor can send 10 forms in 15 minutes. Every enquiry becomes a lead with source Website form and the page&apos;s UTM tags.</p>
        <ActionForm action={saveLeadFormAction} className="space-y-3">
          <Checkbox name="formEnabled" defaultChecked={props.formEnabled} label="Accept enquiries from my website" disabled={!props.canEdit} />
          <FormField name="allowedOrigins" label="Your websites (one per line)" help="For example https://acme.in, or *.acme.in for every subdomain.">
            <Textarea id="allowedOrigins" name="allowedOrigins" rows={3} defaultValue={props.allowedOrigins.join('\n')} disabled={!props.canEdit} />
          </FormField>
          <FormField name="thankYouUrl" label="Thank-you page (optional, for the HTML form)">
            <Input id="thankYouUrl" name="thankYouUrl" type="url" defaultValue={props.thankYouUrl} placeholder="https://acme.in/thank-you" disabled={!props.canEdit} />
          </FormField>
          <SubmitButton pendingLabel="Saving…" disabled={!props.canEdit}>Save form</SubmitButton>
        </ActionForm>
        <Snippet label="HTML form" code={htmlSnippet(props.formUrl)} />
        <Snippet label="Script (draws the form for you)" code={scriptSnippet(props.embedUrl)} />
        <Button size="sm" variant="ghost" icon={<RefreshCw className="size-3.5" />} loading={regenerating} disabled={!props.canEdit} onClick={() => void regenerate({ which: 'form' })}>New form URL</Button>
      </section>

      <section className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-[0.04em] text-white">Webhook (Zapier, Meta lead ads, JustDial)</h3>
        <p className="text-[13px] text-fg-2">POST JSON to this URL with your token as <code>?token=</code> or an <code>x-flowbit-token</code> header. Flat fields (name, email, phone, company, message, utm_*), Meta lead ads <code>field_data</code> and JustDial&apos;s lead push (leadid, name, mobile, email, category, city) are all read. For JustDial, give their team this URL with <code>?token=</code> on the end.</p>
        <div className="flex h-10 items-center gap-2 rounded-full bg-control pl-4 pr-1.5 ring-1 ring-inset ring-white/10">
          <code className="min-w-0 flex-1 truncate text-xs text-white/80">{props.hookUrl}</code>
          <CopyButton value={props.hookUrl} />
        </div>
        <HookForm enabled={props.hookEnabled} last4={props.hookTokenLast4} canEdit={props.canEdit} />
        <Button size="sm" variant="ghost" icon={<RefreshCw className="size-3.5" />} loading={regenerating} disabled={!props.canEdit} onClick={() => void regenerate({ which: 'hook' })}>New webhook URL</Button>
      </section>

      <section className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-[0.04em] text-white">IndiaMART <span className="ml-1 rounded-full bg-white/10 px-2 py-0.5 text-[11px] normal-case tracking-normal text-fg-2">Beta</span></h3>
        <p className="text-[13px] text-fg-2">Paste the CRM key from IndiaMART Lead Manager → Import/Export → Pull API (generate the key there). Flowbit checks for new enquiries every 15 minutes (IndiaMART allows one check every 5 minutes). Beta: check the first leads against IndiaMART once you turn it on.</p>
        <ActionForm action={saveIndiamartAction} className="space-y-3">
          <Checkbox name="enabled" defaultChecked={props.indiamart.enabled} label="Pull IndiaMART enquiries into Orbit" disabled={!props.canEdit} />
          <FormField name="crmKey" label="IndiaMART CRM key" help={props.indiamart.keyLast4 ? `Saved (${props.indiamart.keyLast4}). Leave blank to keep it.` : 'Stored encrypted; never shown again.'}>
            <Input id="crmKey" name="crmKey" type="password" autoComplete="new-password" spellCheck={false} disabled={!props.canEdit} />
          </FormField>
          <div className="flex flex-wrap gap-3">
            <SubmitButton pendingLabel="Saving…" disabled={!props.canEdit}>Save IndiaMART</SubmitButton>
            {props.indiamart.enabled ? <Button variant="secondary" loading={pulling} onClick={() => void pull({})}>Check now</Button> : null}
          </div>
        </ActionForm>
        <p className="text-xs text-fg-3">{props.indiamart.lastPulled ? `Last checked ${props.indiamart.lastPulled}: ${props.indiamart.lastCount} new.` : 'Not checked yet.'}{props.indiamart.lastError ? ` Last error: ${props.indiamart.lastError}` : ''}</p>
      </section>

      <section className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-[0.04em] text-white">Who gets new leads</h3>
        <p className="text-[13px] text-fg-2">Applies to the website form, the webhook, IndiaMART and new WhatsApp chats. The person is alerted at once, on the channels their notification settings choose.</p>
        <ActionForm action={saveLeadAssignmentAction} className="space-y-3">
          <FormField name="assignMode" label="Assign">
            <NativeSelect id="assignMode" name="assignMode" value={mode} onChange={(e) => setMode(e.target.value as 'owner' | 'round_robin')} options={[{ value: 'owner', label: 'Always to one person' }, { value: 'round_robin', label: 'Round-robin, in turns' }]} disabled={!props.canEdit} />
          </FormField>
          <FormField name="ownerMemberId" label={mode === 'owner' ? 'Person' : 'If nobody in the rotation is active'}>
            <NativeSelect id="ownerMemberId" name="ownerMemberId" defaultValue={props.ownerMemberId ?? ''} placeholder="Workspace owner" options={peopleOptions} disabled={!props.canEdit} />
          </FormField>
          {mode === 'round_robin' ? (
            <fieldset className="space-y-2" data-field="poolMemberIds">
              <legend className="mb-1 text-sm text-fg">Takes turns</legend>
              {props.people.map((p) => (
                <Checkbox key={p.id} name="poolMemberIds" value={p.id} defaultChecked={props.poolMemberIds.includes(p.id)} label={p.name} disabled={!props.canEdit} />
              ))}
            </fieldset>
          ) : null}
          <SubmitButton pendingLabel="Saving…" disabled={!props.canEdit}>Save</SubmitButton>
        </ActionForm>
      </section>
    </div>
  )
}
