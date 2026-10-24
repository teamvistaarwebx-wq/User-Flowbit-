import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { CalendarClock, Receipt, ShieldCheck } from 'lucide-react'
import { formatDate, todayIST } from '@/lib/dates'
import { formatINR } from '@/lib/money'
import { Badge } from '@/components/ui/badge'
import { Logo } from '@/components/ui/logo'
import { SectionLabel } from '@/components/ui/card'
import { Callout } from '@/components/muster/payroll/callout'
import { ClaimSignOut, ClaimSubmitForm } from '@/components/muster/claims/claim-submit-form'
import { VerifyFlow } from '@/components/muster/claims/verify-flow'
import { Claim } from '@/models/muster/Claim'
import { ClaimCategory } from '@/models/muster/ClaimCategory'
import { Employee } from '@/models/muster/Employee'
import { CLAIM_STATUS_LABELS, CLAIM_STATUS_TONES, type ClaimStatus } from '@/modules/muster/claims/constants'
import { formBySlug, formDb, linkedClaimant, readSession } from '@/modules/muster/claims/public'
import { claimFormState, claimWindowProblem, companyDay } from '@/modules/muster/claims/rules'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const found = await formBySlug(slug)
  return { title: found ? `${found.form.name} · ${found.org.name}` : 'Claim form', robots: { index: false } }
}

export default async function PublicClaimPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const found = await formBySlug(slug)
  if (!found) notFound()
  const { form, org } = found
  const db = formDb(form.orgId)
  const state = claimFormState(form)
  const closed = claimWindowProblem(form)
  const session = await readSession(form)
  const linked = !session && !closed ? await linkedClaimant(form) : null
  const [employee, categories, claims] = session
    ? await Promise.all([
        db(Employee).findById(session.employeeId, { fullName: 1 }).lean(),
        db(ClaimCategory).find({ _id: { $in: form.categoryIds }, isActive: true }).sort({ displayOrder: 1, name: 1 }).lean(),
        db(Claim).find({ formId: form._id, employeeId: session.employeeId }).sort({ createdAt: -1 }).lean(),
      ])
    : [null, [], []]
  const badge = state === 'open' ? { tone: 'success' as const, label: 'Open' } : state === 'upcoming' ? { tone: 'info' as const, label: `Opens on ${formatDate(companyDay(form.opensAt))}` } : { tone: 'neutral' as const, label: 'Closed' }
  const today = todayIST()
  const capHint = form.maxClaimAmount ? `Up to ${formatINR(form.maxClaimAmount)} a claim on this form` : null

  return (
    <main className="relative min-h-dvh overflow-hidden bg-black px-4 py-10 sm:py-16">
      {/* Onboarding's backdrop: black with one slow-breathing plum glow, top right (DESIGN 3.5). */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute left-[75%] top-[4%] h-[1100px] w-[1100px] -translate-x-1/2 -translate-y-1/2 animate-[breathe_18s_var(--ease-in-out)_infinite] bg-[radial-gradient(closest-side,#7C5072_0%,rgba(124,80,114,0.55)_38%,rgba(116,76,106,0)_100%)]" />
        <div className="absolute -left-40 -top-40 h-[520px] w-[620px] bg-[radial-gradient(closest-side,rgba(28,14,64,0.7),rgba(7,4,16,0))]" />
      </div>
      <div className="relative mx-auto max-w-2xl space-y-4">
        <section className="glass-hero lit-edge-bright px-6 pb-7 pt-6 animate-scale-in sm:px-10 sm:pb-9 sm:pt-7">
          <Logo size={30} />
          <header className="mt-7 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13px] font-semibold uppercase tracking-[0.04em] text-white/70">{org.name}</p>
              <h1 className="mt-1.5 text-2xl font-semibold leading-tight text-white">{form.name}</h1>
            </div>
            <Badge tone={badge.tone} size="md">{badge.label}</Badge>
          </header>
          {form.description ? <p className="mt-3 max-w-[60ch] text-sm leading-relaxed text-white/80">{form.description}</p> : null}
          <p className="mt-3 flex items-center gap-2 text-[13px] text-white/70">
            <CalendarClock className="size-3.5 text-white/70" /> Deadline {formatDate(companyDay(form.closesAt))}
            {form.requiresReceipt ? ' · receipts required' : ''}
          </p>
          <div className="mt-6 space-y-5 border-t border-white/[0.14] pt-6">
            {closed ? <Callout tone={state === 'upcoming' ? 'info' : 'warning'} title={closed} /> : null}
            {!closed && !session ? (
              <>
                <SectionLabel icon={<ShieldCheck />}>Verify your work email</SectionLabel>
                <VerifyFlow slug={form.slugLower} linked={linked ? { name: linked.name, email: linked.email } : null} />
              </>
            ) : null}
            {!closed && session && employee ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <SectionLabel icon={<Receipt />}>File a claim as {employee.fullName}</SectionLabel>
                  <ClaimSignOut slug={form.slugLower} />
                </div>
                <ClaimSubmitForm slug={form.slugLower} categories={categories.map((c) => ({ value: String(c._id), label: c.maxAmount ? `${c.name} (up to ${formatINR(c.maxAmount, { decimals: 0 })})` : c.name }))} requiresReceipt={form.requiresReceipt} capHint={capHint} today={today} />
              </>
            ) : null}
          </div>
        </section>
        {session && claims.length ? (
          <section className="glass-hero lit-edge overflow-hidden animate-fade-in">
            <div className="px-6 pb-4 pt-5 sm:px-10">
              <SectionLabel icon={<Receipt />}>Your claims on this form</SectionLabel>
            </div>
            <div className="overflow-x-auto border-t border-white/[0.14]">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-white/[0.14]">
                    <th className="h-[33px] px-6 text-left text-sm font-normal text-white sm:pl-10">Date</th>
                    <th className="h-[33px] px-4 text-left text-sm font-normal text-white">Purpose</th>
                    <th className="h-[33px] px-4 text-right text-sm font-normal text-white">Claimed</th>
                    <th className="h-[33px] px-4 text-right text-sm font-normal text-white">Approved</th>
                    <th className="h-[33px] px-6 text-left text-sm font-normal text-white sm:pr-10">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {claims.map((c) => (
                    <tr key={String(c._id)} className="transition-colors duration-150 hover:bg-white/[0.04]">
                      <td className="whitespace-nowrap px-6 py-2.5 text-white/70 sm:pl-10">{formatDate(c.expenseDate)}</td>
                      <td className="px-4 py-2.5 text-white">{c.purpose}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-white">{formatINR(c.amountClaimed)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-white/70">{c.amountApproved == null ? '—' : formatINR(c.amountApproved)}</td>
                      <td className="px-6 py-2.5 sm:pr-10">
                        <Badge tone={CLAIM_STATUS_TONES[c.status as ClaimStatus]}>{CLAIM_STATUS_LABELS[c.status as ClaimStatus]}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
        <footer className="flex items-center justify-center gap-2 pt-4 text-xs text-white/60">
          <span>Claims by</span>
          <Logo size={14} variant="white" />
        </footer>
      </div>
    </main>
  )
}
