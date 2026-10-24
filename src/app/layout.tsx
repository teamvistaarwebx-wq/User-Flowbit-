import type { Metadata, Viewport } from 'next'
import { Work_Sans } from 'next/font/google'
import { Toaster } from 'sonner'
import { appUrl } from '@/lib/env'
import './globals.css'

const workSans = Work_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-work-sans', display: 'swap' })

export const metadata: Metadata = {
  metadataBase: new URL(appUrl()),
  title: { default: 'Flowbit — Everything in flow', template: '%s · Flowbit' },
  description: 'Flowbit is one workspace to run an Indian business: tasks and projects, HR and payroll, sales, and billing. One login instead of four apps.',
  applicationName: 'Flowbit',
  // Home-screen install on iPhone (the icon comes from app/apple-icon.png, the manifest from app/manifest.ts).
  appleWebApp: { capable: true, title: 'Flowbit', statusBarStyle: 'black' },
}

export const viewport: Viewport = {
  themeColor: '#171717',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
  // Draw under the iPhone notch and home bar; the shell pads itself with env(safe-area-inset-*).
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" className={`${workSans.variable} dark`} style={{ colorScheme: 'dark' }} suppressHydrationWarning>
      <body className="min-h-dvh bg-bg font-sans text-fg antialiased">
        {children}
        <Toaster
          theme="dark"
          position="bottom-right"
          closeButton
          gap={10}
          mobileOffset={{ bottom: 'calc(92px + env(safe-area-inset-bottom))' }}
          toastOptions={{
            style: {
              background: '#1F1F1F',
              border: '1px solid rgba(255,255,255,0.12)',
              color: '#FFFFFF',
              borderRadius: 10,
              fontFamily: 'var(--font-work-sans), system-ui, sans-serif',
              fontSize: 14,
              boxShadow: '0 18px 48px -18px rgba(0,0,0,0.75)',
            },
            classNames: {
              success: '[&_[data-icon]]:text-[#08AD93]',
              error: '[&_[data-icon]]:text-[#FF4540]',
              description: '!text-[#A3A1A4]',
            },
          }}
        />
      </body>
    </html>
  )
}
