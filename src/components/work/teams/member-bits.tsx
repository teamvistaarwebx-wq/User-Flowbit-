import Image from 'next/image'
import { cn } from '@/lib/utils'
import type { MemberProject } from '@/modules/work/teams/member-cards'
import type { PresenceState } from '@/modules/work/presence-core'

/** Presence as words with a matching colour (the avatar carries the dot). */
export const PRESENCE_TONE: Record<PresenceState, string> = { in: 'text-[#2DCBAF]', break: 'text-violet', leave: 'text-warning', out: 'text-[#979797]' }

/** Logos of the projects someone is on: up to `max`, then "+N". */
export function ProjectLogos({ projects, max = 3 }: { projects: MemberProject[]; max?: number }) {
  if (!projects.length) return <span className="text-xs text-[#979797]">No projects</span>
  const shown = projects.slice(0, max)
  const extra = projects.length - shown.length
  return (
    <span className="flex items-center gap-1" aria-label={`Projects: ${projects.map((p) => p.name).join(', ')}`}>
      {shown.map((p) => (
        <span key={p.id} title={`${p.code} · ${p.name}`} className="inline-flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-[6px] text-[9px] font-semibold text-white ring-1 ring-white/[0.14]" style={p.logoUrl ? undefined : { background: p.color }}>
          {p.logoUrl ? (
            <Image src={p.logoUrl} alt="" width={24} height={24} unoptimized className="size-full object-cover" />
          ) : (
            p.code.slice(0, 3)
          )}
        </span>
      ))}
      {extra > 0 ? <span title={projects.slice(max).map((p) => p.name).join(', ')} className={cn('inline-flex h-6 items-center rounded-[6px] bg-control px-1.5 text-[11px] font-medium text-fg-2')}>+{extra}</span> : null}
    </span>
  )
}
