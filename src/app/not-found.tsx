import Link from 'next/link'
import { BurstMark } from '@/components/ui/logo'

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-grad-mauve px-6 text-center">
      <BurstMark size={56} animated />
      <h1 className="text-3xl font-semibold text-fg">This page drifted out of flow</h1>
      <p className="max-w-md text-sm text-fg-2">The link may be old or the page was moved. Head back and pick up where you left off.</p>
      <div className="flex gap-2">
        <Link href="/app" className="shimmer rounded-full bg-grad-button px-5 py-2.5 text-sm font-semibold text-white">
          Go to your workspace
        </Link>
        <Link href="/" className="rounded-full border border-strong px-5 py-2.5 text-sm text-fg hover:bg-surface-2">
          Flowbit home
        </Link>
      </div>
    </main>
  )
}
