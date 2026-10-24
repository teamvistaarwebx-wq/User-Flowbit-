'use client'

import { useState } from 'react'
import { CircleCheck, Send } from 'lucide-react'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { ChipGroup } from '@/components/ui/chip-group'
import { Input, Textarea } from '@/components/ui/input'
import { PRODUCTS } from '@/lib/catalog'
import { cn } from '@/lib/utils'
import { submitDemoRequest } from '@/modules/marketing/actions'
import { DEMO_PRODUCTS, DEMO_TEAM_SIZES, HONEYPOT_FIELD, MESSAGE_MAX, TEAM_SIZE_LABELS, type DemoRequestResult } from '@/modules/marketing/demo'
import { START_FREE_LABEL } from '@/modules/marketing/start-free'

const TEAM_OPTIONS = DEMO_TEAM_SIZES.map((v) => ({ value: v, label: TEAM_SIZE_LABELS[v] }))
/** The sign-in card's glass (Figma login-desktop-b): radius 16, backdrop blur, a lit hairline brighter low and left. */
const CARD = 'glass-hero edge-stroke [--stroke:linear-gradient(200deg,rgba(255,255,255,0.3)_0%,rgba(255,255,255,0.32)_40%,rgba(255,255,255,0.46)_75%,rgba(255,255,255,0.5)_100%)]'

/** Demo request form: validated on the server, stored, and emailed to the Flowbit team. */
export function ContactForm() {
  const [sent, setSent] = useState<DemoRequestResult | null>(null)

  if (sent) {
    return (
      <div className={cn(CARD, 'flex flex-col items-center p-10 text-center animate-scale-in')} role="status">
        <CircleCheck className="size-9 text-mint" strokeWidth={1.25} aria-hidden />
        <h2 className="mt-5 text-2xl font-semibold text-white">Thanks, {sent.firstName}.</h2>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-white/75">We’ll reply to {sent.email} soon. Meanwhile, you can start free and look around with every product switched on.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button variant="primary" href="/signup">{START_FREE_LABEL}</Button>
          <Button variant="secondary" onClick={() => setSent(null)}>Send another request</Button>
        </div>
      </div>
    )
  }

  return (
    <ActionForm action={submitDemoRequest} noRefresh onDone={(result) => result.ok && result.data && setSent(result.data)} className={cn(CARD, 'relative grid gap-5 p-6 sm:grid-cols-2 sm:p-10')}>
      <FormField name="name" label="Your name" required>
        <Input id="name" name="name" autoComplete="name" placeholder="Aditi Singh" maxLength={80} />
      </FormField>
      <FormField name="email" label="Work email" required>
        <Input id="email" name="email" type="email" autoComplete="email" placeholder="aditi@company.in" />
      </FormField>
      <FormField name="company" label="Company" required>
        <Input id="company" name="company" autoComplete="organization" placeholder="Kalpa Studio LLP" maxLength={120} />
      </FormField>
      <FormField name="phone" label="Phone" help="Optional, if you prefer a call">
        <Input id="phone" name="phone" type="tel" autoComplete="tel" placeholder="+91 98765 43210" />
      </FormField>
      <FormField name="teamSize" label="Team size" required className="sm:col-span-2">
        <ChipGroup name="teamSize" options={TEAM_OPTIONS} />
      </FormField>
      <fieldset className="sm:col-span-2">
        <legend className="mb-2 text-sm font-medium text-white">Interested in</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {DEMO_PRODUCTS.map((p) => (
            <Checkbox key={p} name="products[]" value={p} label={PRODUCTS[p].name} description={PRODUCTS[p].tagline} />
          ))}
        </div>
      </fieldset>
      <FormField name="message" label="What should the demo cover?" required className="sm:col-span-2">
        <Textarea id="message" name="message" rows={5} maxLength={MESSAGE_MAX} placeholder="For example: we are 35 people, run payroll in spreadsheets and invoice from two companies." />
      </FormField>
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor={HONEYPOT_FIELD}>Leave this empty</label>
        <input id={HONEYPOT_FIELD} name={HONEYPOT_FIELD} type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 sm:col-span-2">
        <p className="text-xs text-[#979797]">We use these details only to reply to you.</p>
        <SubmitButton size="lg" pendingLabel="Sending…" icon={<Send className="size-4" />}>Request a demo</SubmitButton>
      </div>
    </ActionForm>
  )
}
