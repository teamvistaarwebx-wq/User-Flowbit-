import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { buildHref, totalPages, type SearchParams } from '@/lib/list'

/** "Showing 21–40 of 132" with prev/next and page numbers, all as links (?page=). */
export function Pagination({ page, pageSize, total, basePath, params = {}, className }: { page: number; pageSize: number; total: number; basePath: string; params?: SearchParams; className?: string }) {
  const pages = totalPages(total, pageSize)
  if (total === 0) return null
  const from = (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)
  const href = (p: number) => buildHref(basePath, params, { page: p === 1 ? undefined : p })
  const numbers = Array.from({ length: pages }, (_, i) => i + 1).filter((p) => p === 1 || p === pages || Math.abs(p - page) <= 1)
  const btn = 'inline-flex h-8 min-w-8 items-center justify-center rounded-full px-2.5 text-[13px] tabular-nums transition-colors'
  return (
    <nav aria-label="Pagination" className={cn('mt-4 flex flex-wrap items-center justify-between gap-3 text-[13px] text-fg-2', className)}>
      <span>
        Showing <span className="tabular-nums text-fg">{from}–{to}</span> of <span className="tabular-nums text-fg">{total}</span>
      </span>
      {pages > 1 ? (
        <div className="flex items-center gap-1">
          {page > 1 ? (
            <Link href={href(page - 1)} className={cn(btn, 'text-fg hover:bg-white/[0.06]')} aria-label="Previous page">
              <ChevronLeft className="size-4" />
            </Link>
          ) : null}
          {numbers.map((p, i) => (
            <span key={p} className="flex items-center gap-1">
              {i > 0 && p - numbers[i - 1] > 1 ? <span className="px-1">…</span> : null}
              <Link href={href(p)} aria-current={p === page ? 'page' : undefined} className={cn(btn, p === page ? 'bg-control-active text-white' : 'text-fg hover:bg-white/[0.06]')}>
                {p}
              </Link>
            </span>
          ))}
          {page < pages ? (
            <Link href={href(page + 1)} className={cn(btn, 'text-fg hover:bg-white/[0.06]')} aria-label="Next page">
              <ChevronRight className="size-4" />
            </Link>
          ) : null}
        </div>
      ) : null}
    </nav>
  )
}
