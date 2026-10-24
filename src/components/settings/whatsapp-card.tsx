'use client'

import { useState } from 'react'
import { MessageCircle } from 'lucide-react'
import { ActionForm, FormField, SubmitButton, useAction } from '@/components/ui/action-form'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { FactRow, SurfaceHeader } from '@/components/settings/surface'
import { confirmPhoneCode, requestPhoneCode, setWhatsAppOptIn } from '@/modules/whatsapp/phone-actions'

type WhatsAppCardProps = {
  phone: string | null
  verified: boolean
  optedIn: boolean
  /** Owners and admins: Flowbit's own bills and reminders (WhatsApp A). */
  flowbitBills: boolean
  /** The workspace connected its own number (WhatsApp B): team alerts, per My alerts. */
  teamAlerts: boolean
}

function describe(bills: boolean, team: boolean): string {
  const text = [bills ? 'Flowbit bills, payment links and renewal reminders for this workspace' : null, team ? 'team alerts you turn on in My alerts, from your workspace’s WhatsApp number' : null].filter(Boolean).join('; ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** Settings → Profile: the WhatsApp number (verified by OTP) and the one opt-in for Flowbit's bills and the workspace's team alerts. */
export function WhatsAppCard({ phone, verified, optedIn, flowbitBills, teamAlerts }: WhatsAppCardProps) {
  const [codeSentTo, setCodeSentTo] = useState<string | null>(null)
  const [editing, setEditing] = useState(!verified)
  const [toggle, toggling] = useAction(setWhatsAppOptIn)
  return (
    <section className="glass rounded-[14px] p-5">
      <SurfaceHeader icon={<MessageCircle strokeWidth={1.5} />} label="WhatsApp" description={`${describe(flowbitBills, teamAlerts)}, on WhatsApp as well as email. Payslip amounts never go by WhatsApp. Reply STOP any time to stop.`} />
      <div className="mt-3 space-y-3">
        {verified && !editing ? (
          <FactRow label="Number">
            <span className="flex items-center gap-3">{phone} <button type="button" className="text-xs text-link hover:underline" onClick={() => setEditing(true)}>Change</button></span>
          </FactRow>
        ) : codeSentTo ? (
          <ActionForm action={confirmPhoneCode} onDone={() => { setCodeSentTo(null); setEditing(false) }} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <FormField name="code" label={`Code sent to ${codeSentTo}`} className="flex-1"><Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} /></FormField>
            <SubmitButton pendingLabel="Checking…">Verify</SubmitButton>
          </ActionForm>
        ) : (
          <ActionForm action={requestPhoneCode} onDone={(r) => setCodeSentTo(r.data?.phone ?? 'your number')} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <FormField name="phone" label="Mobile number" help="We send a code on WhatsApp to prove it is yours." className="flex-1"><Input id="phone" name="phone" inputMode="tel" autoComplete="tel" defaultValue={phone ?? ''} /></FormField>
            <SubmitButton pendingLabel="Sending…">Send code</SubmitButton>
          </ActionForm>
        )}
        <FactRow label={flowbitBills ? 'Send me WhatsApp messages' : 'Send me team alerts on WhatsApp'}>
          <Switch checked={optedIn} disabled={!verified || toggling} onCheckedChange={(on) => void toggle({ on })} aria-label="WhatsApp messages from Flowbit" />
        </FactRow>
      </div>
    </section>
  )
}
