import Link from 'next/link'
import { Logo } from '@/components/ui/logo'
import { PRODUCT_KEYS, PRODUCTS } from '@/lib/catalog'
import { productHref } from '@/modules/marketing/content'
import { COMPANY_BRAND_LINE, COMPANY_LEGAL_NAME } from '@/lib/company'
import { START_FREE_LABEL } from '@/modules/marketing/start-free'

const COLUMNS = [
  { title: 'Products', links: PRODUCT_KEYS.map((k) => ({ href: productHref(k), label: PRODUCTS[k].name })) },
  { title: 'Help', links: [{ href: '/help', label: 'Help centre' }, { href: '/faq', label: 'FAQ' }, { href: '/manual', label: 'User manual' }, { href: '/status', label: 'Status' }] },
  { title: 'Company', links: [{ href: '/pricing', label: 'Pricing' }, { href: '/security', label: 'Security' }, { href: '/compare-v1-v2', label: 'Flowbit 1 and 2' }, { href: '/contact', label: 'Book a demo' }, { href: '/signup', label: START_FREE_LABEL }, { href: '/login', label: 'Sign in' }] },
  { title: 'Legal', links: [{ href: '/legal/terms', label: 'Terms of service' }, { href: '/legal/privacy', label: 'Privacy policy' }, { href: '/legal/refunds', label: 'Refunds & cancellation' }, { href: '/legal/dpa', label: 'Data processing' }] },
] as const

/** Marketing footer with product, help, company and legal links. */
export function SiteFooter() {
  return (
    <footer className="relative border-t border-line/70 bg-black px-4 pb-10 pt-14 sm:px-6">
      <div className="mx-auto grid max-w-6xl gap-10 sm:grid-cols-2 md:grid-cols-[1.4fr_repeat(4,1fr)]">
        <div className="max-w-xs">
          <Logo size={30} />
          <p className="mt-4 text-sm leading-relaxed text-white/75">Work, HR and payroll, sales and billing in one workspace for Indian teams of up to 150.</p>
          <p className="mt-4 text-sm text-[#979797]">A Flowbit product. Built by the team at Vistaar WebX.</p>
        </div>
        {COLUMNS.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <p className="text-xs font-semibold uppercase tracking-[0.06em] text-white">{col.title}</p>
            <ul className="mt-4 grid gap-2.5">
              {col.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm text-white/70 transition-colors hover:text-white">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="mx-auto mt-12 flex max-w-6xl flex-col gap-2 border-t border-line/70 pt-6 text-xs text-[#979797] sm:flex-row sm:items-center sm:justify-between">
        <span>© {new Date().getFullYear()} {COMPANY_LEGAL_NAME}. {COMPANY_BRAND_LINE} Prices in INR, excluding GST.</span>
        <span>Made in India · IST everywhere</span>
      </div>
    </footer>
  )
}
