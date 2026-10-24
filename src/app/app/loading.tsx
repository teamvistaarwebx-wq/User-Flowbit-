import { Skeleton } from '@/components/ui/skeleton'

export default function AppLoading() {
  return (
    <div className="space-y-6" aria-busy aria-label="Loading">
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-8 w-72" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Skeleton className="h-32 rounded-[20px]" />
        <Skeleton className="h-32 rounded-[20px]" />
        <Skeleton className="h-32 rounded-[20px]" />
      </div>
      <Skeleton className="h-80 rounded-[20px]" />
    </div>
  )
}
