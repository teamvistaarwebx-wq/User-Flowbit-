import Link from 'next/link'
import type { ReactNode } from 'react'
import { CalendarDays, FolderKanban, Hash, Loader, UserRound } from 'lucide-react'
import { formatDate } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { StatusPill } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { TBODY_ROW, THEAD_ROW, TableCard, Td, Th } from '@/components/orbit/parts'

type ProjectRow = { id: string; code: string; name: string; status: string; health: string; leadName: string; endDate: string | null }

export function ProjectsTab({ projects, newProject }: { projects: ProjectRow[] | null; newProject: ReactNode }) {
  return (
    <TableCard icon={<FolderKanban />} title="Projects" subtitle={projects?.length ? 'Work projects billed to this client.' : undefined} actions={projects?.length ? newProject : null}>
      {projects === null ? (
        <p className="border-t border-line px-[23px] py-8 text-center text-[13px] text-fg-2">Projects could not be loaded right now. Refresh to try again.</p>
      ) : projects.length === 0 ? (
        <div className="border-t border-line">
          <EmptyState icon={<FolderKanban />} title="No projects for this client" description="Start one in Work and pick this client." action={newProject} compact />
        </div>
      ) : (
        <div className="overflow-x-auto pb-3">
          <table className="w-full min-w-[680px] border-collapse">
            <thead>
              <tr className={THEAD_ROW}>
                <Th icon={<Hash strokeWidth={1.5} />}>Code</Th>
                <Th icon={<FolderKanban strokeWidth={1.5} />}>Project</Th>
                <Th icon={<Loader strokeWidth={1.5} />}>Status</Th>
                <Th>Health</Th>
                <Th icon={<UserRound strokeWidth={1.5} />}>Lead</Th>
                <Th icon={<CalendarDays strokeWidth={1.5} />}>End date</Th>
              </tr>
            </thead>
            <tbody>
              <tr aria-hidden className="h-1.5" />
              {projects.map((p) => (
                <tr key={p.id} className={cn(TBODY_ROW, 'h-11')}>
                  <Td className="font-mono text-xs text-[#979797]">{p.code}</Td>
                  <Td><Link href={`/app/work/projects/${p.id}`} className="text-sm text-white transition-colors hover:text-blush">{p.name}</Link></Td>
                  <Td><StatusPill status={p.status} /></Td>
                  <Td><StatusPill status={p.health} /></Td>
                  <Td className="whitespace-nowrap">{p.leadName}</Td>
                  <Td className="whitespace-nowrap text-[#979797]">{p.endDate ? formatDate(p.endDate) : '—'}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </TableCard>
  )
}
