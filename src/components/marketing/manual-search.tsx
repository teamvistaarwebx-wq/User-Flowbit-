'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { excerpt, searchTopics } from '@/modules/manual/parse'

export type ManualSearchEntry = { slug: string; chapter: string; id: string; title: string; text: string }

/** Searches every topic of the manual in the browser; results link to the topic on its chapter page. */
export function ManualSearch({ entries }: { entries: ManualSearchEntry[] }) {
  const [query, setQuery] = useState('')
  const results = useMemo(() => searchTopics(entries, query), [entries, query])
  const searching = query.trim().length > 1
  return (
    <div className="space-y-3">
      <Input
        type="search"
        aria-label="Search the manual"
        placeholder="Search the manual, for example payslip, GST or leave"
        icon={<Search className="size-4" />}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {searching ? (
        <div role="region" aria-live="polite" aria-label="Search results" className="rounded-[12px] border border-line bg-white/[0.03]">
          {results.length ? (
            <ul className="divide-y divide-line">
              {results.map((r) => (
                <li key={`${r.slug}-${r.id}`}>
                  <Link href={`/manual/${r.slug}#${r.id}`} className="block px-4 py-3 transition-colors hover:bg-white/[0.04]">
                    <span className="block text-xs uppercase tracking-[0.06em] text-[#979797]">{r.chapter}</span>
                    <span className="block text-sm font-medium text-white">{r.title}</span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-white/60">{excerpt(r.text, query)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-3 text-sm text-white/70">Nothing matches &ldquo;{query.trim()}&rdquo;. Try a shorter word.</p>
          )}
        </div>
      ) : null}
    </div>
  )
}
