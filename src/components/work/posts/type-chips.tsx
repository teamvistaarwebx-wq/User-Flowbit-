import Link from 'next/link'
import { cn } from '@/lib/utils'
import { POST_TYPES, POST_TYPE_META, type PostType } from '@/modules/work/posts/post-types'
import { PostTypeIcon } from './post-type-icon'

/** Filter chips by post type with their icons; scrolls sideways on a phone instead of wrapping into rows. */
export function TypeChips({ active, hrefFor }: { active?: PostType; hrefFor: (type?: PostType) => string }) {
  const chip = (selected: boolean) =>
    cn(
      'press inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[13px] transition-colors',
      selected ? 'border-transparent bg-chip-active text-white' : 'border-white/[0.12] bg-control text-white/75 hover:border-white/25 hover:text-white',
    )
  return (
    <nav aria-label="Filter by type" className="-mx-1 flex max-w-full gap-1.5 overflow-x-auto px-1 pb-1 scrollbar-none">
      <Link href={hrefFor(undefined)} aria-current={!active ? 'page' : undefined} className={chip(!active)}>All</Link>
      {POST_TYPES.map((t) => (
        <Link key={t} href={hrefFor(t)} aria-current={active === t ? 'page' : undefined} className={chip(active === t)}>
          <PostTypeIcon type={t} className="size-3.5" />
          {POST_TYPE_META[t].plural}
        </Link>
      ))}
    </nav>
  )
}
