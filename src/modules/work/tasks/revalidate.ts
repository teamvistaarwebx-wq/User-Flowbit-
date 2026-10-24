import 'server-only'
import { revalidatePath } from 'next/cache'

/** Work pages read tasks everywhere (Home, Tasks, Spaces, Projects): refresh the whole signed-in tree. */
export function revalidateWork(): void {
  revalidatePath('/app', 'layout')
}

/** A change only the task's own page shows (comments, reactions): refresh that page, not the whole tree. */
export function revalidateTask(taskId: string): void {
  revalidatePath(`/app/work/tasks/${taskId}`)
}
