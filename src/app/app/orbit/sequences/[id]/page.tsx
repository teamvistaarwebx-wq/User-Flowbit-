import type { Metadata } from 'next'
import Link from 'next/link'
import { isValidObjectId } from 'mongoose'
import { notFound } from 'next/navigation'
import { Repeat2 } from 'lucide-react'
import { breadcrumbFor } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { formatDate } from '@/lib/dates'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { ArchiveSequenceButton } from '@/components/orbit/sequence-archive'
import { SequenceBuilder } from '@/components/orbit/sequence-builder'
import { sequenceEnrollments, sequenceForEdit } from '@/modules/orbit/sequences/queries'

export const metadata: Metadata = { title: 'Sequence' }

const TONE = { active: 'info', completed: 'success', exited: 'neutral' } as const

export default async function SequencePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requireMember({ product: 'orbit', perm: 'orbit.read' })
  if (!isValidObjectId(id)) notFound()
  const seq = await sequenceForEdit(ctx, id)
  if (!seq) notFound()
  const enrollments = await sequenceEnrollments(ctx, id, seq.steps)
  const canEdit = seq.canEdit && ctx.can('leads.write')
  return (
    <>
      <PageHeader title={seq.name} description="Edits apply to the next steps of leads already in it." breadcrumb={breadcrumbFor(`/app/orbit/sequences/${id}`, ctx)} icon={<Repeat2 />} actions={canEdit ? <ArchiveSequenceButton id={id} /> : null} />
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-7">
          <SequenceBuilder initial={seq} readOnly={!canEdit} />
        </div>
        <div className="col-span-12 lg:col-span-5">
          <Card variant="solid">
            <CardHeader label={`Leads (${enrollments.length})`} description="Select leads in Orbit → Leads and choose Enroll in sequence." />
            {enrollments.length ? (
              <ul className="divide-y divide-line-soft">
                {enrollments.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <Link href={`/app/orbit/leads/${e.leadId}`} className="block truncate text-sm text-white hover:text-blush">{e.company}</Link>
                      <p className="truncate text-xs text-fg-3">{e.progress} · {e.sender}{e.lastAt ? ` · ${formatDate(e.lastAt, { short: true })}` : ''}</p>
                    </div>
                    <Badge tone={TONE[e.status as keyof typeof TONE] ?? 'neutral'}>{e.outcome === 'replied' ? 'Replied' : e.status === 'active' ? 'Running' : e.status === 'completed' ? 'Done' : 'Stopped'}</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-fg-3">No leads yet.</p>
            )}
          </Card>
        </div>
      </div>
    </>
  )
}
