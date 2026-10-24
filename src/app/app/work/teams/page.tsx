import type { Metadata } from 'next'
import { Plus, UsersRound } from 'lucide-react'
import { breadcrumbFor } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { first, type SearchParams } from '@/lib/list'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { SearchInput } from '@/components/ui/search-input'
import { SectionLabel } from '@/components/ui/card'
import { TeamCard } from '@/components/work/teams/team-card'
import { TeamFormDialog } from '@/components/work/teams/team-form-dialog'
import { listPeople } from '@/modules/work/teams/people'
import { listTeams } from '@/modules/work/teams/queries'

export const metadata: Metadata = { title: 'Teams' }

export default async function TeamsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const ctx = await requireMember({ product: 'work' })
  const q = (first(sp.q) ?? '').trim()
  const canManage = ctx.can('teams.manage')
  const [teams, people] = await Promise.all([listTeams(ctx, q), canManage ? listPeople(ctx) : Promise.resolve([])])
  const mine = teams.filter((t) => t.isMember)
  const me = String(ctx.memberId)
  const newButton = <Button variant="primary" icon={<Plus className="size-4" />}>New team</Button>
  const pickPeople = people.map((p) => ({ id: p.id, name: p.name, title: p.title }))

  return (
    <>
      <PageHeader
        title="Teams"
        help="teams-vs-departments"
        description="Work groups: who works with whom, and how much each team is carrying. The HR org chart is Departments, in Muster."
        breadcrumb={breadcrumbFor('/app/work/teams')}
        icon={<UsersRound />}
        actions={
          <>
            <SearchInput placeholder="Search teams" />
            {canManage ? <TeamFormDialog trigger={newButton} people={pickPeople} defaultOpen={first(sp.new) === '1'} /> : null}
          </>
        }
      />
      {teams.length === 0 ? (
        <div className="card-solid">
          <EmptyState
            icon={<UsersRound />}
            title={q ? 'No teams found' : 'No teams yet'}
            description={q ? 'Create one or adjust your search.' : 'Teams group people who work together.'}
            action={canManage ? <TeamFormDialog trigger={<Button variant="primary" icon={<Plus className="size-4" />}>Create team</Button>} people={pickPeople} /> : undefined}
          />
        </div>
      ) : (
        <div className="space-y-8">
          {mine.length ? (
            <section className="space-y-3">
              <SectionLabel icon={<UsersRound />}>My teams · {mine.length}</SectionLabel>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {mine.map((t) => <TeamCard key={t.id} team={t} myMemberId={me} canManage={canManage} />)}
              </div>
            </section>
          ) : null}
          <section className="space-y-3">
            <SectionLabel icon={<UsersRound />}>All teams · {teams.length}</SectionLabel>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {teams.map((t) => <TeamCard key={t.id} team={t} myMemberId={me} canManage={canManage} />)}
            </div>
          </section>
        </div>
      )}
    </>
  )
}
