import Link from 'next/link'
import { AtSign, CalendarClock, MapPin, MessageSquare, Pin, Sparkles } from 'lucide-react'
import { Avatar, AvatarStack } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { formatDateTime, timeAgo } from '@/lib/dates'
import type { Tone } from '@/lib/status'
import { cn } from '@/lib/utils'
import type { PostCardData } from '@/modules/work/posts/queries'
import type { GroupOptions } from '@/modules/work/posts/audience'
import type { PickPerson } from '../teams/people-picker'
import { AckBar } from './ack-bar'
import { PollBlock } from './poll-block'
import { PostTools, ReadReceipts } from './post-tools'
import { PostTypeBadge } from './post-type-icon'
import { ReactionBar } from './reaction-bar'
import { ImageGallery } from '../media/image-gallery'
import { CollapsibleText } from './collapsible-text'

const PRIORITY_TONE: Record<string, Tone> = { low: 'neutral', medium: 'neutral', high: 'orange', urgent: 'danger' }
const FEATURED_LEAD: Record<string, string> = { kudos: 'Kudos to', welcome: 'Welcome', celebration: 'Celebrating' }

type Props = {
  post: PostCardData
  canPin: boolean
  canAnnounce: boolean
  people: PickPerson[]
  groups: GroupOptions
  full?: boolean
  receipts?: { id: string; name: string; readAt?: string }[]
  canWrite?: boolean
}

function audienceNote(post: PostCardData): string {
  if (post.audience === 'roles') return ` · for ${post.targetRoles.join(', ')}`
  if (post.audience === 'groups') return ` · for ${post.targetGroups.join(', ')}`
  return post.audience === 'private' ? ' · private' : ''
}

/** "Kudos to Asha and Ravi" with their avatars (kudos, welcome, celebration). */
function Featured({ post }: { post: PostCardData }) {
  if (!post.featured.length) return null
  const names = post.featured.map((f) => f.name)
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0]
  return (
    <div className="mt-3 flex items-center gap-2.5 rounded-[10px] bg-white/[0.04] px-3 py-2">
      <AvatarStack people={post.featured.map((f) => ({ name: f.name }))} size="xs" max={5} />
      <p className="min-w-0 text-[13px] text-white/85">
        <span className="text-fg-2">{FEATURED_LEAD[post.type] ?? 'With'} </span>
        <span className="font-medium text-white">{list}</span>
      </p>
    </div>
  )
}

function EventLine({ event }: { event: NonNullable<PostCardData['event']> }) {
  return (
    <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-white/85">
      <span className="inline-flex items-center gap-1.5"><CalendarClock className="size-4 text-[#8E8DFF]" /> {formatDateTime(event.startsAt)}</span>
      {event.place ? <span className="inline-flex items-center gap-1.5"><MapPin className="size-4 text-[#8E8DFF]" /> {event.place}</span> : null}
    </p>
  )
}

/**
 * Feed card (clamped) or the full post on the detail page: author line, type badge, title and text, who it is
 * about, media, the poll or policy strip, then reactions and replies. Announcements and pinned posts get the
 * brighter lit hairline instead of a coloured border.
 */
export function PostCard({ post, canPin, canAnnounce, people, groups, full, receipts, canWrite = true }: Props) {
  const href = `/app/work/posts/${post.id}`
  const isAuthor = post.canEdit
  return (
    <article className={cn('glass relative rounded-[16px] p-4 sm:p-6', !full && 'lift', (post.pinned || post.type === 'announcement') && 'lit-edge-bright bg-white/[0.07]')}>
      <header className="flex items-start gap-3">
        <Avatar name={post.author.name} size="md" className="shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link href={`/app/work/posts?author=${post.author.id}`} className="relative z-10 text-sm font-semibold text-white transition-colors hover:text-blush" title={`Posts by ${post.author.name}`}>
              {post.author.name}
            </Link>
            <PostTypeBadge type={post.type} />
            {post.type === 'announcement' && post.priority !== 'medium' && post.priority !== 'low' ? <Badge tone={PRIORITY_TONE[post.priority]}>{post.priority === 'urgent' ? 'Urgent' : 'High'}</Badge> : null}
            {post.pinned ? <Badge icon={<Pin className="size-3" />}>Pinned</Badge> : null}
            {post.scheduledFor ? <Badge tone="info" icon={<CalendarClock className="size-3" />}>Scheduled {formatDateTime(post.scheduledFor)}</Badge> : null}
            {!post.isRead && !post.scheduledFor ? <span className="text-xs font-medium text-link">New</span> : null}
          </div>
          <p className="mt-0.5 text-[13px] text-[#959596]">
            {post.automatic ? <><Sparkles className="mr-1 inline size-3" aria-hidden />Posted automatically · </> : post.author.title ? `${post.author.title} · ` : ''}
            {timeAgo(post.createdAt)}
            {post.editedAt ? ' · edited' : ''}
            {audienceNote(post)}
          </p>
        </div>
        <PostTools post={post} canPin={canPin && !post.scheduledFor} canEdit={post.canEdit} people={people} groups={groups} canAnnounce={canAnnounce} />
      </header>
      <div className="mt-4">
        {full ? (
          <h1 className="text-xl font-medium leading-7 text-white">{post.title}</h1>
        ) : (
          <Link href={href} className="text-base font-semibold leading-6 text-white transition-colors after:absolute after:inset-0 after:rounded-[inherit] after:content-[''] hover:text-blush">
            {post.title}
          </Link>
        )}
        {full ? <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-white/80">{post.message}</p> : <CollapsibleText text={post.message} className="mt-1.5" />}
        {post.event ? <EventLine event={post.event} /> : null}
        <Featured post={post} />
        {post.images.length ? <ImageGallery images={post.images} layout="grid" className="mt-4" author={post.author.name} source="post" /> : null}
        {post.poll ? <PollBlock postId={post.id} poll={post.poll} canVote={canWrite && !post.scheduledFor} canClose={isAuthor} /> : null}
        {post.ack && !post.scheduledFor ? <AckBar postId={post.id} ack={post.ack} isAuthor={isAuthor} /> : null}
      </div>
      <footer className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-3.5">
        <ReactionBar kind="post" id={post.id} reactions={post.reactions} />
        <div className="flex flex-wrap items-center gap-3 text-[13px] tabular-nums text-[#979797]">
          {post.mentionIds.length ? <span className="inline-flex items-center gap-1" title="Mentioned"><AtSign className="size-3.5" /> {post.mentionIds.length}</span> : null}
          <span className="inline-flex items-center gap-1.5" title="Replies">
            <MessageSquare className="size-3.5" /> {post.replyCount}
            {post.repliers.length ? <span className="flex -space-x-1.5">{post.repliers.map((n, i) => <Avatar key={`${n}-${i}`} name={n} size="xs" ring />)}</span> : null}
          </span>
          {post.canEdit && !post.scheduledFor ? <ReadReceipts seen={post.seen} total={post.audienceSize} receipts={receipts} /> : null}
        </div>
      </footer>
    </article>
  )
}
