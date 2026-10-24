import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { TaskDataProvider } from '@/components/work/tasks/task-data'
import { loadTaskView } from '@/components/work/tasks/detail/load-task-view'
import { TaskActionsBar } from '@/components/work/tasks/detail/task-actions-bar'
import { ActivityCard, AttachmentsCard, DescriptionCard, DetailsCard, RelationsCard, TaskMetaPills, TimeCard, WatchersCard, WorkCards } from '@/components/work/tasks/detail/task-sections'
import { TitleEditor } from '@/components/work/tasks/detail/title-editor'

export const metadata: Metadata = { title: 'Task' }

/** The full task page (deep links and refreshes). Clicks inside the app open the same content in the side panel (app/app/@panel). */
export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const view = await loadTaskView(id)
  if (view.kind === 'missing') notFound()
  if (view.kind === 'denied') redirect('/app/work/tasks?denied=1')
  const { detail, row } = view
  const back = detail.parent ? { href: `/app/work/tasks/${detail.parent._id}`, label: `${detail.parent.key} · ${detail.parent.title}` } : { href: '/app/work/tasks', label: 'Tasks' }

  return (
    <TaskDataProvider value={view.data}>
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 space-y-4 xl:col-span-8">
          <header className="animate-slide-up space-y-3">
            <Link href={back.href} className="inline-flex max-w-full items-center gap-1 truncate text-[13px] text-fg-2 transition-colors hover:text-white"><ChevronLeft className="size-3.5 shrink-0" /> {back.label}</Link>
            <TaskMetaPills view={view} />
            <TitleEditor id={row.id} title={row.title} canEdit={row.canEdit} />
            <TaskActionsBar task={row} watching={detail.watching} canShare={detail.canShare} />
          </header>
          <DetailsCard view={view} />
          <DescriptionCard view={view} />
          <WorkCards view={view} />
          <RelationsCard view={view} />
          <AttachmentsCard view={view} />
          <TimeCard view={view} />
        </div>

        <aside className="col-span-12 space-y-4 xl:col-span-4">
          <ActivityCard view={view} />
          <WatchersCard view={view} />
        </aside>
      </div>
    </TaskDataProvider>
  )
}
