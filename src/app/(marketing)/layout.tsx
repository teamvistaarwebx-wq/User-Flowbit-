import type { Metadata } from 'next'
import { SiteFooter } from '@/components/marketing/site-footer'
import { SiteHeader } from '@/components/marketing/site-header'
import { appUrl } from '@/lib/env'

export const metadata: Metadata = {
  metadataBase: new URL(appUrl()),
  openGraph: { type: 'website', siteName: 'Flowbit', locale: 'en_IN' },
  twitter: { card: 'summary_large_image' },
}

/** Public website frame: sticky header, content, footer. Pure black, as the Figma sign-in screens. */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col overflow-x-clip bg-black">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50 focus:rounded-full focus:bg-control focus:px-4 focus:py-2 focus:text-sm">
        Skip to content
      </a>
      <SiteHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  )
}
