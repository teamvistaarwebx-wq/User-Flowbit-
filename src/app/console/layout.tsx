import type { Metadata } from 'next'
import { TooltipProvider } from '@/components/ui/tooltip'

export const metadata: Metadata = { title: { default: 'Console', template: '%s · Flowbit Console' }, robots: { index: false, follow: false } }

/** The Flowbit Console (console.useflowbit.com): Flowbit staff only, its own sign-in and cookie. */
export default function ConsoleRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider>
      <div className="min-h-dvh bg-bg">{children}</div>
    </TooltipProvider>
  )
}
