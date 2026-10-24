import type { CSSProperties, ReactNode } from 'react'
import Image from 'next/image'
import { contrastRatio } from '@/lib/brand-theme'
import type { PublicBrand } from '@/modules/doclinks/view-types'

/**
 * The client-facing page frame: the workspace's own logo, name and brand
 * colour on Flowbit's dark surfaces (DESIGN tokens), outside the app shell.
 * `--doc-brand` / `--doc-ink` colour the primary buttons and accents.
 */

/** White or near-black text, whichever reads better on the brand colour. */
export const inkOn = (hex: string): string => (contrastRatio(hex, '#ffffff') >= 3 ? '#ffffff' : '#111014')

export function PublicShell({ brand, children }: { brand: PublicBrand; children: ReactNode }) {
  const style = { '--doc-brand': brand.color, '--doc-ink': inkOn(brand.color) } as CSSProperties
  return (
    <main style={style} className="relative min-h-dvh overflow-hidden bg-black px-4 py-8 sm:py-14">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute left-[78%] top-0 h-[900px] w-[900px] -translate-x-1/2 -translate-y-1/2 opacity-40 [background:radial-gradient(closest-side,var(--doc-brand),transparent)]" />
      </div>
      <div className="relative mx-auto max-w-3xl space-y-4">
        <header className="flex items-center gap-3">
          {brand.logoSrc ? (
            // unoptimized: a data URI of the workspace's own logo
            <Image src={brand.logoSrc} alt="" width={44} height={44} unoptimized className="size-11 rounded-xl bg-white object-contain p-1" />
          ) : (
            <span className="flex size-11 items-center justify-center rounded-xl text-lg font-semibold" style={{ background: 'var(--doc-brand)', color: 'var(--doc-ink)' }}>
              {brand.name.slice(0, 1).toUpperCase()}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-white">{brand.name}</p>
            {brand.legalName && brand.legalName !== brand.name ? <p className="truncate text-xs text-white/60">{brand.legalName}</p> : null}
          </div>
        </header>
        {children}
        <footer className="space-y-1 pt-4 text-center text-xs text-white/50">
          {[brand.addressLines.join(', '), brand.gstin ? `GSTIN ${brand.gstin}` : null, brand.email, brand.phone].filter(Boolean).map((line) => (
            <p key={line}>{line}</p>
          ))}
          <p>Sent securely with Flowbit</p>
        </footer>
      </div>
    </main>
  )
}

/** A primary action in the workspace's colour (links to Pay now, PDF). */
export function BrandButton({ href, children, download }: { href: string; children: ReactNode; download?: boolean }) {
  return (
    <a
      href={href}
      download={download || undefined}
      rel="noopener noreferrer"
      target={download ? undefined : '_blank'}
      className="press inline-flex h-11 items-center justify-center gap-2 rounded-full px-6 text-sm font-semibold transition-opacity hover:opacity-90 [&_svg]:size-4"
      style={{ background: 'var(--doc-brand)', color: 'var(--doc-ink)' }}
    >
      {children}
    </a>
  )
}

export function PublicCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`glass-hero lit-edge-bright px-5 py-6 sm:px-8 sm:py-7 ${className}`}>{children}</section>
}

export function Unavailable({ title, body, action }: { title: string; body: string; action?: { href: string; label: string } }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-black px-4">
      <section className="glass-hero lit-edge-bright max-w-md px-6 py-8 text-center">
        <h1 className="text-xl font-semibold text-white">{title}</h1>
        <p className="mt-2 text-sm text-white/70">{body}</p>
        {action ? (
          <a href={action.href} className="press mt-5 inline-flex h-11 items-center justify-center rounded-full bg-white px-6 text-sm font-semibold text-black transition-opacity hover:opacity-90">
            {action.label}
          </a>
        ) : null}
      </section>
    </main>
  )
}
