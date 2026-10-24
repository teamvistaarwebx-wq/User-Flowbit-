'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Select } from '@/components/ui/select'

/** Project dropdown on the Home overview card (?project=id). */
export function ProjectSwitcher({ projects, value, className = 'w-48' }: { projects: { id: string; name: string }[]; value: string; className?: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const search = useSearchParams()
  return (
    <Select
      size="sm"
      aria-label="Project"
      value={value}
      className={className}
      options={projects.map((p) => ({ value: p.id, label: p.name }))}
      onValueChange={(id) => {
        const params = new URLSearchParams(search.toString())
        params.set('project', id)
        router.replace(`${pathname}?${params.toString()}`, { scroll: false })
      }}
    />
  )
}
