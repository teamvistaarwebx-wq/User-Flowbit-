'use client'

import * as RD from '@radix-ui/react-dialog'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, Building2, CornerDownLeft, FileText, FolderKanban, Handshake, Loader2, ReceiptIndianRupee, Search, SquareCheckBig, Target, UserRound } from 'lucide-react'
import { PAGES, PRODUCTS, pagePermitted, type PageDef } from '@/lib/catalog'
import { cn } from '@/lib/utils'
import { play } from '@/lib/sound'
import { useShell } from './shell-context'

type Hit = { id: string; type: 'page' | 'client' | 'person' | 'task' | 'project' | 'invoice' | 'lead' | 'deal'; title: string; subtitle?: string; href: string }

const DEBOUNCE_MS = 200
const ICONS = { page: FileText, client: Building2, person: UserRound, task: SquareCheckBig, project: FolderKanban, invoice: ReceiptIndianRupee, lead: Target, deal: Handshake }
const AREA_LABEL: Record<string, string> = { core: 'Flowbit', settings: 'Settings', clients: 'Clients', me: 'My HR', work: 'Work', muster: 'Muster', orbit: 'Orbit', folio: 'Folio' }

/** ⌘K palette: jump to any page you can open, or search tasks, projects, clients and people. */
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const shell = useShell()
  const router = useRouter()
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Hit[]>([])
  const [loading, setLoading] = useState(false)
  const [index, setIndex] = useState(0)
  const listRef = useRef<HTMLUListElement>(null)

  const pages = useMemo(
    () =>
      PAGES.filter((p: PageDef) => !p.href.includes('[') && !p.href.startsWith('/c/'))
        .filter((p) => (!p.products || p.products.some(shell.has)) && pagePermitted(p, shell.can) && shell.hasFeature(p.feature))
        .filter((p) => p.area !== 'me' || shell.hasEmployee)
        // WhatsApp pages are 404 while the platform flag is off (lib/feature-flags).
        .filter((p) => shell.features.whatsapp || !(p.href.includes('/whatsapp') || p.href.endsWith('/billing/wallet'))),
    [shell],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        onOpenChange(!open)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onOpenChange])

  useEffect(() => {
    if (!open) return
    play('pop')
    setQ('')
    setResults([])
    setIndex(0)
  }, [open])

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([])
      return
    }
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`, { signal: controller.signal })
        if (res.ok) setResults(((await res.json()) as { hits: Hit[] }).hits)
      } catch {
        // Aborted by the next keystroke.
      } finally {
        setLoading(false)
      }
    }, DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [q])

  const term = q.trim().toLowerCase()
  const pageHits: Hit[] = pages
    .filter((p) => !term || p.title.toLowerCase().includes(term) || AREA_LABEL[p.area]?.toLowerCase().includes(term))
    .slice(0, term ? 8 : 12)
    .map((p) => ({ id: p.href, type: 'page', title: p.title, subtitle: p.products?.length === 1 ? PRODUCTS[p.products[0]].name : AREA_LABEL[p.area], href: p.href }))
  const hits = [...results, ...pageHits]

  const go = (hit: Hit | undefined) => {
    if (!hit) return
    onOpenChange(false)
    router.push(hit.href)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setIndex((i) => Math.min(hits.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setIndex((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      go(hits[index])
    }
  }

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${index}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [index])

  return (
    <RD.Root open={open} onOpenChange={onOpenChange}>
      <RD.Portal>
        <RD.Overlay className="fixed inset-0 z-50 bg-black/55 data-[state=open]:animate-fade-in" />
        <RD.Content className="glass-hero lit-edge fixed left-1/2 top-[12vh] z-50 w-[calc(100vw-32px)] max-w-xl -translate-x-1/2 overflow-hidden [--hero-fill:rgba(30,30,30,0.86)] shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9)] data-[state=open]:animate-scale-in" onKeyDown={onKeyDown}>
          <RD.Title className="sr-only">Search Flowbit</RD.Title>
          <RD.Description className="sr-only">Jump to a page or search your workspace</RD.Description>
          <div className="flex items-center gap-3 border-b border-white/[0.1] px-5">
            {loading ? <Loader2 className="size-4 animate-spin text-fg-3" /> : <Search className="size-4 text-fg-3" />}
            <input
              autoFocus
              value={q}
              onChange={(e) => {
                setQ(e.target.value)
                setIndex(0)
              }}
              placeholder="Search tasks, projects, clients, people, invoices, leads, deals and pages…"
              className="h-14 flex-1 bg-transparent text-[15px] text-fg placeholder:text-fg-4 focus:outline-none"
              aria-label="Search"
            />
            <kbd className="rounded-[5px] border border-white/[0.12] px-1.5 py-0.5 font-sans text-[11px] text-fg-3">Esc</kbd>
          </div>
          <ul ref={listRef} className="max-h-[52vh] overflow-y-auto p-2" role="listbox">
            {hits.length === 0 ? <li className="px-4 py-10 text-center text-sm text-fg-3">{term.length >= 2 && !loading ? `Nothing matches "${q}".` : 'Type to search.'}</li> : null}
            {hits.map((hit, i) => {
              const Icon = ICONS[hit.type]
              const first = i === 0 || hits[i - 1].type === 'page' !== (hit.type === 'page')
              return (
                <li key={`${hit.type}-${hit.id}`} data-index={i}>
                  {first ? <div className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-[0.06em] text-fg-3">{hit.type === 'page' ? 'Go to' : 'Results'}</div> : null}
                  <button
                    type="button"
                    role="option"
                    aria-selected={i === index}
                    onMouseEnter={() => setIndex(i)}
                    onClick={() => go(hit)}
                    className={cn('flex w-full items-center gap-3 rounded-[8px] px-3 py-2 text-left transition-colors', i === index ? 'bg-white/[0.07] text-fg' : 'text-fg')}
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center text-icon-muted">
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{hit.title}</span>
                      {hit.subtitle ? <span className="block truncate text-xs text-fg-2">{hit.subtitle}</span> : null}
                    </span>
                    {i === index ? <CornerDownLeft className="size-3.5 text-fg-3" /> : <ArrowRight className="size-3.5 text-transparent" />}
                  </button>
                </li>
              )
            })}
          </ul>
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  )
}
