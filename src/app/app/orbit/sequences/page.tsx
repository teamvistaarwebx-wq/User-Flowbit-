import type { Metadata } from 'next'
import Link from 'next/link'
import { Plus, Repeat2 } from 'lucide-react'
import { breadcrumbFor } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { EngineNote } from '@/components/automations/engine-note'
import { listSequences } from '@/modules/orbit/sequences/queries'

export const metadata: Metadata = { title: 'Sequences' }

/** Orbit → Sequences: follow-up sequences and how their leads are doing. */
export default async function SequencesPage() {
  const ctx = await requireMember({ product: 'orbit', perm: 'orbit.read' })
  const rows = await listSequences(ctx)
  const newButton = ctx.can('leads.write') ? <Button variant="primary" href="/app/orbit/sequences/new" icon={<Plus className="size-4" />}>New sequence</Button> : null
  return (
    <>
      <PageHeader
        title="Sequences"
        help="automation-engines"
        description="Up to five follow-up steps (email, call task, reminder, wait) sent in IST, Monday to Saturday. Select leads and choose Enroll in sequence."
        breadcrumb={breadcrumbFor('/app/orbit/sequences')}
        icon={<Repeat2 />}
        actions={newButton}
      />
      <EngineNote current="sequences" viewer={ctx} />
      {rows.length === 0 ? (
        <div className="card-solid">
          <EmptyState icon={<Repeat2 />} title="No sequences yet" description="Write the follow-ups once; Flowbit sends them on time and stops when the lead replies." action={newButton} />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((s) => (
            <Link key={s.id} href={`/app/orbit/sequences/${s.id}`} className="card-solid lift block space-y-3 rounded-[10px] p-4">
              <div>
                <p className="truncate text-sm font-semibold text-white">{s.name}</p>
                <p className="text-xs text-fg-3">{s.steps} {s.steps === 1 ? 'step' : 'steps'} · by {s.createdBy}</p>
              </div>
              <dl className="grid grid-cols-3 gap-2 text-center">
                {[['Running', s.active], ['Replied', s.replied], ['Finished', s.completed]].map(([label, n]) => (
                  <div key={label as string} className="rounded-[8px] bg-white/[0.04] py-2">
                    <dd className="text-lg font-semibold tabular-nums text-white">{n}</dd>
                    <dt className="text-[11px] text-fg-3">{label}</dt>
                  </div>
                ))}
              </dl>
            </Link>
          ))}
        </div>
      )}
    </>
  )
}
