import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Lock, Plus, SquareCheckBig } from 'lucide-react'
import { breadcrumbFor } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import type { SearchParams } from '@/lib/list'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { Folder } from '@/models/work/Folder'
import { Space } from '@/models/work/Space'
import { parseTaskQuery } from '@/modules/work/tasks/filters'
import { savedViewOptions, taskData } from '@/modules/work/tasks/options'
import { getViewer } from '@/modules/work/tasks/viewer'
import { CreateTaskDialog } from '@/components/work/tasks/create-task-dialog'
import { NoticeToast } from '@/components/work/tasks/notice-toast'
import { TaskDataProvider } from '@/components/work/tasks/task-data'
import { TaskWorkspace } from '@/components/work/tasks/task-workspace'

export const metadata: Metadata = { title: 'Tasks' }

const BASE = '/app/work/tasks'

export default async function TasksPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const ctx = await requireMember({ product: 'work', perm: 'tasks.read' })
  const viewer = await getViewer(ctx)
  // Personal workspaces land on their private to-dos; team views stay one click away.
  if (ctx.org.mode === 'personal' && Object.keys(sp).length === 0) redirect(`${BASE}?view=board&personal=1`)
  const query = parseTaskQuery(sp)
  if (query.space && !(await ctx.db(Space).exists({ _id: query.space }))) redirect(`${BASE}?mine=1`)
  if (query.folder && !(await ctx.db(Folder).exists({ _id: query.folder, ...(query.space ? { spaceId: query.space } : {}) }))) redirect(`${BASE}?mine=1`)
  const [data, savedViews] = await Promise.all([taskData(ctx, viewer), savedViewOptions(ctx)])
  const projectId = query.project.length === 1 ? query.project[0] : undefined

  return (
    <>
      <NoticeToast param="denied" message="You don't have access to that task" />
      <PageHeader
        title={query.personal ? 'Personal tasks' : 'Tasks'}
        description={query.personal ? 'Private to-dos. Only you and the people you share them with see these.' : 'Everything on your plate and your team’s, as a list, board or calendar.'}
        icon={query.personal ? <Lock /> : <SquareCheckBig />}
        breadcrumb={breadcrumbFor(BASE)}
        actions={
          data.canWrite ? (
            <TaskDataProvider value={data}>
              <CreateTaskDialog
                defaults={{ personal: query.personal, projectId, spaceId: query.folder ? (query.space ?? undefined) : undefined, folderId: query.folder ?? undefined }}
                trigger={<Button variant="primary" icon={<Plus className="size-4" />}>{query.personal ? 'Personal task' : 'Task'}</Button>}
              />
            </TaskDataProvider>
          ) : null
        }
      />
      <TaskWorkspace ctx={ctx} viewer={viewer} data={data} query={query} basePath={BASE} pathname={BASE} sp={sp} savedViews={savedViews} quickLinks />
    </>
  )
}
