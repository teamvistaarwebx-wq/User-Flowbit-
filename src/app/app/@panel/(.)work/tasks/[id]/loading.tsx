import { Skeleton } from '@/components/ui/skeleton'

/** The panel's frame while the task loads, so the click answers at once. */
export default function TaskPanelLoading() {
  return (
    <div role="status" aria-label="Loading task" className="fixed inset-0 z-50 flex flex-col bg-panel md:left-auto md:w-[min(1080px,calc(100vw-104px))] md:border-l md:border-line">
      <div className="h-14 shrink-0 border-b border-line" />
      <div className="space-y-4 p-5">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-40 w-full" />
      </div>
    </div>
  )
}
