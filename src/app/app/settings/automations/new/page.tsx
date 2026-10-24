import type { Metadata } from 'next'
import { Zap } from 'lucide-react'
import { requireMember } from '@/lib/ctx'
import { PageHeader } from '@/components/ui/page-header'
import { AutomationBuilder } from '@/components/automations/automation-builder'

export const metadata: Metadata = { title: 'New automation' }

/** Settings → Automations → New: a rule of the workspace's own, from the trigger catalog. */
export default async function NewAutomationPage() {
  await requireMember({ perm: 'org.manage' })
  return (
    <>
      <PageHeader title="New automation" icon={<Zap />} back={{ href: '/app/settings/automations', label: 'Automations' }} description="When something happens, or before or after a date, or on a schedule: message a client, lead or employee, alert people, or add a follow-up." />
      <div className="max-w-3xl">
        <AutomationBuilder />
      </div>
    </>
  )
}
