import { TaskDataProvider } from '@/components/work/tasks/task-data'
import { loadTaskView } from '@/components/work/tasks/detail/load-task-view'
import { TaskPanelShell } from '@/components/work/tasks/panel/task-panel-shell'
import { TaskPanelView } from '@/components/work/tasks/panel/task-panel-view'

/**
 * A task opened from inside the app (list, board, calendar, Home) shows in the side panel over
 * the page; a deep link or a refresh renders the full task page instead (app/app/work/tasks/[id]).
 */
export default async function TaskPanelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const view = await loadTaskView(id)
  if (view.kind !== 'ok') {
    return (
      <TaskPanelShell taskId={id} label="Task">
        <p className="p-6 text-sm text-fg-2">{view.kind === 'missing' ? 'This task was deleted or never existed.' : "You don't have access to that task."}</p>
      </TaskPanelShell>
    )
  }
  return (
    <TaskDataProvider value={view.data}>
      <TaskPanelShell taskId={view.row.id} label={`${view.task.key} · ${view.row.title}`} me={view.data.me} assigneeIds={view.row.assigneeIds} canEdit={view.row.canEdit}>
        <TaskPanelView view={view} />
      </TaskPanelShell>
    </TaskDataProvider>
  )
}
