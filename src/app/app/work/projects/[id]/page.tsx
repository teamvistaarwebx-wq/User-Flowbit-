import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'
import { Activity, ChevronLeft } from 'lucide-react'
import { requireMember } from '@/lib/ctx'
import { formatDate } from '@/lib/dates'
import { first, type SearchParams } from '@/lib/list'
import { Avatar, AvatarStack } from '@/components/ui/avatar'
import { Badge, StatusPill } from '@/components/ui/badge'
import { Card, CardHeader } from '@/components/ui/card'
import { Pagination } from '@/components/ui/pagination'
import { LinkTabs } from '@/components/ui/tabs'
import { Timeline, type TimelineItem } from '@/components/ui/timeline'
import { PROJECT_STATUS_LABEL, type ProjectStatus } from '@/modules/work/projects/constants'
import { ACTIVITY_PAGE_SIZE, projectActivity, projectFiles, projectMilestones, projectWorkload } from '@/modules/work/projects/detail'
import { accessibleProject, projectSummary } from '@/modules/work/projects/queries'
import { activityActor, describeActivity } from '@/modules/work/tasks/activity'
import { parseTaskQuery } from '@/modules/work/tasks/filters'
import { clientOptions, taskData } from '@/modules/work/tasks/options'
import { peopleIndex } from '@/modules/work/tasks/people'
import { getViewer } from '@/modules/work/tasks/viewer'
import { FilesPanel } from '@/components/work/projects/files-panel'
import { MilestonesPanel } from '@/components/work/projects/milestones-panel'
import { OverviewTab } from '@/components/work/projects/overview-tab'
import { HealthPill, ProjectTile } from '@/components/work/projects/project-card'
import { ProjectMenu } from '@/components/work/projects/project-menu'
import { SettingsTab } from '@/components/work/projects/settings-tab'
import { TaskWorkspace } from '@/components/work/tasks/task-workspace'
import { fileUrl } from '@/lib/files'
import { ProjectPortalCard } from '@/components/portal/share-switches'

export const metadata: Metadata = { title: 'Project' }

const TABS = ['overview', 'tasks', 'milestones', 'files', 'activity', 'settings'] as const

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams])
  const ctx = await requireMember({ product: 'work', perm: 'projects.read' })
  const project = await accessibleProject(ctx, id)
  if (!project) notFound()
  const viewer = await getViewer(ctx)
  const [summary, data] = await Promise.all([projectSummary(ctx, project), taskData(ctx, viewer)])
  const people = peopleIndex(data.people)
  const tabParam = first(sp.tab)
  const tab = (TABS as readonly string[]).includes(tabParam ?? '') ? (tabParam as (typeof TABS)[number]) : 'overview'
  const base = `/app/work/projects/${id}`
  const canEdit = summary.canEdit
  const canDelete = ctx.can('org.manage')
  const me = String(ctx.memberId)

  let body: ReactNode
  if (tab === 'tasks') {
    const query = { ...parseTaskQuery(sp), project: [id], personal: false }
    body = <TaskWorkspace ctx={ctx} viewer={viewer} data={data} query={query} basePath={`${base}?tab=tasks`} pathname={base} sp={sp} locked={['project', 'personal']} createButton />
  } else if (tab === 'milestones') {
    body = <Card variant="solid"><MilestonesPanel projectId={id} milestones={await projectMilestones(ctx, project._id)} canEdit={canEdit} /></Card>
  } else if (tab === 'files') {
    const { uploads, taskFiles } = await projectFiles(ctx, project)
    body = <Card variant="solid"><FilesPanel projectId={id} uploads={uploads} taskFiles={taskFiles} people={data.people} me={me} canManage={ctx.can('projects.write')} /></Card>
  } else if (tab === 'activity') {
    const page = Math.max(1, Number.parseInt(first(sp.page) ?? '1', 10) || 1)
    const { rows, total, tasks } = await projectActivity(ctx, project._id, page)
    body = (
      <Card variant="table" className="px-[23px] pt-[17px]">
        <CardHeader label="Activity" icon={<Activity />} description="Project changes and task events in this project." />
        <Timeline
          empty="No activity yet."
          items={rows.map((r): TimelineItem => {
            const task = r.taskId ? tasks.get(String(r.taskId)) : undefined
            return {
              id: String(r._id),
              // Who did it, as Home's avatars (DESIGN 12: activity is avatar + text), not a generic marker.
              icon: <Avatar size="xs" name={people.name(r.actorId)} src={people.get(r.actorId)?.avatarUrl} />,
              title: <><span className="font-medium">{activityActor({ ...r, actorId: String(r.actorId) }, people.name)}</span> <span className="text-fg-2">{describeActivity(r, people.name).replace('this task', task ? `"${task.title}"` : 'a task')}</span></>,
              meta: task && r.taskId ? <Link href={`/app/work/tasks/${r.taskId}`} className="tabular-nums transition-colors hover:text-white">{task.key}</Link> : undefined,
              at: r.createdAt,
            }
          })}
        />
        <Pagination page={page} pageSize={ACTIVITY_PAGE_SIZE} total={total} basePath={base} params={sp} />
      </Card>
    )
  } else if (tab === 'settings') {
    body = canEdit ? (
      <>
      <SettingsTab
        logoUrl={project.logoFileId ? fileUrl(project.logoFileId) : null}
        project={{ id, name: project.name, code: project.code, clientId: project.clientId ? String(project.clientId) : null, description: project.description ?? null, status: project.status, color: project.color ?? '#818CF8', startDate: project.startDate ?? null, endDate: project.endDate ?? null, leadId: String(project.leadId), memberIds: summary.memberIds, tags: project.tags ?? [] }}
        people={data.people}
        clients={await clientOptions(ctx)}
        me={me}
        canCreateClient={ctx.can('clients.write')}
        archived={summary.archived}
        canDelete={canDelete}
      />
      {ctx.hasFeature('portal') && project.clientId ? <ProjectPortalCard projectId={id} shared={Boolean(project.portalShared)} clientName={summary.clientName ?? 'the client'} /> : null}
      </>
    ) : (
      <Card variant="solid"><p className="text-[13px] text-fg-2">Only the project lead or a project manager can change settings.</p></Card>
    )
  } else {
    const [milestones, workload] = await Promise.all([projectMilestones(ctx, project._id), projectWorkload(ctx, project._id)])
    body = <OverviewTab project={summary} description={project.description ?? null} milestones={milestones} people={data.people} workload={workload} canEdit={canEdit} />
  }

  return (
    <>
      <header className="mb-6 animate-slide-up space-y-4">
        <Link href="/app/work/projects" className="inline-flex items-center gap-1 text-[13px] text-fg-2 transition-colors hover:text-white"><ChevronLeft className="size-3.5" /> Projects</Link>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <ProjectTile name={project.name} color={summary.color} logoUrl={summary.logoUrl} size="lg" />
            <div className="min-w-0 space-y-1">
              <h1 className="truncate text-xl font-medium leading-7 text-white">{project.name}</h1>
              <div className="flex flex-wrap items-center gap-2 text-[13px] text-[#979797]">
                <span className="font-medium tabular-nums">{project.code}</span>
                {summary.clientId ? <Link href={`/app/clients/${summary.clientId}`} className="text-white/80 transition-colors hover:text-white">{summary.clientName}</Link> : <span>Internal</span>}
                <StatusPill status={project.status} label={PROJECT_STATUS_LABEL[project.status as ProjectStatus]} />
                <HealthPill health={summary.health} />
                {summary.archived ? <Badge tone="warning">Archived</Badge> : null}
                {project.endDate ? <span>Due {formatDate(project.endDate)}</span> : null}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-2 whitespace-nowrap text-[13px] text-fg-2">
              <AvatarStack size="sm" max={4} people={people.many([String(project.leadId)]).map((p) => ({ name: p.name, src: p.avatarUrl }))} /> Lead: {people.name(project.leadId)}
            </span>
            {canEdit ? <ProjectMenu id={id} name={project.name} archived={summary.archived} canDelete={canDelete} variant="buttons" /> : null}
          </div>
        </div>
        <LinkTabs
          tabs={[
            { href: base, label: 'Overview' },
            { href: `${base}?tab=tasks`, label: 'Tasks', count: summary.counts.total },
            { href: `${base}?tab=milestones`, label: 'Milestones' },
            { href: `${base}?tab=files`, label: 'Files', count: (project.files ?? []).length },
            { href: `${base}?tab=activity`, label: 'Activity' },
            ...(canEdit ? [{ href: `${base}?tab=settings`, label: 'Settings' }] : []),
          ]}
        />
      </header>
      {body}
    </>
  )
}
