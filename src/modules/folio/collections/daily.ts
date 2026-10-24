import 'server-only'
import { eachOrg } from '@/lib/cron'
import { formatMonth, monthOf } from '@/lib/dates'
import { notifyPermission } from '@/lib/notify'
import type { SystemDb } from '@/lib/platform'
import { canWrite } from '@/lib/entitlements'
import { emitRecurringGenerated } from '@/modules/automations/folio-events'
import { generateRetainerInvoices } from '@/modules/folio/recurring/generate'
import { getFolioSettings } from '@/modules/folio/settings/queries'
import { runReminders, type RunResult } from './run'
import { ownerMemberId } from './system'

export type FolioDailyResult = { reminders: RunResult; retainerDrafts: number }

/**
 * Folio's daily run for every workspace with Folio on: automatic reminders
 * (idempotent per invoice, channel and offset) and due retainer drafts
 * (stateless: a period already drafted is never drafted again).
 */
export async function runFolioDaily(db: SystemDb, asOf: string) {
  const orgs = await eachOrg(db, 'folio', (org) => canWrite(org, 'folio'), async (org): Promise<FolioDailyResult> => {
    const scope = { orgId: org._id, db: db.forOrg(org._id).db, orgName: org.name }
    const reminders = await runReminders(scope, asOf)
    const settings = await getFolioSettings(scope)
    const retainerDrafts = settings.reminders?.autoRetainerDrafts === false ? 0 : (await generateRetainerInvoices({ ...scope, memberId: (await ownerMemberId(db, org._id)) ?? undefined }, asOf, { autoOnly: true })).created.length
    if (retainerDrafts > 0) {
      await notifyPermission({ orgId: org._id }, 'invoices.issue', {
        title: `${retainerDrafts} retainer ${retainerDrafts === 1 ? 'draft' : 'drafts'} created for ${formatMonth(monthOf(asOf))}`,
        body: 'Review them before issuing.',
        href: '/app/folio/invoices?status=draft',
        kind: 'info',
        product: 'folio',
        event: 'folio.retainer_drafts',
        dedupeKey: `folio-retainer-drafts:${asOf}`,
      })
      await emitRecurringGenerated(org._id, { count: retainerDrafts, month: formatMonth(monthOf(asOf)), asOf, orgName: org.name })
    }
    return { reminders, retainerDrafts }
  })
  return { orgs }
}
