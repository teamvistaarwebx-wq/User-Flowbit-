'use client'

import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Card, CardHeader } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input, Textarea } from '@/components/ui/input'
import { HANDOVER_LABEL, HANDOVER_STEPS } from '@/lib/console/handover'
import { TEMPLATE_KEYS, TEMPLATE_LABEL, type ConsoleSettingsValues } from '@/lib/console/settings-defaults'
import { saveConsoleSettings } from '@/modules/console/staff-actions'
import { WA_CATEGORIES, WA_TEMPLATE_KEYS, WA_TEMPLATE_SHAPES } from '@/modules/whatsapp/templates'
import { ALLOWANCE_TIERS, type AllowanceTier } from '@/modules/wallet/rules'
import { ACCOUNT_TYPES, ACCOUNT_TYPE_LABEL } from '@/lib/account-types'

const ALLOWANCE_LABEL: Record<AllowanceTier, string> = { free: 'Free plan', trial: 'Trial', custom: 'Custom plans', suite: 'Suite' }

const LIMIT_LABEL: Record<keyof ConsoleSettingsValues['limits'], string> = { freeSeats: 'Free plan seats', freeMonths: 'Free months', trialDays: 'Trial days', salesExtensionDays: 'Sales trial extension (days)', setupsPerWeek: 'Free setups per week', yearlyDiscountPercent: 'First-year discount on yearly plans (%)' }

/** Prices, limits, templates and help links, edited without a code change (console spec 7.2). */
export function ConsoleSettingsForm({ values, priceLabels, whatsAppEnvOn }: { values: ConsoleSettingsValues; priceLabels: Record<string, string>; whatsAppEnvOn: boolean }) {
  return (
    <ActionForm action={saveConsoleSettings} className="grid grid-cols-12 gap-4">
      <Card className="col-span-12 lg:col-span-6">
        <CardHeader label="Prices" description="Rupees per unit per month, ex-GST. Used for new checkouts, plan changes and new bills. Issued invoices and existing subscribers keep the prices they bought at. The website, FAQ, Terms and manual print the default values from code (B28): change those too, in a release, before changing a public number here." />
        <div className="grid gap-3 sm:grid-cols-2">
          {Object.entries(values.prices).map(([k, v]) => (
            <FormField key={k} name={`prices.${k}`} label={priceLabels[k] ?? k}><Input id={`prices.${k}`} name={`prices.${k}`} inputMode="decimal" defaultValue={String(v)} /></FormField>
          ))}
        </div>
      </Card>
      <Card className="col-span-12 lg:col-span-6">
        <CardHeader label="Limits" description="Used now: Free seats and months, trial days (new signups and trials), the Sales trial extension, the weekly cap on free setups (yearly customers only) and the percent off a workspace's first yearly invoice (0 to 90; 0 switches it off; renewals and monthly plans pay the list price). The website, FAQ, Terms and manual print the default values from code (B28): change those too, in a release, before changing a public number here." />
        <div className="grid gap-3 sm:grid-cols-2">
          {(Object.keys(values.limits) as (keyof ConsoleSettingsValues['limits'])[]).map((k) => (
            <FormField key={k} name={`limits.${k}`} label={LIMIT_LABEL[k]}><Input id={`limits.${k}`} name={`limits.${k}`} inputMode="numeric" defaultValue={String(values.limits[k])} /></FormField>
          ))}
        </div>
      </Card>
      <Card className="col-span-12 lg:col-span-6">
        <CardHeader label="Templates" description="The opening line of the matching emails, with {placeholders}: trial ending {days} {date}, Free ending {date} {days} {discount}, payment due {number} {amount} {date}, welcome {name}." />
        <div className="space-y-3">
          {TEMPLATE_KEYS.map((k) => (
            <FormField key={k} name={`templates.${k}`} label={TEMPLATE_LABEL[k]}><Textarea id={`templates.${k}`} name={`templates.${k}`} rows={2} maxLength={1000} defaultValue={values.templates[k]} /></FormField>
          ))}
        </div>
      </Card>
      <Card className="col-span-12 lg:col-span-6">
        <CardHeader label="Setup guide help links" description="Used now: the customer's Setup guide card links each step here. https://…, /… or # (no video yet)." />
        <div className="space-y-3">
          {HANDOVER_STEPS.map((k) => (
            <FormField key={k} name={`helpLinks.${k}`} label={HANDOVER_LABEL[k]}><Input id={`helpLinks.${k}`} name={`helpLinks.${k}`} defaultValue={values.helpLinks[k]} /></FormField>
          ))}
        </div>
      </Card>
      <Card className="col-span-12">
        <CardHeader label="Arc AI requests a month" description="Per workspace, by account type. 0 means Arc uses its built-in templates only. At the cap Arc falls back to the templates until the next month. Needs ANTHROPIC_API_KEY on the server." />
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {ACCOUNT_TYPES.map((t) => (
            <FormField key={t} name={`ai.caps.${t}`} label={ACCOUNT_TYPE_LABEL[t]}><Input id={`ai.caps.${t}`} name={`ai.caps.${t}`} inputMode="numeric" defaultValue={String(values.ai.caps[t])} /></FormField>
          ))}
        </div>
      </Card>
      <Card className="col-span-12">
        <CardHeader label="Meetings AI hours a month" description="Transcription hours per workspace with the Meetings AI add-on (or a trial). Paid, Comped and Internal workspaces get the per-seat figure times their seats. Needs SARVAM_API_KEY on the server." />
        <div className="grid gap-3 sm:grid-cols-3">
          <FormField name="meetings.caps.free" label="Free"><Input id="meetings.caps.free" name="meetings.caps.free" inputMode="decimal" defaultValue={String(values.meetings.caps.free)} /></FormField>
          <FormField name="meetings.caps.trial" label="Trial and Test"><Input id="meetings.caps.trial" name="meetings.caps.trial" inputMode="decimal" defaultValue={String(values.meetings.caps.trial)} /></FormField>
          <FormField name="meetings.caps.paidPerSeat" label="Paid, per seat"><Input id="meetings.caps.paidPerSeat" name="meetings.caps.paidPerSeat" inputMode="decimal" defaultValue={String(values.meetings.caps.paidPerSeat)} /></FormField>
        </div>
      </Card>
      <Card className="col-span-12">
        <CardHeader
          label={`Salary TDS rules (tax year ${values.tax.fy})`}
          description="Slabs (upTo in rupees, null for the top slab), standard deduction, rebate, surcharge, cess and old-regime caps that Muster's automatic TDS uses for every workspace. Change only the numbers when a Finance Act changes them; blank restores the built-in FY 2026-27 rules. Workspaces still see a verify-with-your-CA note."
        />
        <FormField name="taxRules" label="Rules (JSON)">
          <Textarea id="taxRules" name="taxRules" rows={14} maxLength={20_000} spellCheck={false} className="font-mono text-xs" defaultValue={JSON.stringify(values.tax, null, 2)} />
        </FormField>
      </Card>
      <Card className="col-span-12">
        <CardHeader label="Features" description="Platform switches for every workspace. A feature shows only when its server switch is on too." />
        <Checkbox
          name="features.whatsapp"
          defaultChecked={values.features.whatsapp}
          label="WhatsApp"
          description={`Integrations, the wallet, phone opt-in, WhatsApp alerts, Send on WhatsApp, the inbox and the employee bot. Server switch FEATURE_WHATSAPP is ${whatsAppEnvOn ? 'on' : 'off, so WhatsApp stays hidden whatever this says'}.`}
        />
      </Card>
      <Card className="col-span-12 lg:col-span-8">
        <CardHeader label="WhatsApp templates" description="Create and approve each template in Interakt first (docs/WHATSAPP-TEMPLATES.md has the text), then enter its exact name here. Variables: the order of {{1}}, {{2}}… in the template body." />
        <div className="space-y-4">
          {WA_TEMPLATE_KEYS.map((k) => {
            const shape = WA_TEMPLATE_SHAPES[k]
            const t = values.whatsapp.templates[k]
            const base = `whatsapp.templates.${k}`
            return (
              <div key={k} className="grid gap-3 border-b border-line pb-4 last:border-0 sm:grid-cols-[1.4fr_0.6fr_1.4fr]">
                <FormField name={`${base}.name`} label={`${shape.label} · ${shape.category}`} help={`${shape.header === 'document' ? 'PDF header · ' : ''}${shape.button === 'url' ? 'URL button' : shape.button === 'copy_code' ? 'Copy-code button' : 'No button'}`}>
                  <Input id={`${base}.name`} name={`${base}.name`} defaultValue={t.name} />
                </FormField>
                <FormField name={`${base}.language`} label="Language"><Input id={`${base}.language`} name={`${base}.language`} defaultValue={t.language} /></FormField>
                <FormField name={`${base}.params`} label="Variables, in order" help={`Allowed: ${shape.variables.join(', ')}`}>
                  <Input id={`${base}.params`} name={`${base}.params`} defaultValue={t.params.join(', ')} />
                </FormField>
              </div>
            )
          })}
        </div>
      </Card>
      <Card className="col-span-12 lg:col-span-4">
        <CardHeader label="WhatsApp rate card" description="Interakt cost per message in rupees, ex-GST. Each WhatsApp message records its cost from here." />
        <div className="grid gap-3 sm:grid-cols-2">
          {WA_CATEGORIES.map((c) => (
            <FormField key={c} name={`whatsapp.rates.${c}`} label={c[0].toUpperCase() + c.slice(1)}><Input id={`whatsapp.rates.${c}`} name={`whatsapp.rates.${c}`} inputMode="decimal" defaultValue={String(values.whatsapp.rates[c])} /></FormField>
          ))}
        </div>
      </Card>
      <Card className="col-span-12">
        <CardHeader label="WhatsApp wallet (customers' own numbers)" description="Flowbit's price per message in rupees ex-GST (Flowbit-managed mode, later), the platform fee per message for workspaces on their own Interakt account (₹0 = free), the free messages a month per plan, and the low-balance alert." />
        <div className="grid gap-3 sm:grid-cols-4">
          {WA_CATEGORIES.map((c) => (
            <FormField key={c} name={`wallet.rates.${c}`} label={`${c[0].toUpperCase() + c.slice(1)} (₹)`}><Input id={`wallet.rates.${c}`} name={`wallet.rates.${c}`} inputMode="decimal" defaultValue={String(values.wallet.rates[c] / 100)} /></FormField>
          ))}
          <FormField name="wallet.byoFee" label="Own-account fee (₹ a message)"><Input id="wallet.byoFee" name="wallet.byoFee" inputMode="decimal" defaultValue={String(values.wallet.byoFeePaise / 100)} /></FormField>
          <FormField name="wallet.lowBalance" label="Low-balance alert below (₹)"><Input id="wallet.lowBalance" name="wallet.lowBalance" inputMode="decimal" defaultValue={String(values.wallet.lowBalancePaise / 100)} /></FormField>
          {ALLOWANCE_TIERS.map((t) => (
            <FormField key={t} name={`wallet.allowance.${t}`} label={`Free messages a month: ${ALLOWANCE_LABEL[t]}`}><Input id={`wallet.allowance.${t}`} name={`wallet.allowance.${t}`} inputMode="numeric" defaultValue={String(values.wallet.allowance[t])} /></FormField>
          ))}
        </div>
      </Card>
      <div className="col-span-12 flex justify-end"><SubmitButton>Save settings</SubmitButton></div>
    </ActionForm>
  )
}
