import { Skeleton } from '@/components/ui/skeleton'

/** Matches PublicShell: black page, a centred column, the brand row, then cards. */
export default function PortalLoading() {
  return (
    <main className="min-h-dvh bg-black px-4 py-8 sm:py-14" aria-busy aria-label="Loading">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex items-center gap-3">
          <Skeleton className="size-11 rounded-xl" />
          <Skeleton className="h-5 w-40" />
        </div>
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-40 rounded-[20px]" />
        <Skeleton className="h-56 rounded-[20px]" />
      </div>
    </main>
  )
}
