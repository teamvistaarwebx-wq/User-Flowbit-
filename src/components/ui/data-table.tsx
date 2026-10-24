import Link from 'next/link'
import type { ReactNode } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { buildHref, type SearchParams } from '@/lib/list'

export type Column<Row> = {
  key: string
  header: ReactNode
  /** Cell renderer; defaults to row[key]. */
  cell?: (row: Row) => ReactNode
  /** Allow sorting by this key (?sort=key&dir=asc|desc). */
  sortable?: boolean
  align?: 'left' | 'right' | 'center'
  className?: string
  /** Hide below the sm breakpoint. */
  hideOnMobile?: boolean
}

export type DataTableProps<Row> = {
  columns: Column<Row>[]
  rows: Row[]
  rowKey: (row: Row) => string
  /** Makes each row a link. */
  rowHref?: (row: Row) => string
  /** Current page path and params, for sort links. */
  basePath?: string
  params?: SearchParams
  empty?: ReactNode
  className?: string
  /** Extra classes per row (e.g. highlight overdue). */
  rowClassName?: (row: Row) => string | undefined
  footer?: ReactNode
}

const ALIGN = { left: 'text-left', right: 'text-right', center: 'text-center' }

/**
 * Server-friendly table (no client JS). Sorting is URL-driven: pass
 * `basePath` + `params` and mark columns `sortable`. Pair with SearchInput
 * and Pagination. Use it from server components (cell functions run there).
 */
export function DataTable<Row>({ columns, rows, rowKey, rowHref, basePath, params = {}, empty, className, rowClassName, footer }: DataTableProps<Row>) {
  const sort = typeof params.sort === 'string' ? params.sort : undefined
  const dir = params.dir === 'asc' ? 'asc' : 'desc'

  const header = (col: Column<Row>) => {
    if (!col.sortable || !basePath) return col.header
    const active = sort === col.key
    const nextDir = active && dir === 'desc' ? 'asc' : 'desc'
    const Icon = !active ? ArrowUpDown : dir === 'asc' ? ArrowUp : ArrowDown
    return (
      <Link href={buildHref(basePath, params, { sort: col.key, dir: nextDir, page: undefined })} className={cn('inline-flex items-center gap-1 hover:text-white', active && 'font-medium')}>
        {col.header}
        <Icon className="size-3 text-fg-3" />
      </Link>
    )
  }

  return (
    <div className={cn('card-table overflow-hidden p-0', className)}>
      <div className="relative overflow-x-auto">
        {/* On a phone the table scrolls sideways rather than squeezing every cell into a column of single words. */}
        <table className="w-full border-collapse text-[13px] max-sm:[&_td]:whitespace-nowrap">
          <thead>
            <tr className="border-b border-line">
              {columns.map((col) => (
                <th key={col.key} scope="col" className={cn('h-[33px] whitespace-nowrap px-4 text-sm font-normal text-fg', ALIGN[col.align ?? 'left'], col.hideOnMobile && 'hidden sm:table-cell', col.className)}>
                  {header(col)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4">
                  {empty ?? <p className="py-10 text-center text-sm text-fg-3">Nothing here yet.</p>}
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const href = rowHref?.(row)
                return (
                  <tr key={rowKey(row)} className={cn('group relative transition-colors hover:bg-white/[0.04]', rowClassName?.(row))}>
                    {columns.map((col, i) => (
                      <td key={col.key} className={cn('h-11 px-4 align-middle text-fg', ALIGN[col.align ?? 'left'], col.hideOnMobile && 'hidden sm:table-cell', col.className)}>
                        {i === 0 && href ? (
                          <Link href={href} className="text-fg after:absolute after:inset-0 after:content-['']">
                            {col.cell ? col.cell(row) : String((row as Record<string, unknown>)[col.key] ?? '—')}
                          </Link>
                        ) : (
                          <span className={cn(href && 'relative z-10')}>{col.cell ? col.cell(row) : String((row as Record<string, unknown>)[col.key] ?? '—')}</span>
                        )}
                      </td>
                    ))}
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
      {footer ? <div className="border-t border-line px-4 py-3">{footer}</div> : null}
    </div>
  )
}
