'use client'

import { Crown, UserMinus, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { addProjectMembers, removeProjectMember } from '@/modules/work/projects/actions'
import { useAction } from '@/components/ui/action-form'
import { Avatar } from '@/components/ui/avatar'
import { Button, IconButton } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { PeoplePicker } from '../tasks/people-picker'
import type { Person } from '../tasks/types'

/** People on the project: lead first; add and remove when allowed (the lead can't be removed). */
export function ProjectMembers({ projectId, projectName, leadId, memberIds, people, canEdit, workload }: { projectId: string; projectName: string; leadId: string; memberIds: string[]; people: Person[]; canEdit: boolean; workload?: Record<string, { total: number; completed: number }> }) {
  const [picked, setPicked] = useState<string[]>([])
  const [add, adding] = useAction(addProjectMembers, { onDone: () => setPicked([]) })
  const byId = new Map(people.map((p) => [p.id, p]))
  const ordered = [leadId, ...memberIds.filter((m) => m !== leadId)]
  return (
    <div className="space-y-3">
      <ul className="-mx-2">
        {ordered.map((id) => {
          const p = byId.get(id)
          const load = workload?.[id]
          return (
            <li key={id} className="flex min-h-11 items-center gap-3 rounded-[10px] px-2 py-1 transition-colors hover:bg-white/[0.04]">
              <Avatar name={p?.name} src={p?.avatarUrl} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate text-sm text-white">{p?.name ?? 'Former member'}{id === leadId ? <Crown className="size-3.5 text-fg-2" aria-label="Lead" /> : null}</p>
                <p className="truncate text-xs text-[#959596]">{id === leadId ? 'Project lead' : p?.title ?? 'Member'}{load ? ` · ${load.completed}/${load.total} tasks done` : ''}</p>
              </div>
              {canEdit && id !== leadId ? (
                <ConfirmDialog
                  trigger={<IconButton label={`Remove ${p?.name ?? 'member'}`} size="sm"><UserMinus className="size-3.5" /></IconButton>}
                  title={`Remove ${p?.name ?? 'this person'} from ${projectName}?`}
                  description="Their tasks stay in the project."
                  confirmLabel="Remove"
                  onConfirm={() => removeProjectMember({ id: projectId, memberId: id })}
                />
              ) : null}
            </li>
          )
        })}
      </ul>
      {canEdit ? (
        <PeoplePicker
          people={people.filter((p) => p.active && !ordered.includes(p.id))}
          value={picked}
          onChange={setPicked}
          onOpenChange={(open) => !open && picked.length && void add({ id: projectId, memberIds: picked })}
          emptyLabel="Everyone is already on the project"
          trigger={<Button variant="secondary" size="sm" icon={<UserPlus className="size-3.5" />} loading={adding}>Add people</Button>}
        />
      ) : null}
    </div>
  )
}
