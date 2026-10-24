import type { Metadata } from 'next'
import Link from 'next/link'
import { ClipboardCheck } from 'lucide-react'
import { HANDOVER_LABEL } from '@/lib/console/handover'
import { requireStaff } from '@/lib/console/session'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { TableCard } from '@/components/settings/surface'
import { listAccounts } from '@/modules/console/accounts-query'

export const metadata: Metadata = { title: 'Setup' }

/** Accounts in setup (console spec 7.2 "Setup"): handover progress; the import tool is on each account. */
export default async function ConsoleSetupListPage() {
  const p = await requireStaff('accounts.view')
  const rows = (await listAccounts(p, {})).filter((r) => r.setup.started && !r.setup.complete && r.state !== 'deleted')
  return (
    <>
      <PageHeader title="Setup" description="Accounts with a handover running. Free setup by our team is for yearly customers, at most 5 a week." />
      <TableCard icon={<ClipboardCheck strokeWidth={1.5} />} label="In setup" description={`${rows.length} ${rows.length === 1 ? 'account' : 'accounts'}`}>
        {rows.length ? (
          <ul className="border-t border-line py-1.5">
            {rows.map((r) => (
              <li key={r.id}>
                <Link href={`/console/accounts/${r.id}`} className="flex items-center justify-between gap-3 px-[23px] py-2.5 text-sm transition-colors hover:bg-white/[0.04]">
                  <span className="min-w-0"><span className="block truncate text-white">{r.name}</span><span className="block truncate text-xs text-[#979797]">{r.salesperson?.name ?? 'Unassigned'} · next: {r.setup.next ? HANDOVER_LABEL[r.setup.next] : '—'}</span></span>
                  <span className="shrink-0 tabular-nums text-[#979797]">{r.setup.done} / {r.setup.total}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="border-t border-line"><EmptyState compact icon={<ClipboardCheck />} title="No account is in setup" description="Start one from an account's Handover panel." /></div>
        )}
      </TableCard>
    </>
  )
}
