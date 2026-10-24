import type { Metadata } from 'next'
import { isValidObjectId } from 'mongoose'
import { notFound } from 'next/navigation'
import { Pencil, UsersRound } from 'lucide-react'
import { requireMember } from '@/lib/ctx'
import { todayIST } from '@/lib/dates'
import { first, type SearchParams } from '@/lib/list'
import { IconButton } from '@/components/ui/button'
import { LinkTabs } from '@/components/ui/tabs'
import { PageHeader } from '@/components/ui/page-header'
import { AddPeopleDialog, MembersTable } from '@/components/work/teams/members-table'
import { PillLinks } from '@/components/work/teams/pill-links'
import { TeamFormDialog } from '@/components/work/teams/team-form-dialog'
import { WorkloadView } from '@/components/work/teams/workload-view'
import { memberExtras, type MemberExtras } from '@/modules/work/teams/member-cards'
import { teamDetail, teamWorkload } from '@/modules/work/teams/queries'
import { PERIODS, PERIOD_LABELS, periodRange, type Period } from '@/modules/work/teams/workload'

export const metadata: Metadata = { title: 'Team' }

export default async function TeamPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams])
  const ctx = await requireMember({ product: 'work' })
  if (!isValidObjectId(id)) notFound()
  const team = await teamDetail(ctx, id)
  if (!team) notFound()
  const canManage = ctx.can('teams.manage')
  const tab = first(sp.tab) === 'workload' ? 'workload' : 'members'
  const period = (PERIODS as readonly string[]).includes(first(sp.period) ?? '') ? (first(sp.period) as Period) : 'this_week'
  const base = `/app/work/teams/${id}`
  const today = todayIST()
  const memberIds = team.members.map((m) => m.id)
  const [workload, extras] = await Promise.all([
    tab === 'workload' ? teamWorkload(ctx, memberIds, periodRange(period, today), today) : Promise.resolve([]),
    tab === 'members' ? memberExtras(ctx, memberIds) : Promise.resolve(new Map<string, MemberExtras>()),
  ])
  const members = team.members.flatMap((m) => {
    const extra = extras.get(m.id)
    return extra ? [{ ...m, ...extra }] : []
  })
  const candidates = team.candidates.map((p) => ({ id: p.id, name: p.name, title: p.title }))

  return (
    <>
      <PageHeader
        title={team.name}
        description={team.description || 'No description'}
        back={{ href: '/app/work/teams', label: 'Teams' }}
        icon={<UsersRound />}
        actions={
          canManage ? (
            <>
              <TeamFormDialog team={{ id: team.id, name: team.name, description: team.description, color: team.color, isPrivate: team.isPrivate }} trigger={<IconButton label="Edit team" variant="outline"><Pencil className="size-4" /></IconButton>} />
              <AddPeopleDialog teamId={team.id} candidates={candidates} />
            </>
          ) : null
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <LinkTabs tabs={[{ href: base, label: 'Members', count: team.members.length }, { href: `${base}?tab=workload`, label: 'Workload' }]} />
          {tab === 'workload' ? <PillLinks active={period} items={PERIODS.map((p) => ({ key: p, href: `${base}?tab=workload&period=${p}`, label: PERIOD_LABELS[p] }))} /> : null}
        </div>
      </PageHeader>
      {tab === 'workload' ? <WorkloadView rows={workload} /> : <MembersTable teamId={team.id} teamName={team.name} members={members} candidates={candidates} canManage={canManage} view={ctx.user.prefs?.teamView === 'list' ? 'list' : 'cards'} />}
    </>
  )
}
