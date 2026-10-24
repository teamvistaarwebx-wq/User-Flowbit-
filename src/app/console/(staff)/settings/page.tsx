import type { Metadata } from 'next'
import { requireStaff } from '@/lib/console/session'
import { PLAN_PRICES } from '@/lib/plans'
import { PageHeader } from '@/components/ui/page-header'
import { ConsoleSettingsForm } from '@/components/console/settings-form'
import { consoleSettings } from '@/modules/console/settings-query'
import { serverEnv } from '@/lib/env'
import { envSwitchOn } from '@/lib/feature-flags'

export const metadata: Metadata = { title: 'Settings' }

export default async function ConsoleSettingsPage() {
  await requireStaff('settings.edit')
  const values = await consoleSettings()
  const priceLabels = Object.fromEntries(Object.values(PLAN_PRICES).map((p) => [p.key, `${p.label} (per ${p.unit})`]))
  return (
    <>
      <PageHeader title="Settings" description="Prices, limits, templates and help links, without a code change." />
      <ConsoleSettingsForm values={values} priceLabels={priceLabels} whatsAppEnvOn={envSwitchOn(serverEnv().FEATURE_WHATSAPP)} />
    </>
  )
}
