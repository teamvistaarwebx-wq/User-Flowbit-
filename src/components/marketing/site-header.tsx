'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ChevronDown, Menu } from 'lucide-react'
import { Button, IconButton } from '@/components/ui/button'
import { Logo } from '@/components/ui/logo'
import { Popover, PopoverClose } from '@/components/ui/popover'
import { Sheet } from '@/components/ui/sheet'
import { PRODUCT_KEYS, PRODUCTS } from '@/lib/catalog'
import { cn } from '@/lib/utils'
import { PRODUCT_CONTENT, productHref } from '@/modules/marketing/content'
import { ProductIcon } from './product-icon'
import { START_FREE_LABEL } from '@/modules/marketing/start-free'

const LINKS = [
  { href: '/pricing', label: 'Pricing' },
  { href: '/contact', label: 'Book a demo' },
]

/** The Help menu: help centre, FAQ and the user manual. */
const HELP_LINKS = [
  { href: '/help', label: 'Help centre', note: 'Guides for every product' },
  { href: '/faq', label: 'FAQ', note: 'Short answers, searchable' },
  { href: '/manual', label: 'User manual', note: 'Step by step, with screenshots' },
]

const isHelpPath = (pathname: string) => HELP_LINKS.some((l) => pathname === l.href || pathname.startsWith(`${l.href}/`))

function HelpList({ onPick, close }: { onPick?: () => void; close?: boolean }) {
  return (
    <ul className="grid gap-1">
      {HELP_LINKS.map((l) => {
        const item = (
          <Link href={l.href} onClick={() => onPick?.()} className="block rounded-[8px] px-3 py-2.5 transition-colors hover:bg-white/[0.05]">
            <span className="block text-sm font-medium text-white">{l.label}</span>
            <span className="block text-xs leading-snug text-[#959596]">{l.note}</span>
          </Link>
        )
        return <li key={l.href}>{close ? <PopoverClose asChild>{item}</PopoverClose> : item}</li>
      })}
    </ul>
  )
}

function ProductList({ onPick, close }: { onPick?: () => void; close?: boolean }) {
  return (
    <ul className="grid gap-1">
      {PRODUCT_KEYS.map((key) => {
        const item = (
          <Link
            href={productHref(key)}
            onClick={() => onPick?.()}
            className="flex items-start gap-3 rounded-[8px] p-3 transition-colors hover:bg-white/[0.05]"
          >
            <ProductIcon product={key} className="mt-0.5" />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-white">{PRODUCTS[key].name}</span>
              <span className="block text-xs leading-snug text-[#959596]">{PRODUCT_CONTENT[key].oneLiner}</span>
            </span>
          </Link>
        )
        return <li key={key}>{close ? <PopoverClose asChild>{item}</PopoverClose> : item}</li>
      })}
    </ul>
  )
}

/** Sticky marketing header: logo, Products menu, Pricing, Help menu, demo, Sign in, Start free. */
export function SiteHeader() {
  const pathname = usePathname()
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Close the mobile menu after any navigation.
  useEffect(() => setMenuOpen(false), [pathname])

  const linkClass = (href: string) =>
    cn('rounded-full px-3.5 py-2 text-sm transition-colors hover:text-white', pathname === href || pathname.startsWith(`${href}/`) ? 'text-white' : 'text-white/70')

  return (
    <header className={cn('sticky top-0 z-40 transition-[background-color,border-color,backdrop-filter] duration-300', scrolled ? 'border-b border-line/70 bg-black/70 backdrop-blur-xl' : 'border-b border-transparent')}>
      <div className="mx-auto flex h-[68px] max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" aria-label="Flowbit home" className="shrink-0">
          <Logo size={30} />
        </Link>

        <nav aria-label="Main" className="ml-4 hidden items-center gap-1 md:flex">
          <Popover
            align="start"
            className="w-[340px] p-2"
            trigger={
              <button type="button" className={cn('inline-flex items-center gap-1', linkClass('/products'), pathname.startsWith('/products') && 'text-white')}>
                Products <ChevronDown className="size-3.5" strokeWidth={1.5} aria-hidden />
              </button>
            }
          >
            <ProductList close />
          </Popover>
          <Link href={LINKS[0].href} className={linkClass(LINKS[0].href)}>
            {LINKS[0].label}
          </Link>
          <Popover
            align="start"
            className="w-[280px] p-2"
            trigger={
              <button type="button" className={cn('inline-flex items-center gap-1', linkClass('/help'), isHelpPath(pathname) && 'text-white')}>
                Help <ChevronDown className="size-3.5" strokeWidth={1.5} aria-hidden />
              </button>
            }
          >
            <HelpList close />
          </Popover>
          {LINKS.slice(1).map((l) => (
            <Link key={l.href} href={l.href} className={linkClass(l.href)}>
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto hidden items-center gap-2 md:flex">
          <Button variant="ghost" href="/login">Sign in</Button>
          <Button variant="primary" href="/signup">{START_FREE_LABEL}</Button>
        </div>

        <div className="ml-auto md:hidden">
          <IconButton label="Open menu" onClick={() => setMenuOpen(true)}>
            <Menu className="size-5" />
          </IconButton>
        </div>
      </div>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen} side="right" title="Menu" className="w-[min(360px,100vw)]">
        <p className="section-label mb-2 px-3">Products</p>
        <ProductList onPick={() => setMenuOpen(false)} />
        <div className="my-4 h-px bg-line" />
        <p className="section-label mb-2 px-3">Help</p>
        <HelpList onPick={() => setMenuOpen(false)} />
        <div className="my-4 h-px bg-line" />
        <div className="grid gap-1">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} onClick={() => setMenuOpen(false)} className="rounded-[8px] px-3 py-2.5 text-sm text-white/80 hover:bg-white/[0.05] hover:text-white">
              {l.label}
            </Link>
          ))}
        </div>
        <div className="mt-6 grid gap-2">
          <Button variant="primary" size="lg" href="/signup">{START_FREE_LABEL}</Button>
          <Button variant="secondary" size="lg" href="/login">Sign in</Button>
        </div>
      </Sheet>
    </header>
  )
}
