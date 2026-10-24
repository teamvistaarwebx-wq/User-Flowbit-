import { isValidObjectId } from 'mongoose'
import { ReceiptIndianRupee } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader } from '@/components/ui/card'
import { getCtx } from '@/lib/ctx'
import { formatDate } from '@/lib/dates'
import { formatINR } from '@/lib/money'
import { cn } from '@/lib/utils'
import { Client } from '@/models/Client'
import { FolioEntity } from '@/models/folio/Entity'
import { activeEntities, defaultEntityId, loadProfile } from '@/modules/folio/context'
import { openingHasPayments } from '@/modules/folio/billing-profile/opening'
import { stateLabelOf } from '@/modules/folio/engine/states'
import { rupeesInput } from '@/modules/folio/engine/money'
import { DEFAULT_TERMS_DAYS } from '@/modules/folio/types'
import { BillingProfileDialog, type ProfileFormValues } from './BillingProfileForm'
import { Fact } from './ui'

/**
 * A client's billing terms: a summary card with an edit dialog. Embedded by
 * Orbit on /app/clients/[id] and opened from the Folio ledger. Renders
 * nothing without Folio access.
 */
export async function BillingProfileCard({ clientId, compact = false }: { clientId: string; compact?: boolean }) {
  const ctx = await getCtx()
  if (!ctx || !ctx.has('folio') || !ctx.can('folio.read') || !isValidObjectId(clientId)) return null
  const client = await ctx.db(Client).findById(clientId, { name: 1, contacts: 1, email: 1 }).lean()
  if (!client) return null
  const [profile, entities, fallbackEntity, hasPayments] = await Promise.all([loadProfile(ctx, client._id), activeEntities(ctx), defaultEntityId(ctx, null), openingHasPayments(ctx, client._id)])
  const entity = profile?.defaultEntityId ? await ctx.db(FolioEntity).findById(profile.defaultEntityId, { code: 1, tradeName: 1, legalName: 1 }).lean() : entities.find((e) => String(e._id) === String(fallbackEntity))
  const entityName = entity ? `${entity.code} · ${entity.tradeName || entity.legalName}` : 'No firm yet'
  const canEdit = ctx.can('invoices.write')
  const values: ProfileFormValues = {
    clientId: String(client._id),
    defaultEntityId: profile?.defaultEntityId ? String(profile.defaultEntityId) : '',
    paymentTermsDays: profile?.paymentTermsDays != null ? String(profile.paymentTermsDays) : '',
    placeOfSupplyStateCode: profile?.placeOfSupplyStateCode ?? '',
    isExportClient: Boolean(profile?.isExportClient),
    defaultGstRatePercent: profile?.defaultGstRatePercent != null ? String(profile.defaultGstRatePercent) : '',
    creditLimit: rupeesInput(profile?.creditLimitPaise),
    tdsApplicable: Boolean(profile?.tds?.applicable),
    tdsSection: profile?.tds?.section ?? '194J',
    tdsPercent: profile?.tds?.percent ? String(profile.tds.percent) : '10',
    remindersPaused: Boolean(profile?.remindersPaused),
    recipients: (profile?.recipients ?? []).map((r) => ({ id: String(r._id), name: r.name, email: r.email ?? '', phone: r.phone ?? '', whatsapp: r.whatsapp ?? '', receivesInvoices: r.receivesInvoices, receivesReminders: r.receivesReminders, isPrimary: Boolean(r.isPrimary) })),
    openingBalance: rupeesInput(profile?.openingBalancePaise),
    openingBalanceOn: profile?.openingBalanceOn ?? '',
    notes: profile?.notes ?? '',
  }
  const tds = profile?.tds?.applicable ? `${profile.tds.percent}% · ${profile.tds.section ?? '194J'}` : 'No TDS'
  return (
    <Card id="billing-details" variant="solid" className={cn('scroll-mt-24', compact ? 'p-4' : '@container')}>
      <CardHeader
        label="Billing details"
        icon={<ReceiptIndianRupee />}
        description={profile ? undefined : `No billing settings yet. Defaults apply: ${entityName}, ${DEFAULT_TERMS_DAYS} days, no TDS.`}
        actions={canEdit ? <BillingProfileDialog values={values} hasProfile={Boolean(profile)} entities={entities.map((e) => ({ value: String(e._id), label: `${e.code} · ${e.tradeName || e.legalName}` }))} canOpening={ctx.can('invoices.issue')} openingLocked={hasPayments} /> : null}
      />
      {profile ? (
        <>
          {/* Two columns only when the card itself is wide: it also sits in the narrow client sidebar. */}
          <div className={compact ? undefined : 'grid gap-x-10 @xl:grid-cols-2'}>
            <Fact label="Bills from">{entityName}</Fact>
            <Fact label="Payment terms">{profile.paymentTermsDays != null ? `${profile.paymentTermsDays} days` : 'Firm default'}</Fact>
            <Fact label="TDS">{tds}</Fact>
            <Fact label="Credit limit">{profile.creditLimitPaise != null ? formatINR(profile.creditLimitPaise, { decimals: 0 }) : 'No limit'}</Fact>
            <Fact label="Place of supply">{profile.placeOfSupplyStateCode ? stateLabelOf(profile.placeOfSupplyStateCode) : 'Same as billing state'}</Fact>
            <Fact label="Opening balance">{profile.openingBalancePaise ? `${formatINR(profile.openingBalancePaise)} as on ${formatDate(profile.openingBalanceOn)}` : null}</Fact>
            <Fact label="Invoices go to">{profile.recipients.filter((r) => r.receivesInvoices).map((r) => r.name).join(', ') || 'Client primary contact'}</Fact>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 empty:hidden">
            {profile.isExportClient ? <Badge>Export client</Badge> : null}
            {profile.remindersPaused ? <Badge tone="warning">Reminders paused</Badge> : null}
          </div>
        </>
      ) : null}
    </Card>
  )
}

export default BillingProfileCard
