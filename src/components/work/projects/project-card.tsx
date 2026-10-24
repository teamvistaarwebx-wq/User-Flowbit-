import Image from 'next/image'
import Link from 'next/link'
import { formatDate } from '@/lib/dates'
import { AvatarStack } from '@/components/ui/avatar'
import { StatusPill } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { HEALTH_LABEL, PROJECT_STATUS_LABEL, type ProjectHealth, type ProjectStatus } from '@/modules/work/projects/constants'
import type { ProjectSummary } from '@/modules/work/projects/queries'
import type { Person } from '../tasks/types'
import { ProjectMenu } from './project-menu'

/**
 * Project initials on a solid square in the project colour, muted towards the page like the Figma workspace
 * avatar: white letters, no outline.
 */
export function ProjectTile({ name, color, logoUrl, size = 'md' }: { name: string; color: string; logoUrl?: string | null; size?: 'md' | 'lg' }) {
  if (logoUrl) {
    return (
      <span className={size === 'lg' ? 'flex size-11 shrink-0 overflow-hidden rounded-[10px] bg-white/[0.06]' : 'flex size-9 shrink-0 overflow-hidden rounded-[8px] bg-white/[0.06]'}>
        {/* unoptimized: /api/files checks the viewer's session, which the image optimizer would not send */}
        <Image src={logoUrl} alt="" width={44} height={44} unoptimized className="size-full object-contain" />
      </span>
    )
  }
  const letters = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()
  return (
    <span className={size === 'lg' ? 'flex size-11 shrink-0 items-center justify-center rounded-[10px] text-[15px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]' : 'flex size-9 shrink-0 items-center justify-center rounded-[8px] text-[13px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]'} style={{ background: `color-mix(in srgb, ${color} 62%, #1A1A1A)` }}>
      {letters || 'P'}
    </span>
  )
}

export function HealthPill({ health }: { health: string }) {
  return <StatusPill status={health} label={HEALTH_LABEL[health as ProjectHealth] ?? health} />
}

/** Small glass card (radius 10): tile, name, code and client, status and health, a 16px progress bar, the counts in a ruled row, people and the end date. */
export function ProjectCard({ project, people, canDelete }: { project: ProjectSummary; people: Person[]; canDelete: boolean }) {
  const byId = new Map(people.map((p) => [p.id, p]))
  return (
    <div className="glass lift group relative flex flex-col gap-4 rounded-[10px] p-4">
      <div className="flex items-start gap-3">
        <ProjectTile name={project.name} color={project.color} logoUrl={project.logoUrl} />
        <div className="min-w-0 flex-1">
          <Link href={`/app/work/projects/${project.id}`} className="block truncate text-[15px] font-semibold leading-5 text-white after:absolute after:inset-0 after:rounded-[10px] after:content-['']">{project.name}</Link>
          <p className="mt-0.5 truncate text-[13px] text-[#959596]">{project.code}{project.clientName ? ` · ${project.clientName}` : ' · Internal'}</p>
        </div>
        {project.canEdit ? <div className="relative z-10 opacity-55 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100 touch:opacity-100"><ProjectMenu id={project.id} name={project.name} archived={project.archived} canDelete={canDelete} /></div> : null}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <StatusPill status={project.status} label={PROJECT_STATUS_LABEL[project.status as ProjectStatus]} />
        <HealthPill health={project.health} />
      </div>
      <Progress value={project.progress} label="Progress" />
      <dl className="grid grid-cols-3 divide-x divide-white/[0.1] border-y border-white/[0.08] py-2.5">
        {[
          { label: 'Total', value: project.counts.total },
          { label: 'Done', value: project.counts.completed },
          { label: 'Overdue', value: project.counts.overdue },
        ].map((s) => (
          <div key={s.label} className="flex flex-col-reverse items-center gap-0.5">
            <dt className="text-xs font-semibold uppercase tracking-[0.04em] text-fg-2">{s.label}</dt>
            <dd className={s.label === 'Overdue' && s.value ? 'text-xl font-semibold leading-6 tabular-nums text-[#FF4540]' : 'text-xl font-semibold leading-6 tabular-nums text-white'}>{s.value}</dd>
          </div>
        ))}
      </dl>
      <div className="flex items-center justify-between text-[13px] text-[#979797]">
        <AvatarStack size="xs" max={4} people={project.memberIds.map((id) => ({ name: byId.get(id)?.name, src: byId.get(id)?.avatarUrl }))} />
        <span>{project.endDate ? `Due ${formatDate(project.endDate)}` : 'No end date'}</span>
      </div>
    </div>
  )
}
