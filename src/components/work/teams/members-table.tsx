'use client'

import { useMemo, useState } from 'react'
import { Crown, LayoutGrid, List, UserMinus, UserPlus, UsersRound } from 'lucide-react'
import type { TeamView } from '@/models/User'
import type { MemberExtras } from '@/modules/work/teams/member-cards'
import { ActionForm, SubmitButton, useAction } from '@/components/ui/action-form'
import { Button, IconButton } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Dialog } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { knows, skillSuggestions } from '@/lib/skills'
import { Segmented } from '@/components/ui/tabs'
import { addTeamMembers, removeTeamMember, setTeamRole, setTeamView } from '@/modules/work/teams/actions'
import { PanelHeader } from '../shared/table'
import { MemberCard } from './member-card'
import { MemberList } from './member-list'
import { PeoplePicker, type PickPerson } from './people-picker'

export type TeamMemberRow = { id: string; name: string; title?: string; department?: string; role: string; joinedAt: string }
/** A member with today's presence, this week's load and their projects (modules/work/teams/member-cards). */
export type TeamMember = TeamMemberRow & MemberExtras

export function AddPeopleDialog({ teamId, candidates }: { teamId: string; candidates: PickPerson[] }) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen} title="Add people" description="Pick active members to add to this team." trigger={<Button variant="primary" icon={<UserPlus className="size-4" />}>Add people</Button>}>
      <ActionForm action={addTeamMembers} onDone={() => setOpen(false)} className="space-y-4">
        <input type="hidden" name="id" value={teamId} />
        {candidates.length ? <PeoplePicker name="memberIds" people={candidates} placeholder="Choose people" /> : <p className="text-[13px] text-fg-2">Everyone in the workspace is already in this team.</p>}
        <div className="flex justify-end">
          <SubmitButton disabled={!candidates.length}>Add to team</SubmitButton>
        </div>
      </ActionForm>
    </Dialog>
  )
}

function RoleButton({ teamId, member }: { teamId: string; member: TeamMemberRow }) {
  const [run, pending] = useAction(setTeamRole)
  const toLead = member.role !== 'lead'
  return (
    <Button size="sm" variant="ghost" icon={<Crown className="size-4" />} loading={pending} onClick={() => run({ id: teamId, memberId: member.id, role: toLead ? 'lead' : 'member' })}>
      {toLead ? 'Make lead' : 'Make member'}
    </Button>
  )
}

/** Remove from team, as a confirm. */
function RemoveButton({ teamId, teamName, member }: { teamId: string; teamName: string; member: TeamMemberRow }) {
  return (
    <ConfirmDialog
      trigger={<IconButton label={`Remove ${member.name}`} size="sm"><UserMinus className="size-4" /></IconButton>}
      title={`Remove ${member.name} from ${teamName}?`}
      description="Their tasks stay as they are."
      confirmLabel="Remove"
      onConfirm={() => removeTeamMember({ id: teamId, memberId: member.id })}
    />
  )
}

/** Members as cards or a sortable list; the choice is remembered on the person. */
export function MembersTable({ teamId, teamName, members, candidates, canManage, view: initialView }: { teamId: string; teamName: string; members: TeamMember[]; candidates: PickPerson[]; canManage: boolean; view: TeamView }) {
  const [view, setView] = useState<TeamView>(initialView)
  const [skill, setSkill] = useState('')
  const suggestions = useMemo(() => skillSuggestions(members), [members])
  const shown = useMemo(() => members.filter((m) => knows(m.skills, skill)), [members, skill])
  const [save] = useAction(setTeamView, { noRefresh: true })
  if (!members.length) {
    return (
      <div className="card-solid">
        <EmptyState icon={<UsersRound />} title="No members yet" description="Add the people who work together in this team." action={canManage ? <AddPeopleDialog teamId={teamId} candidates={candidates} /> : undefined} />
      </div>
    )
  }
  const choose = (next: TeamView) => {
    setView(next)
    void save({ view: next })
  }
  const actions = canManage
    ? (m: TeamMember) => (
        <span className="inline-flex items-center gap-1">
          <RoleButton teamId={teamId} member={m} />
          <RemoveButton teamId={teamId} teamName={teamName} member={m} />
        </span>
      )
    : undefined
  return (
    <section aria-label="Members" className="card-table overflow-hidden">
      <PanelHeader
        icon={<UsersRound />}
        title="Members"
        subtitle={`${members.length} ${members.length === 1 ? 'person' : 'people'} in ${teamName} · presence and load for today and this week`}
        className="border-b border-line px-[23px] pb-4 pt-[17px]"
        actions={<Segmented<TeamView> value={view} onChange={choose} options={[{ value: 'cards', label: <span className="inline-flex items-center gap-1.5"><LayoutGrid className="size-3.5" />Cards</span> }, { value: 'list', label: <span className="inline-flex items-center gap-1.5"><List className="size-3.5" />List</span> }]} />}
      />
      {suggestions.length ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3 sm:px-5">
          <label htmlFor="who-knows" className="text-[13px] text-fg-2">Who knows</label>
          <Input id="who-knows" inputSize="sm" value={skill} onChange={(e) => setSkill(e.target.value)} list="team-skills" placeholder="Figma, SEO…" className="w-48" autoComplete="off" />
          <datalist id="team-skills">{suggestions.map((s) => <option key={s} value={s} />)}</datalist>
          {skill ? <span className="text-[13px] text-fg-2">{shown.length} of {members.length}</span> : null}
        </div>
      ) : null}
      {!shown.length ? (
        <p className="px-5 py-8 text-center text-sm text-fg-2">Nobody in {teamName} lists “{skill}” yet.</p>
      ) : view === 'list' ? (
        <MemberList members={shown} actions={actions} />
      ) : (
        <ul className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-3">
          {shown.map((m) => <MemberCard key={m.id} member={m} teamName={teamName} actions={actions?.(m)} highlight={skill.trim().toLowerCase() || undefined} />)}
        </ul>
      )}
    </section>
  )
}
