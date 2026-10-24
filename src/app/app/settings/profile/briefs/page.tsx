import type { Metadata } from 'next'
import { Sparkles } from 'lucide-react'
import { breadcrumbFor } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { formatDateTime } from '@/lib/dates'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { BriefEditor, NewBriefButton, type BriefForm, type SectionOption } from '@/components/settings/brief-editor'
import { Brief } from '@/models/messaging/Brief'
import { Project } from '@/models/work/Project'
import { AREA_LABEL, BRIEF_SECTIONS, sectionAllowed } from '@/modules/briefs/catalog'
import { scheduleOf } from '@/modules/briefs/job'
import { nextRunAt } from '@/modules/briefs/schedule'

export const metadata: Metadata = { title: 'Briefs' }

const MAX_PROJECTS = 30

/** When an enabled brief next goes out. */
const upcoming = (b: Parameters<typeof scheduleOf>[0]) => nextRunAt(scheduleOf(b), new Date())

/** Profile → Briefs (notifications-v2 §4): each person's own morning brief and end-of-day wrap. */
export default async function BriefsPage() {
  const ctx = await requireMember()
  const [briefs, projects] = await Promise.all([
    ctx.db(Brief).find({ userId: ctx.userId }).sort({ createdAt: 1 }).lean(),
    ctx.has('work') && ctx.can('projects.read') ? ctx.db(Project).find({ archivedAt: null, status: 'active' }, { name: 1 }).sort({ updatedAt: -1 }).limit(MAX_PROJECTS).lean() : [],
  ])
  const sections: SectionOption[] = BRIEF_SECTIONS.filter((s) => sectionAllowed(s, ctx)).map((s) => ({ key: s.key, label: s.label, area: AREA_LABEL[s.area] }))
  const forms: BriefForm[] = briefs.map((b) => {
    const next = b.enabled ? upcoming(b) : null
    return {
      id: String(b._id),
      name: b.name,
      enabled: b.enabled !== false,
      time: b.time ?? '08:30',
      frequency: (b.frequency as BriefForm['frequency']) ?? 'daily',
      days: [...(b.days ?? [])],
      weekday: b.weekday ?? 1,
      channels: { inapp: b.channels?.inapp !== false, email: b.channels?.email !== false },
      sections: [...(b.sections ?? [])],
      priorities: (b.filters?.priorities ?? []).filter((p): p is BriefForm['priorities'][number] => ['urgent', 'high', 'medium', 'low'].includes(p)),
      projectIds: (b.filters?.projectIds ?? []).map(String),
      scope: (b.filters?.scope as BriefForm['scope']) ?? 'assigned',
      skipIfEmpty: b.skipIfEmpty !== false,
      nextRun: next ? formatDateTime(next) : null,
      lastSent: b.lastSentAt ? formatDateTime(b.lastSentAt) : null,
    }
  })
  return (
    <>
      <PageHeader
        title="Briefs"
        help="alerts-digests-briefs"
        description="A brief is a summary at a time you choose, not one message per event: pick the time, the days, where it arrives and what it covers. Times are IST."
        breadcrumb={breadcrumbFor('/app/settings/profile/briefs')}
        actions={forms.length && forms.length < 5 ? <NewBriefButton label="Add a brief" /> : undefined}
      />
      {forms.length ? (
        <div className="space-y-4">
          {forms.map((form) => (
            <BriefEditor key={form.id} brief={form} sections={sections} projects={projects.map((p) => ({ value: String(p._id), label: p.name }))} />
          ))}
        </div>
      ) : (
        <section className="card-table">
          <EmptyState icon={<Sparkles />} title="No brief yet" description="Start with the one that fits your role. You can change every part of it." action={<NewBriefButton label="Create my morning brief" />} />
        </section>
      )}
    </>
  )
}
