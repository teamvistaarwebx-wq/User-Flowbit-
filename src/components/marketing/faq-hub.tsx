'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FAQ_CATEGORIES, matchesQuery, type FaqCategory, type FaqItem } from '@/modules/marketing/content/faq'
import { FaqEntry } from './faq-entry'

type Filter = FaqCategory | 'all'

/** Opens the question named in the URL hash, clearing filters so it is on the page. */
function useOpenFromHash(reset: () => void) {
  useEffect(() => {
    const open = () => {
      const id = decodeURIComponent(window.location.hash.slice(1))
      if (!id) return
      reset()
      // Wait one frame so a filtered-out question is rendered again.
      requestAnimationFrame(() => {
        const el = document.getElementById(id)
        if (el instanceof HTMLDetailsElement) {
          el.open = true
          el.scrollIntoView({ block: 'start' })
        }
      })
    }
    const first = requestAnimationFrame(open)
    window.addEventListener('hashchange', open)
    return () => {
      cancelAnimationFrame(first)
      window.removeEventListener('hashchange', open)
    }
  }, [reset])
}

const chipClass = (active: boolean) =>
  cn(
    'shrink-0 rounded-full border px-3.5 py-1.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60',
    active ? 'border-white/40 bg-white/[0.1] text-white' : 'border-line text-white/70 hover:border-white/25 hover:text-white',
  )

/**
 * The /faq hub: search and category chips over every question. The server
 * renders it with no filter, so with JavaScript off every question shows,
 * grouped by category, and each still opens (native `<details>`).
 */
export function FaqHub({ items }: { items: readonly FaqItem[] }) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<Filter>('all')
  const reset = useCallback(() => {
    setQuery('')
    setCategory('all')
  }, [])
  useOpenFromHash(reset)

  const shown = useMemo(() => items.filter((f) => (category === 'all' || f.category === category) && matchesQuery(f, query)), [items, category, query])
  const groups = FAQ_CATEGORIES.map((c) => ({ ...c, items: shown.filter((f) => f.category === c.key) })).filter((g) => g.items.length > 0)
  const countOf = (key: FaqCategory) => items.filter((f) => f.category === key).length

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <div className="relative max-w-xl">
          <label htmlFor="faq-search" className="sr-only">Search the questions</label>
          <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-white/50" aria-hidden />
          <input
            id="faq-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search: payroll, GST, Slack, trial…"
            autoComplete="off"
            className="h-11 w-full rounded-full bg-control pl-11 pr-11 text-sm text-white ring-1 ring-inset ring-white/10 placeholder:text-white/40 focus:outline-none focus:ring-white/40"
          />
          {query ? (
            <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-white/60 hover:bg-white/[0.08] hover:text-white">
              <X className="size-4" aria-hidden />
            </button>
          ) : null}
        </div>
        <div role="group" aria-label="Filter by category" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          <button type="button" aria-pressed={category === 'all'} onClick={() => setCategory('all')} className={chipClass(category === 'all')}>
            All <span className="text-white/50">{items.length}</span>
          </button>
          {FAQ_CATEGORIES.map((c) => (
            <button key={c.key} type="button" aria-pressed={category === c.key} onClick={() => setCategory(c.key)} className={chipClass(category === c.key)}>
              {c.label} <span className="text-white/50">{countOf(c.key)}</span>
            </button>
          ))}
        </div>
        <p aria-live="polite" className="text-sm text-white/60">
          {shown.length === items.length ? `${items.length} questions` : `${shown.length} of ${items.length} questions`}
        </p>
      </div>

      {groups.length === 0 ? (
        <div className="glass rounded-[14px] p-6 text-sm text-white/75">
          Nothing matches “{query}”. Try another word, browse <Link href="/manual" className="text-link hover:text-white">the user manual</Link>, or <Link href="/contact" className="text-link hover:text-white">ask us</Link>.
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.key} id={`c-${g.key}`} aria-labelledby={`c-${g.key}-title`} className="scroll-mt-28">
            <h2 id={`c-${g.key}-title`} className="text-xl font-semibold text-white">{g.label}</h2>
            <p className="mt-1 text-sm text-white/60">{g.blurb}</p>
            <div className="glass mt-4 divide-y divide-white/[0.07] rounded-[14px] p-0">
              {g.items.map((item) => (
                <FaqEntry key={item.id} item={item} href={`#${item.id}`} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  )
}
