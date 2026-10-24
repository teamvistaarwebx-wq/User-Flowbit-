'use client'

import { Lock, LogIn, LogOut, Pencil, Trash2 } from 'lucide-react'
import { Button, IconButton } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useAction } from '@/components/ui/action-form'
import { pluralize } from '@/lib/utils'
import { deleteTeam, joinTeam, removeTeamMember } from '@/modules/work/teams/actions'
import { TeamFormDialog } from './team-form-dialog'

type Props = { team: { id: string; name: string; description: string; color: string; isPrivate: boolean; memberCount: number }; isMember: boolean; myMemberId: string; canManage: boolean }

/** Join (open teams only) / Leave and, for team managers, Edit / Delete. */
export function TeamCardActions({ team, isMember, myMemberId, canManage }: Props) {
  const [join, joining] = useAction(joinTeam)
  return (
    <div className="relative z-10 flex items-center justify-between gap-1">
      {isMember ? (
        <ConfirmDialog
          trigger={<Button size="sm" variant="ghost" icon={<LogOut className="size-4" />}>Leave</Button>}
          title={`Leave ${team.name}?`}
          description="You can join again any time."
          confirmLabel="Leave"
          onConfirm={() => removeTeamMember({ id: team.id, memberId: myMemberId })}
        />
      ) : team.isPrivate ? (
        <span className="inline-flex items-center gap-1.5 text-[13px] text-fg-2">
          <Lock className="size-3.5" /> Invite only
        </span>
      ) : (
        <Button size="sm" variant="outline" icon={<LogIn className="size-4" />} loading={joining} onClick={() => join({ id: team.id })}>
          Join
        </Button>
      )}
      {canManage ? (
        <div className="flex items-center gap-0.5">
          <TeamFormDialog team={team} trigger={<IconButton label="Edit team" size="sm"><Pencil className="size-4" /></IconButton>} />
          <ConfirmDialog
            trigger={<IconButton label="Delete team" size="sm"><Trash2 className="size-4" /></IconButton>}
            title={`Delete team '${team.name}'?`}
            description={`${pluralize(team.memberCount, 'member')} will be removed from it; their tasks stay.`}
            confirmLabel="Delete team"
            onConfirm={() => deleteTeam({ id: team.id })}
          />
        </div>
      ) : null}
    </div>
  )
}
