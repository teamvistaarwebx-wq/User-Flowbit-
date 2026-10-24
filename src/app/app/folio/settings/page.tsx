import type { Metadata } from 'next'
import Link from 'next/link'
import { Building2, FileSignature, Hash, Landmark, Pencil, Percent, Plus, QrCode, ScrollText, Settings, Tags, BellRing, Wallet } from 'lucide-react'
import { EinvoiceSettingsForm } from '@/components/folio/einvoice/EinvoiceSettingsForm'
import { EInvoiceSettings } from '@/models/folio/EInvoiceSettings'
import { breadcrumbFor } from '@/lib/catalog'
import type { Ctx } from '@/lib/ctx'
import { requireMember } from '@/lib/ctx'
import { todayIST } from '@/lib/dates'
import { first, type SearchParams } from '@/lib/list'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { EngineNote } from '@/components/automations/engine-note'
import { Callout } from '@/components/folio/SetupCallout'
import { Fact, LINK, SegmentLinks } from '@/components/folio/ui'
import { cn } from '@/lib/utils'
import { BankAccounts } from '@/components/folio/settings/BankAccounts'
import { EntityDialog, type CompanyFallback, type EntityValues } from '@/components/folio/settings/EntityDialog'
import { companyProfileOf, defaultSignatoryOf } from '@/lib/company-profile'
import { ExpenseCategories } from '@/components/folio/settings/ExpenseCategories'
import { SeriesForm, SignatoryForm, TermsForm } from '@/components/folio/settings/EntityForms'
import { ServiceItems } from '@/components/folio/settings/ServiceItems'
import { RemindersForm, TaxSettingsForm } from '@/components/folio/settings/WorkspaceForms'
import { FolioExpense } from '@/models/folio/Expense'
import { Invoice } from '@/models/folio/Invoice'
import { peekNumber } from '@/modules/folio/counter'
import { seriesLengthProblems } from '@/modules/folio/engine/series-rules'
import { gstCodeFromAny, gstCodeFromStateLetters, stateLabelOf } from '@/modules/folio/engine/states'
import { expenseCategories } from '@/modules/folio/expenses/queries'
import { getFolioSettings, listEntities, listServiceItems, taxRatesOf } from '@/modules/folio/settings/queries'
import { firmCapacity } from '@/modules/subscription/firms'

export const metadata: Metadata = { title: 'Folio settings' }

const BASE = '/app/folio/settings'
const TABS = [
  { key: 'entities', label: 'Firms', icon: Building2, group: 'Billing from' },
  { key: 'banks', label: 'Banks', icon: Landmark, group: 'Billing from' },
  { key: 'series', label: 'Series', icon: Hash, group: 'Billing from' },
  { key: 'signatory', label: 'Signatory', icon: FileSignature, group: 'Billing from' },
  { key: 'tax', label: 'Tax', icon: Percent, group: 'Documents' },
  { key: 'einvoice', label: 'E-invoice', icon: QrCode, group: 'Documents' },
  { key: 'terms', label: 'Terms', icon: ScrollText, group: 'Documents' },
  { key: 'services', label: 'Services', icon: Tags, group: 'Documents' },
  { key: 'reminders', label: 'Reminders', icon: BellRing, group: 'Money' },
  { key: 'expenses', label: 'Expenses', icon: Wallet, group: 'Money' },
] as const
const GROUPS = ['Billing from', 'Documents', 'Money'] as const
const tabHref = (key: string) => (key === 'entities' ? BASE : `${BASE}?tab=${key}`)

/**
 * Settings sections in the side panel's style (DESIGN 12): 12/600 uppercase group labels, 14/400 items at a
 * 26px pitch with 14px muted icons; the active item is white on the control surface. Below lg it becomes the
 * segmented control so it never squeezes the content.
 */
function SettingsNav({ active }: { active: string }) {
  return (
    <>
      <nav aria-label="Folio settings" className="hidden lg:block">
        {GROUPS.map((g) => (
          <div key={g} className="mb-[23px] last:mb-0">
            <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-[0.06em] text-white">{g}</p>
            <ul>
              {TABS.filter((t) => t.group === g).map((t) => {
                const on = t.key === active
                return (
                  <li key={t.key}>
                    <Link
                      href={tabHref(t.key)}
                      aria-current={on ? 'page' : undefined}
                      className={cn('flex h-[30px] items-center gap-2.5 rounded-full px-3 text-sm transition-colors duration-150 [&_svg]:size-3.5 [&_svg]:stroke-[1.5]', on ? 'bg-control-active text-white' : 'text-white/80 hover:bg-white/[0.05] hover:text-white')}
                    >
                      <t.icon className={on ? 'text-white' : 'text-icon-muted'} />
                      {t.label}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="lg:hidden">
        <SegmentLinks label="Folio settings" items={TABS.map((t) => ({ href: tabHref(t.key), label: t.label, active: t.key === active }))} />
      </div>
    </>
  )
}

type Entity = Awaited<ReturnType<typeof listEntities>>[number]

/** A new entity prefilled from the company profile (names, address, GSTIN, PAN, state); contact details stay blank and inherit. */
function fromOrg(ctx: Ctx): EntityValues {
  const org = ctx.org
  const profile = companyProfileOf(org)
  const stateCode = gstCodeFromAny(org.address?.state) ?? gstCodeFromStateLetters(org.state) ?? (profile.gstin ? profile.gstin.slice(0, 2) : '')
  return {
    code: org.name.replace(/[^a-z0-9]/gi, '').slice(0, 3).toUpperCase() || 'ENT',
    legalName: profile.legalName,
    tradeName: profile.tradeName ?? '',
    kind: profile.gstin ? 'gst' : 'non_gst',
    gstin: profile.gstin ?? '',
    pan: profile.pan ?? '',
    cinLlpin: profile.cinLlpin ?? '',
    address: { line1: org.address?.line1 ?? '', line2: org.address?.line2 ?? '', city: org.address?.city ?? '', stateCode, pincode: org.address?.pincode ?? '' },
    email: '',
    phone: '',
    website: '',
    hasLogo: false,
    isDefault: true,
    isActive: true,
  }
}

const entityValues = (e: Entity): EntityValues => ({
  id: String(e._id),
  code: e.code,
  legalName: e.legalName,
  tradeName: e.tradeName ?? '',
  kind: e.kind,
  gstin: e.gstin ?? '',
  pan: e.pan ?? '',
  cinLlpin: e.cinLlpin ?? '',
  address: { line1: e.address.line1, line2: e.address.line2 ?? '', city: e.address.city, stateCode: e.address.stateCode, pincode: e.address.pincode },
  email: e.email ?? '',
  phone: e.phone ?? '',
  website: e.website ?? '',
  hasLogo: Boolean(e.logoFileId),
  isDefault: e.isDefault,
  isActive: e.isActive,
})

function EntityTitle({ entity }: { entity: Entity }) {
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span>{entity.code} · {entity.tradeName || entity.legalName}</span>
      <Badge>{entity.kind === 'gst' ? 'GST' : 'Non-GST'}</Badge>
      {entity.isDefault ? <Badge tone="success">Default</Badge> : null}
      {!entity.isActive ? <Badge>Inactive</Badge> : null}
    </span>
  )
}

export default async function FolioSettingsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const ctx = await requireMember({ product: 'folio', perm: 'folio.settings' })
  const tab = TABS.find((t) => t.key === first(sp.tab))?.key ?? 'entities'
  const [entities, settings] = await Promise.all([listEntities(ctx), getFolioSettings(ctx)])
  const taxRates = taxRatesOf(settings)
  const profile = companyProfileOf(ctx.org)
  const company: CompanyFallback = { email: profile.email ?? '', phone: profile.phone ?? '', website: profile.website ?? '', hasLogo: Boolean(profile.logoFileId) }
  const signer = defaultSignatoryOf(profile)
  const noEntities = !entities.length && tab !== 'tax' && tab !== 'einvoice' && tab !== 'services' && tab !== 'reminders' && tab !== 'expenses'
  const addEntity = <EntityDialog trigger={<Button variant="primary" icon={<Plus className="size-4" />}>Add firm</Button>} values={fromOrg(ctx)} kindLocked={false} company={company} />

  const body = async () => {
    if (noEntities) {
      return <Card variant="solid"><EmptyState icon={<Building2 />} title="Add the business you bill from" description="A GST-registered business issues tax invoices; an unregistered one issues sale invoices with no tax." action={addEntity} /></Card>
    }
    if (tab === 'entities') {
      const [issuedIds, capacity] = await Promise.all([ctx.db(Invoice).distinct('entityId', { status: { $ne: 'draft' } }), firmCapacity(ctx)])
      const issued = new Set(issuedIds.map(String))
      const atLimit = Number.isFinite(capacity.limit) && capacity.left === 0
      return (
        <div className="grid gap-4 lg:grid-cols-2">
          {Number.isFinite(capacity.limit) ? (
            <Callout className="lg:col-span-2">
              {capacity.used} of {capacity.limit} firms on your plan are active.{atLimit ? ' Adding another is a monthly add-on' : ''}
              {atLimit ? (ctx.can('billing.manage') ? <>: <Link href="/app/settings/subscription" className={LINK}>change it in Subscription</Link>.</> : '; ask the workspace owner.') : null}
            </Callout>
          ) : null}
          {entities.map((e) => (
            <Card variant="solid" key={String(e._id)}>
              <CardHeader title={<EntityTitle entity={e} />} description={e.legalName} actions={<EntityDialog trigger={<Button size="sm" variant="secondary" icon={<Pencil className="size-4" />}>Edit</Button>} values={entityValues(e)} kindLocked={issued.has(String(e._id))} company={company} />} />
              <p className="text-[13px] leading-5 text-white/80">{[e.address.line1, e.address.line2, e.address.city, e.address.pincode].filter(Boolean).join(', ')}</p>
              <div className="mt-3 border-t border-white/[0.07] pt-2">
                <Fact label="State">{stateLabelOf(e.address.stateCode)}</Fact>
                {e.gstin ? <Fact label="GSTIN"><span className="tabular-nums">{e.gstin}</span></Fact> : null}
                {e.pan ? <Fact label="PAN"><span className="tabular-nums">{e.pan}</span></Fact> : null}
                <Fact label="Issues">{e.kind === 'gst' ? 'Tax invoices' : 'Sale invoices'} · {e.bankAccounts.length} bank account{e.bankAccounts.length === 1 ? '' : 's'}</Fact>
              </div>
            </Card>
          ))}
        </div>
      )
    }
    if (tab === 'banks') {
      return (
        <div className="space-y-4">
          {entities.map((e) => (
            <Card variant="solid" key={String(e._id)}>
              <CardHeader title={<EntityTitle entity={e} />} />
              <BankAccounts entityId={String(e._id)} entityCode={e.code} accounts={e.bankAccounts.map((b) => ({ id: String(b._id), label: b.label, accountName: b.accountName, accountNumber: b.accountNumber, ifsc: b.ifsc, bankName: b.bankName, branch: b.branch ?? '', upiId: b.upiId ?? '', isDefault: b.isDefault }))} />
            </Card>
          ))}
        </div>
      )
    }
    if (tab === 'series') {
      const today = todayIST()
      const peeks = await Promise.all(entities.map((e) => peekNumber(ctx.orgId, e, 'invoice', today)))
      return (
        <div className="space-y-4">
          <Callout>Each firm keeps its own series, restarting every financial year on 1 April. GST allows at most 16 characters in an invoice, credit note or receipt number, like VWX/26-27/0001. A voided invoice keeps its number — a statutory series may contain cancellations, but it may not contain gaps.</Callout>
          {entities.map((e, i) => (
            <Card variant="solid" key={String(e._id)}>
              <CardHeader title={<EntityTitle entity={e} />} description={`Next invoice: ${peeks[i]}`} />
              {seriesLengthProblems(e.series).length > 0 ? (
                <Callout tone="warning" title="Numbers too long for GST" className="mb-3">
                  {seriesLengthProblems(e.series).map((p) => p.message).join(' ')} Issued numbers stay as they are; Folio will not issue new ones until the series fits.
                </Callout>
              ) : null}
              <SeriesForm entityId={String(e._id)} series={{ invoicePrefix: e.series.invoicePrefix, creditNotePrefix: e.series.creditNotePrefix, receiptPrefix: e.series.receiptPrefix, quotePrefix: e.series.quotePrefix, proformaPrefix: e.series.proformaPrefix, padding: e.series.padding ?? 4, fyFormat: e.series.fyFormat === 'short' ? 'short' : 'long' }} />
            </Card>
          ))}
        </div>
      )
    }
    if (tab === 'tax') {
      return <Card variant="solid"><TaxSettingsForm taxRates={taxRates} roundOffTotal={settings.invoicing?.roundOffTotal !== false} showTdsOnInvoice={settings.invoicing?.showTdsOnInvoice !== false} defaultValidityDays={settings.invoicing?.defaultValidityDays ?? 15} /></Card>
    }
    if (tab === 'einvoice') {
      const gst = entities.filter((e) => e.kind === 'gst')
      const rows = await ctx.db(EInvoiceSettings).find({ entityId: { $in: gst.map((e) => e._id) } }).lean()
      const byEntity = new Map(rows.map((r) => [String(r.entityId), r]))
      return (
        <div className="space-y-4">
          <Callout>E-invoicing is mandatory once aggregate turnover passes ₹5 crore. Flowbit registers B2B tax invoices on the IRP through your GSP, stores the IRN and signed QR, prints them on the invoice and makes e-way bills from them. Try the sandbox first.</Callout>
          {gst.length === 0 ? <Card variant="solid"><EmptyState icon={<QrCode />} title="No GST firm" description="Only GST-registered firms issue e-invoices." /></Card> : null}
          {gst.map((e) => {
            const r = byEntity.get(String(e._id))
            return (
              <Card variant="solid" key={String(e._id)}>
                <CardHeader title={<EntityTitle entity={e} />} description={e.gstin ?? undefined} />
                <EinvoiceSettingsForm
                  entityId={String(e._id)}
                  values={{ enabled: Boolean(r?.enabled), turnoverAboveThreshold: Boolean(r?.turnoverAboveThreshold), environment: r?.environment === 'production' ? 'production' : 'sandbox', baseUrl: r?.baseUrl ?? '', clientId: r?.clientId ?? '', username: r?.username ?? '', secretHint: r?.clientSecretSealed ? 'saved' : '', passwordHint: r?.passwordSealed ? 'saved' : '' }}
                />
              </Card>
            )
          })}
        </div>
      )
    }
    if (tab === 'terms') {
      return (
        <div className="space-y-4">
          {entities.map((e) => (
            <Card variant="solid" key={String(e._id)}>
              <CardHeader title={<EntityTitle entity={e} />} />
              <TermsForm entityId={String(e._id)} taxRates={taxRates} values={{ paymentTermsDays: e.defaults?.paymentTermsDays ?? 15, gstRatePercent: e.defaults?.gstRatePercent ?? 18, terms: e.defaults?.terms ?? '', notes: e.defaults?.notes ?? '', isTax: e.kind === 'gst' }} />
            </Card>
          ))}
        </div>
      )
    }
    if (tab === 'signatory') {
      return (
        <div className="space-y-4">
          {entities.map((e) => (
            <Card variant="solid" key={String(e._id)}>
              <CardHeader title={<EntityTitle entity={e} />} description="Printed in the signature block of this firm’s documents. Leave it blank to use the Company profile’s default signatory." />
              <SignatoryForm entityId={String(e._id)} name={e.signatoryName ?? ''} title={e.signatoryTitle ?? ''} hasSignature={Boolean(e.signatureFileId)} company={signer ? { name: signer.name, designation: signer.designation } : null} />
            </Card>
          ))}
        </div>
      )
    }
    if (tab === 'services') {
      const items = await listServiceItems(ctx)
      return <ServiceItems taxRates={taxRates} items={items.map((s) => ({ id: String(s._id), code: s.code, name: s.name, description: s.description ?? '', hsnSac: s.hsnSac ?? '', unit: s.unit ?? 'nos', ratePaise: s.defaultRatePaise, gstRatePercent: s.defaultGstRatePercent, isActive: s.isActive }))} />
    }
    if (tab === 'expenses') {
      const [categories, counts] = await Promise.all([expenseCategories(ctx), ctx.db(FolioExpense).aggregate<{ _id: unknown; n: number }>([{ $group: { _id: '$categoryId', n: { $sum: 1 } } }])])
      const used = new Map(counts.map((c) => [String(c._id), c.n]))
      return (
        <div className="space-y-4">
          <Callout>Categories group what you spend on the Expenses list and in the profit and loss view.{ctx.can('expenses.read') ? <> <Link href="/app/folio/expenses" className={LINK}>Open expenses</Link></> : null}</Callout>
          <ExpenseCategories categories={categories.map((c) => ({ ...c, count: used.get(c.id) ?? 0 }))} />
        </div>
      )
    }
    return (
      <>
        <EngineNote current="reminders" viewer={ctx} />
        <Card variant="solid"><RemindersForm enabled={settings.reminders?.enabled !== false} offsetDays={settings.reminders?.offsetDays ?? [-3, 0, 7, 15, 30]} channels={settings.reminders?.channels ?? ['email']} autoRetainerDrafts={settings.reminders?.autoRetainerDrafts !== false} /></Card>
      </>
    )
  }

  return (
    <>
      <PageHeader title="Folio settings" icon={<Settings />} breadcrumb={breadcrumbFor(BASE)} description="The businesses you bill from, their series and banks, tax rates, terms and reminders." actions={tab === 'entities' && entities.length ? addEntity : null} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-7">
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <SettingsNav active={tab} />
        </aside>
        <div className="min-w-0">{await body()}</div>
      </div>
    </>
  )
}
