import type { Metadata } from 'next'
import Link from 'next/link'
import { CalendarClock, Megaphone, PenSquare, Pin, X } from 'lucide-react'
import { breadcrumbFor } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { isKlipyConfigured } from '@/lib/env'
import { buildHref, first, parseListParams, type SearchParams } from '@/lib/list'
import { buttonClass } from '@/components/ui/button-styles'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { Pagination } from '@/components/ui/pagination'
import { SearchInput } from '@/components/ui/search-input'
import { ComposerCard } from '@/components/work/posts/composer-card'
import { PostCard } from '@/components/work/posts/post-card'
import { TypeChips } from '@/components/work/posts/type-chips'
import { PillLinks } from '@/components/work/teams/pill-links'
import { groupOptions } from '@/modules/work/posts/audience'
import { POST_TYPES, POST_TYPE_META, type PostType } from '@/modules/work/posts/post-types'
import { POSTS_PAGE_SIZE, listPosts, type PostCardData } from '@/modules/work/posts/queries'
import { POST_SORTS, type PostSort } from '@/modules/work/posts/rules'

export const metadata: Metadata = { title: 'Posts' }
const BASE = '/app/work/posts'
const SORT_LABELS: Record<PostSort, string> = { newest: 'Newest', oldest: 'Oldest', active: 'Most active' }

function Section({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section aria-label={label} className="space-y-3">
      <h2 className="flex items-center gap-1.5 px-1 text-xs font-semibold uppercase tracking-[0.06em] text-fg-2 [&_svg]:size-3.5">{icon}{label}</h2>
      {children}
    </section>
  )
}

export default async function PostsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const ctx = await requireMember({ product: 'work' })
  const p = parseListParams(sp, { pageSize: POSTS_PAGE_SIZE })
  const raw = p.get('type') ?? p.get('category') ?? ''
  const type = (POST_TYPES as readonly string[]).includes(raw) ? (raw as PostType) : undefined
  const sort = (POST_SORTS as readonly string[]).includes(p.get('sort') ?? '') ? (p.get('sort') as PostSort) : 'newest'
  const mentioned = p.get('mentioned') === '1'
  const author = /^[a-f0-9]{24}$/.test(p.get('author') ?? '') ? p.get('author') : undefined
  const [{ pinned, scheduled, posts, total, people }, groups] = await Promise.all([listPosts(ctx, { type, mentioned, author, q: p.q, sort, page: p.page }), groupOptions(ctx)])
  const pick = people.map((x) => ({ id: x.id, name: x.name, title: x.title }))
  const canAnnounce = ctx.can('posts.manage')
  const canWrite = ctx.can('posts.write')
  const authorName = author ? people.find((x) => x.id === author)?.name : undefined
  const card = (post: PostCardData) => <PostCard key={post.id} post={post} canPin={canAnnounce} canAnnounce={canAnnounce} people={pick} groups={groups} canWrite={canWrite} />
  const nothing = !pinned.length && !scheduled.length && !posts.length

  return (
    <>
      <PageHeader title="Posts" description="Announcements, kudos, polls, policies and news for the whole workspace." breadcrumb={breadcrumbFor(BASE)} icon={<Megaphone />} actions={<SearchInput placeholder="Search posts" />}>
        <div className="flex min-w-0 flex-col gap-3">
          <TypeChips active={type} hrefFor={(t) => buildHref(BASE, sp, { type: t, category: undefined, page: undefined })} />
          <div className="flex flex-wrap items-center gap-3">
            <PillLinks active={sort} items={POST_SORTS.map((s) => ({ key: s, label: SORT_LABELS[s], href: buildHref(BASE, sp, { sort: s === 'newest' ? undefined : s, page: undefined }) }))} />
            <Link href={buildHref(BASE, sp, { mentioned: mentioned ? undefined : '1', page: undefined })} className={buttonClass(mentioned ? 'violet' : 'secondary', 'sm')} aria-pressed={mentioned}>
              About me
            </Link>
            {authorName ? (
              <Link href={buildHref(BASE, sp, { author: undefined, page: undefined })} className={buttonClass('secondary', 'sm')} aria-label={`Clear filter: posts by ${authorName}`}>
                By {authorName} <X className="size-3.5" aria-hidden />
              </Link>
            ) : null}
          </div>
        </div>
      </PageHeader>
      <div className="mx-auto max-w-[680px] space-y-5">
        {canWrite ? <ComposerCard people={pick} groups={groups} canAnnounce={canAnnounce} defaultOpen={first(sp.compose) === '1'} gifSearch={isKlipyConfigured()} me={ctx.user.name} /> : null}
        {scheduled.length ? <Section label="Your scheduled posts" icon={<CalendarClock />}>{scheduled.map(card)}</Section> : null}
        {pinned.length ? <Section label="Pinned" icon={<Pin />}>{pinned.map(card)}</Section> : null}
        {nothing ? (
          <div className="card-solid rounded-[16px] py-6">
            <EmptyState
              icon={<Megaphone />}
              title={p.q ? 'No posts match your search' : mentioned ? 'No posts about you yet' : type ? `No ${POST_TYPE_META[type].plural.toLowerCase()} yet` : 'No posts yet'}
              description={p.q ? 'Try other words, or clear the search.' : mentioned ? 'Posts that mention you or are about you show up here.' : 'Write the first one: an update, kudos for a teammate or a quick poll.'}
              action={p.q ? <Link href={buildHref(BASE, sp, { q: undefined, page: undefined })} className={buttonClass('secondary', 'sm')}>Clear search</Link> : canWrite && !mentioned ? <Link href={buildHref(BASE, sp, { compose: '1' })} className={buttonClass('primary', 'sm')}><PenSquare className="size-4" aria-hidden /> Write a post</Link> : undefined}
            />
          </div>
        ) : posts.length ? (
          <Section label={pinned.length || scheduled.length ? 'Latest' : 'Feed'} icon={<Megaphone />}>{posts.map(card)}</Section>
        ) : null}
        <Pagination page={p.page} pageSize={POSTS_PAGE_SIZE} total={total} basePath={BASE} params={sp} />
      </div>
    </>
  )
}
