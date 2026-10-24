import type { Metadata } from 'next'
import { Archive, Fingerprint, Mic, Siren } from 'lucide-react'
import { breadcrumbFor } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { Card, CardHeader } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { PrivacySearch } from '@/components/settings/privacy'
import { KEPT_BY_LAW } from '@/modules/privacy/core'
import { RETENTION_DAYS } from '@/modules/privacy/retention'
import { MeetingRetentionForm } from '@/components/work/meetings/retention-form'
import { retentionDaysOf } from '@/modules/work/meetings/ai/retention'

export const metadata: Metadata = { title: 'Privacy' }

/**
 * DPDP for the workspace (notifications-v2 §0b.9): export or erase one
 * person's data on request, what Flowbit keeps and for how long, and what
 * happens in a breach. Owners and admins.
 */
export default async function PrivacyPage() {
  const ctx = await requireMember({ perm: 'org.manage', allowBlocked: false })
  return (
    <>
      <PageHeader title="Privacy" description="Answer a person's request to see or delete their data, and see what Flowbit keeps." breadcrumb={breadcrumbFor('/app/settings/privacy')} />
      <div className="grid grid-cols-12 gap-4">
        <Card className="col-span-12 rounded-[16px] lg:col-span-8">
          <CardHeader label="A person's data" icon={<Fingerprint strokeWidth={1.5} />} description="Find a client contact, lead or team member by email or phone. Export gives them a copy (JSON); erase removes them and their message trail. Both are written to the audit log without their name." />
          <PrivacySearch kept={KEPT_BY_LAW} />
          <p className="mt-4 text-xs text-fg-3">You can also do this from a contact&apos;s or lead&apos;s own page.</p>
        </Card>
        <div className="col-span-12 space-y-4 lg:col-span-4">
          <Card className="rounded-[16px]">
            <CardHeader label="How long logs are kept" icon={<Archive strokeWidth={1.5} />} />
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-fg-2">
              <li>Message and delivery logs, automation runs and WhatsApp chats: {Math.round(RETENTION_DAYS / 30)} months, then deleted.</li>
              <li>Your audit log stays while the workspace exists.</li>
              <li>Flowbit&apos;s GST invoices to you: 6 years, as the law requires.</li>
            </ul>
          </Card>
          {ctx.hasFeature('meetings_ai') ? (
            <Card className="rounded-[16px]">
              <CardHeader label="Meeting recordings" icon={<Mic strokeWidth={1.5} />} description="Recordings and transcripts from Meetings AI are deleted this many days after the meeting. The minutes in the notes stay." />
              <MeetingRetentionForm days={retentionDaysOf(ctx.org)} />
            </Card>
          ) : null}
          <Card className="rounded-[16px]">
            <CardHeader label="If there is a breach" icon={<Siren strokeWidth={1.5} />} />
            <p className="text-sm text-fg-2">Flowbit emails the workspace owner as soon as a breach that touches your data is confirmed, with what happened and what to do, so you can tell the Data Protection Board and the people affected within 72 hours.</p>
          </Card>
        </div>
      </div>
    </>
  )
}
