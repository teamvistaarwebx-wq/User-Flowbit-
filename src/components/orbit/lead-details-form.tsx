'use client'

import { ExternalLink, Mail, Phone } from 'lucide-react'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Input, Textarea } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { whatsappHref } from '@/modules/orbit/normalize'
import { OrbitWhatsAppButton } from './whatsapp-button'
import type { OrbitChoices } from '@/modules/orbit/record-types'
import { updateLead } from '@/modules/orbit/leads.actions'
import { WhatsappIcon } from './brand-icons'

export type LeadDetailsValues = {
  id: string
  companyName: string
  contactName: string
  designation: string
  email: string
  phone: string
  instagramHandle: string
  linkedinUrl: string
  website: string
  sector: string
  source: string
  icpScore: number | null
  valuePaise: number | null
  ownerId: string
  reviewerId: string | null
  notes: string
  ownerName: string
  reviewerName: string
}

/** Merges the current value into the options so a deactivated sector/source still shows. */
const withCurrent = (opts: { value: string; label: string }[], value: string, label: string) => (opts.some((o) => o.value === value) ? opts : [{ value, label }, ...opts])

function QuickLinks({ v, whatsappSend }: { v: LeadDetailsValues; whatsappSend: boolean }) {
  const wa = whatsappSend ? null : whatsappHref(v.phone)
  const links = [
    v.email ? { href: `mailto:${v.email}`, label: v.email, icon: <Mail className="size-3.5" /> } : null,
    v.phone ? { href: `tel:${v.phone.replace(/\s/g, '')}`, label: v.phone, icon: <Phone className="size-3.5" /> } : null,
    wa ? { href: wa, label: 'WhatsApp', icon: <WhatsappIcon size={14} /> } : null,
    v.instagramHandle ? { href: `https://instagram.com/${v.instagramHandle}`, label: `@${v.instagramHandle}`, icon: <ExternalLink className="size-3.5" /> } : null,
    v.linkedinUrl ? { href: v.linkedinUrl, label: 'LinkedIn', icon: <ExternalLink className="size-3.5" /> } : null,
    v.website ? { href: v.website, label: v.website.replace(/^https?:\/\//, ''), icon: <ExternalLink className="size-3.5" /> } : null,
  ].filter((l): l is NonNullable<typeof l> => Boolean(l))
  const send = whatsappSend && v.phone ? <OrbitWhatsAppButton connected href={null} target={{ leadId: v.id }} name={v.contactName || v.companyName} /> : null
  if (!links.length && !send) return null
  return (
    <div className="mb-4 flex flex-wrap gap-2">
      {send}
      {links.map((l) => (
        <a key={l.href} href={l.href} target={l.href.startsWith('http') ? '_blank' : undefined} rel="noreferrer" className="inline-flex h-7 max-w-full items-center gap-1.5 truncate rounded-full border border-white/[0.18] bg-control px-3 text-xs text-white transition-colors hover:border-white/30">
          {l.icon}<span className="truncate">{l.label}</span>
        </a>
      ))}
    </div>
  )
}

/** Inline details editor on the lead page (read-only text for people who can't edit). */
export function LeadDetailsForm({ values: v, choices, sectorLabel, sourceLabel, canEdit, canAssign, whatsappSend = false }: { values: LeadDetailsValues; choices: Pick<OrbitChoices, 'sources' | 'sectors' | 'owners' | 'reviewers'>; sectorLabel: string; sourceLabel: string; canEdit: boolean; canAssign: boolean; /** The workspace's own WhatsApp number is connected: the button sends a template instead of opening wa.me. */ whatsappSend?: boolean }) {
  const sectors = withCurrent(choices.sectors.map((s) => ({ value: s.key, label: s.label })), v.sector, sectorLabel)
  const sources = withCurrent(choices.sources.map((s) => ({ value: s.key, label: s.label })), v.source, sourceLabel)
  return (
    <>
      <QuickLinks v={v} whatsappSend={whatsappSend} />
      <ActionForm action={updateLead} className="grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="id" value={v.id} />
        <fieldset disabled={!canEdit} className="contents">
          <FormField name="companyName" label="Company" required className="sm:col-span-2"><Input id="d-companyName" name="companyName" defaultValue={v.companyName} maxLength={120} /></FormField>
          <FormField name="contactName" label="Contact"><Input id="d-contactName" name="contactName" defaultValue={v.contactName} /></FormField>
          <FormField name="designation" label="Designation"><Input id="d-designation" name="designation" defaultValue={v.designation} /></FormField>
          <FormField name="email" label="Email"><Input id="d-email" name="email" type="email" defaultValue={v.email} /></FormField>
          <FormField name="phone" label="Phone"><Input id="d-phone" name="phone" defaultValue={v.phone} /></FormField>
          <FormField name="instagramHandle" label="Instagram"><Input id="d-ig" name="instagramHandle" defaultValue={v.instagramHandle} placeholder="@brand" /></FormField>
          <FormField name="linkedinUrl" label="LinkedIn"><Input id="d-li" name="linkedinUrl" defaultValue={v.linkedinUrl} /></FormField>
          <FormField name="website" label="Website" className="sm:col-span-2"><Input id="d-web" name="website" defaultValue={v.website} /></FormField>
          <FormField name="sector" label="Sector"><Select id="d-sector" name="sector" defaultValue={v.sector} options={sectors} disabled={!canEdit} /></FormField>
          <FormField name="source" label="Source"><Select id="d-source" name="source" defaultValue={v.source} options={sources} disabled={!canEdit} /></FormField>
          <FormField name="icpScore" label="ICP fit">
            <Select id="d-icp" name="icpScore" defaultValue={v.icpScore ? String(v.icpScore) : undefined} placeholder="Not rated" options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: `${n} / 5` }))} disabled={!canEdit} />
          </FormField>
          <FormField name="valueRupees" label="Est. value (₹)"><Input id="d-value" name="valueRupees" inputMode="decimal" defaultValue={v.valuePaise ? String(v.valuePaise / 100) : ''} /></FormField>
          {canAssign ? (
            <>
              <FormField name="ownerId" label="Owner"><Select id="d-owner" name="ownerId" defaultValue={v.ownerId} options={withCurrent(choices.owners, v.ownerId, v.ownerName)} /></FormField>
              <FormField name="reviewerId" label="Reviewer"><Select id="d-reviewer" name="reviewerId" defaultValue={v.reviewerId ?? undefined} placeholder="None" options={v.reviewerId ? withCurrent(choices.reviewers, v.reviewerId, v.reviewerName) : choices.reviewers} /></FormField>
            </>
          ) : (
            <div className="grid grid-cols-2 gap-3 text-sm sm:col-span-2">
              <div><p className="text-sm font-medium text-white">Owner</p><p className="mt-1 text-fg-2">{v.ownerName}</p></div>
              <div><p className="text-sm font-medium text-white">Reviewer</p><p className="mt-1 text-fg-2">{v.reviewerName}</p></div>
            </div>
          )}
          <FormField name="notes" label="Notes" className="sm:col-span-2"><Textarea id="d-notes" name="notes" rows={3} defaultValue={v.notes} maxLength={2000} /></FormField>
        </fieldset>
        {canEdit ? <div className="flex justify-end sm:col-span-2"><SubmitButton size="sm">Save changes</SubmitButton></div> : null}
      </ActionForm>
    </>
  )
}
