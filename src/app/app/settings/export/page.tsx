import type { Metadata } from 'next'
import { Archive } from 'lucide-react'
import { breadcrumbFor } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { formatDate } from '@/lib/dates'
import { Card, CardHeader } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { Notice } from '@/components/settings/surface'
import { ExportLink } from '@/components/subscription/lifecycle-buttons'
import { Member } from '@/models/Member'
import { User } from '@/models/User'

export const metadata: Metadata = { title: 'Export' }

const CONTENTS = [
  'workspace.json: workspace details and plan',
  'json/: every record of every module (Work, Muster, Orbit, Folio, members, clients, audit log, messages), full detail',
  'csv/: the same records as spreadsheets, one file per kind of record',
  'files/: documents, receipts and PDFs stored in the workspace (up to 500 MB)',
]

/** The full workspace export (console spec 4.3). Open in every state, blocked included; the owner downloads it. */
export default async function ExportPage() {
  const ctx = await requireMember({ allowBlocked: true })
  const lc = ctx.entitlements.lifecycle
  const owner = ctx.isOwner ? null : await ctx.db(Member).findOne({ role: 'owner', status: 'active' }, { userId: 1 }).lean()
  const ownerUser = owner ? await User.findById(owner.userId, { name: 1 }).lean() : null
  return (
    <>
      <PageHeader title="Export" description="Download everything in this workspace as one ZIP file." breadcrumb={breadcrumbFor('/app/settings/export')} />
      <div className="grid grid-cols-12 gap-4">
        {lc.deleteAt ? (
          <Notice tone={lc.stage === 'blocked' ? 'danger' : 'warning'} className="col-span-12">
            Unless a plan is chosen, this workspace&apos;s data is deleted on {formatDate(lc.deleteAt)}. Export works until then.
          </Notice>
        ) : null}
        <Card className="col-span-12 rounded-[16px] lg:col-span-8">
          <CardHeader label="Full export" icon={<Archive strokeWidth={1.5} />} description="JSON and CSV for every module, plus stored files. No watermark; works even when the workspace is read-only or locked." actions={ctx.isOwner ? <ExportLink size="md" /> : null} />
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-fg-2">
            {CONTENTS.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {ctx.isOwner ? (
            <p className="mt-4 text-[13px] text-[#959596]">Large workspaces can take a minute. Sign-in codes and password hashes are never included.</p>
          ) : (
            <p className="mt-4 text-sm text-fg-2">Only the workspace owner{ownerUser?.name ? ` (${ownerUser.name})` : ''} can download the full export. Module lists (people, attendance, leads, clients, reports) have their own CSV buttons.</p>
          )}
        </Card>
      </div>
    </>
  )
}
