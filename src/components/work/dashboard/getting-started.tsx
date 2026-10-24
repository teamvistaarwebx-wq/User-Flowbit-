import Link from 'next/link'
import { Component, Lock, SquareCheckBig } from 'lucide-react'
import type { ReactNode } from 'react'
import { buttonClass } from '@/components/ui/button-styles'
import { SampleDataButton } from '@/components/activation/sample-data-button'

/** Shown on Home while the workspace has no tasks or projects yet: one sentence, one line, the two first moves. */
export function GettingStarted({ canCreateProject, newTask, personalMode = false, canLoadSample = false }: { canCreateProject: boolean; newTask?: ReactNode; personalMode?: boolean; canLoadSample?: boolean }) {
  // A personal task workspace has no projects: point at Personal tasks, as the Tasks page does.
  if (personalMode) {
    return (
      <section className="glass flex flex-col gap-5 rounded-[12px] px-6 py-5 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-white">Let&apos;s get your workspace moving</h2>
          <p className="mt-1 text-sm text-fg-2">Add your first task to start your personal list.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/app/work/tasks?view=board&personal=1" className={buttonClass(newTask ? 'secondary' : 'primary')}>
            <Lock className="size-4" strokeWidth={1.5} /> Open personal tasks
          </Link>
          {newTask}
        </div>
      </section>
    )
  }
  return (
    <section className="glass flex flex-col gap-5 rounded-[12px] px-6 py-5 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <h2 className="text-lg font-semibold text-white">Let&apos;s get your workspace moving</h2>
        <p className="mt-1 text-sm text-fg-2">Create your first project to group work for a client, or add a task to start your list.{canLoadSample ? ' Or look around with a sample agency first; remove it in one click.' : ''}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {canLoadSample ? <SampleDataButton loaded={false} size="md" /> : null}
        {canCreateProject ? (
          <Link href="/app/work/projects?new=1" className={buttonClass('primary')}>
            <Component className="size-4" strokeWidth={1.5} /> Create your first project
          </Link>
        ) : null}
        {newTask ?? (
          <Link href="/app/work/tasks" className={buttonClass('secondary')}>
            <SquareCheckBig className="size-4" strokeWidth={1.5} /> Add a task
          </Link>
        )}
      </div>
    </section>
  )
}
