'use client'

import { useEffect } from 'react'
import { Work_Sans } from 'next/font/google'
import './globals.css'

const workSans = Work_Sans({ subsets: ['latin'], weight: ['400', '600'], variable: '--font-work-sans', display: 'swap' })

/**
 * Replaces the root layout when it fails, so it brings its own document, styles and font.
 * Plain markup only: the components that failed may be the ones this would import.
 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error('[root] layout error', error.digest ?? error.message)
  }, [error])
  return (
    <html lang="en-IN" className={`${workSans.variable} dark`} style={{ colorScheme: 'dark' }}>
      <body className="min-h-dvh bg-bg font-sans text-fg antialiased">
        <title>Something went wrong · Flowbit</title>
        <main className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-grad-mauve px-6 text-center" role="alert">
          {/* eslint-disable-next-line @next/next/no-img-element -- static vector mark, no layout dependencies */}
          <img src="/brand/flowbit-mark-gradient.svg" alt="" width={56} height={58} />
          <h1 className="text-3xl font-semibold text-fg">Flowbit hit a problem</h1>
          <p className="max-w-md text-sm text-fg-2">Nothing you saved was lost. Try again, and if it keeps happening, reload the page in a minute.</p>
          <div className="flex gap-2">
            <button type="button" onClick={retry} className="rounded-full bg-grad-button px-5 py-2.5 text-sm font-semibold text-white">
              Try again
            </button>
            {/* A full page load on purpose: the client router is what may have failed. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" className="rounded-full border border-strong px-5 py-2.5 text-sm text-fg hover:bg-surface-2">
              Flowbit home
            </a>
          </div>
        </main>
      </body>
    </html>
  )
}
