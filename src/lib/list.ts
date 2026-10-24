/**
 * URL-driven list state (?page=&q=&sort=&dir=). Server components read it,
 * DataTable / Pagination / SearchInput write it.
 */

export type SearchParams = Record<string, string | string[] | undefined>

export type ListParams = {
  page: number
  pageSize: number
  skip: number
  q: string
  sort: string | null
  dir: 'asc' | 'desc'
  /** Reads any other single-valued param. */
  get: (key: string) => string | undefined
  raw: SearchParams
}

export const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)

export function parseListParams(sp: SearchParams, opts: { pageSize?: number; sort?: string; dir?: 'asc' | 'desc' } = {}): ListParams {
  const pageSize = opts.pageSize ?? 20
  const page = Math.max(1, Number.parseInt(first(sp.page) ?? '1', 10) || 1)
  const dirParam = first(sp.dir)
  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    q: (first(sp.q) ?? '').trim(),
    sort: first(sp.sort) ?? opts.sort ?? null,
    dir: dirParam === 'asc' || dirParam === 'desc' ? dirParam : (opts.dir ?? 'desc'),
    get: (key) => first(sp[key]),
    raw: sp,
  }
}

/** Mongo sort object from list params: { createdAt: -1 }. */
export const mongoSort = (p: Pick<ListParams, 'sort' | 'dir'>, fallback: Record<string, 1 | -1> = { createdAt: -1 }) =>
  p.sort ? { [p.sort]: p.dir === 'asc' ? 1 : -1 } as Record<string, 1 | -1> : fallback

/** A href with some params changed; undefined/'' removes a param. */
export function buildHref(basePath: string, current: SearchParams, patch: Record<string, string | number | undefined | null>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(current)) {
    const v = first(value)
    if (v !== undefined && v !== '') params.set(key, v)
  }
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === null || value === '') params.delete(key)
    else params.set(key, String(value))
  }
  const qs = params.toString()
  return qs ? `${basePath}?${qs}` : basePath
}

export const totalPages = (total: number, pageSize: number) => Math.max(1, Math.ceil(total / pageSize))
