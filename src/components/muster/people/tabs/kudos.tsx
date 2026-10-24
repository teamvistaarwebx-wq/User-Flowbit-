import Link from 'next/link'
import { HandHeart } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { Card, CardHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { timeAgo } from '@/lib/dates'
import { PostTypeIcon } from '@/components/work/posts/post-type-icon'
import { kudosFor } from '@/modules/work/posts/queries'
import type { TabProps } from './types'

/** Kudos tab: kudos posts from Work → Posts that name this person (only those the viewer may see). */
export async function KudosTab({ ctx, employee: e }: TabProps) {
  const kudos = e.memberId ? await kudosFor(ctx, String(e.memberId)) : []
  return (
    <Card>
      <CardHeader label={`Kudos · ${kudos.length}`} icon={<HandHeart />} description="Thanks from teammates, posted in Work → Posts." />
      {kudos.length ? (
        <ul className="divide-y divide-white/[0.06]">
          {kudos.map((k) => (
            <li key={k.id} className="flex gap-3 py-3">
              <Avatar name={k.author.name} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-x-2 text-sm">
                  <PostTypeIcon type="kudos" className="size-3.5" />
                  <Link href={`/app/work/posts/${k.id}`} className="font-medium text-white hover:text-blush">{k.title}</Link>
                </p>
                <p className="mt-0.5 line-clamp-2 text-[13px] text-white/75">{k.message}</p>
                <p className="mt-1 text-xs text-fg-3">From {k.author.name} · {timeAgo(k.createdAt)}{k.featured.length > 1 ? ` · with ${k.featured.filter((f) => f.id !== String(e.memberId)).map((f) => f.name).join(', ')}` : ''}</p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={<HandHeart />} title="No kudos yet" description={e.memberId ? 'Kudos given in Work → Posts show up here.' : 'Kudos need a Flowbit login linked to this employee.'} />
      )}
    </Card>
  )
}
