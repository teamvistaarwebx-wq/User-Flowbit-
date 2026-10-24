import Link from 'next/link'
import { ArrowRight, Building2, CalendarDays, FolderKanban, Megaphone, SquareCheckBig, UserRound } from 'lucide-react'
import { StatusPill } from '@/components/ui/badge'
import { buttonClass } from '@/components/ui/button-styles'
import type { HitGroup, SearchGroups } from '@/modules/work/arc/search'

const GROUPS: { key: HitGroup; label: string; icon: typeof SquareCheckBig }[] = [
  { key: 'tasks', label: 'Tasks', icon: SquareCheckBig },
  { key: 'projects', label: 'Projects', icon: FolderKanban },
  { key: 'clients', label: 'Clients', icon: Building2 },
  { key: 'people', label: 'People', icon: UserRound },
  { key: 'posts', label: 'Posts', icon: Megaphone },
  { key: 'meetings', label: 'Meetings', icon: CalendarDays },
]

export function SearchResult({ prompt, groups, shortcut }: { prompt: string; groups: SearchGroups; shortcut: { label: string; href: string } | null }) {
  const filled = GROUPS.filter((g) => groups[g.key]?.length)
  return (
    <div className="space-y-4">
      {shortcut ? (
        <Link href={shortcut.href} className={buttonClass('primary', 'md')}>
          {shortcut.label} <ArrowRight className="size-4" />
        </Link>
      ) : null}
      {filled.length === 0 ? (
        <p className="text-[13px] text-fg-2">Nothing matches “{prompt}”. Try a task key like VW-42 or a project code.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {filled.map((g) => (
            <section key={g.key} className="rounded-[10px] bg-control/70 p-3">
              <h4 className="mb-2 flex items-center gap-2 px-2 text-[13px] font-semibold uppercase tracking-[0.04em] text-white [&_svg]:size-4"><g.icon /> {g.label}</h4>
              <ul className="space-y-0.5">
                {groups[g.key]?.map((item) => (
                  <li key={item.id}>
                    <Link href={item.href} className="flex min-h-9 items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-white/[0.05]">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-white">{item.title}</span>
                        {item.subtitle ? <span className="block truncate text-xs text-[#979797]">{item.subtitle}</span> : null}
                      </span>
                      {item.status ? <StatusPill status={item.status} /> : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
