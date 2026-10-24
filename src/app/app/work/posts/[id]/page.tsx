import type { Metadata } from 'next'
import { isValidObjectId } from 'mongoose'
import { notFound } from 'next/navigation'
import { MessageSquare, Megaphone } from 'lucide-react'
import { requireMember } from '@/lib/ctx'
import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { PostCard } from '@/components/work/posts/post-card'
import { MarkRead } from '@/components/work/posts/post-tools'
import { Replies } from '@/components/work/posts/replies'
import { AckPanel } from '@/components/work/posts/ack-bar'
import { groupOptions } from '@/modules/work/posts/audience'
import { postDetail } from '@/modules/work/posts/queries'

export const metadata: Metadata = { title: 'Post' }

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requireMember({ product: 'work' })
  if (!isValidObjectId(id)) notFound()
  const detail = await postDetail(ctx, id)
  if (!detail) notFound()
  if (detail.removed) {
    return (
      <div className="card-solid mx-auto max-w-xl">
        <EmptyState icon={<Megaphone />} title="This post was removed" description="The author or a moderator took it down." action={<Button href="/app/work/posts" variant="primary">Back to posts</Button>} />
      </div>
    )
  }
  const { card, receipts, replies, people, acks } = detail
  const groups = await groupOptions(ctx)
  const pick = people.map((x) => ({ id: x.id, name: x.name, title: x.title }))
  const canModerate = ctx.can('posts.manage')
  return (
    <>
      <PageHeader title={card.title} back={{ href: '/app/work/posts', label: 'Posts' }} className="[&_h1]:sr-only" />
      <MarkRead postId={card.id} already={card.isRead} />
      <div className="mx-auto max-w-3xl space-y-4">
        <PostCard post={card} canPin={canModerate} canAnnounce={canModerate} people={pick} groups={groups} canWrite={ctx.can('posts.write')} full receipts={card.canEdit ? receipts : undefined} />
        {acks ? <AckPanel postId={card.id} rows={acks} /> : null}
        <Card variant="table" className="px-[23px] pt-[17px]">
          <CardHeader label={`Replies · ${replies.length}`} icon={<MessageSquare />} />
          <Replies postId={card.id} replies={replies} people={pick} canModerate={canModerate} meName={ctx.user.name} />
        </Card>
      </div>
    </>
  )
}
