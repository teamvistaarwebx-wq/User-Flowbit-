import type { CSSProperties, ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** One soft colour point of the mesh: a radial blob that drifts on its own slow loop (transform only). */
function Blob({ style, color, motion }: { style: CSSProperties; color: string; motion: string }) {
  return <span aria-hidden className="absolute will-change-transform" style={{ ...style, background: `radial-gradient(closest-side, ${color})`, animation: motion }} />
}

/**
 * The Flowbit brand mesh (DESIGN 3.1), sampled from the Figma sign-in panel: deep indigo at the top-left, dusty
 * lavender at the top-right, orchid on the right a little below the middle, near-white at the bottom-left.
 * Each point drifts on its own loop (38/46/52s, a few percent), so it is felt rather than noticed.
 * Under reduced motion every loop stops at its first frame.
 */
export function BrandMesh({ className, children, style }: { className?: string; children?: ReactNode; style?: CSSProperties }) {
  return (
    <div
      className={cn('relative isolate overflow-hidden', className)}
      style={{ background: 'linear-gradient(180deg, #2D1866 0%, #34206B 18%, #5E4C8A 40%, #ABA0C4 60%, #E2DDEA 80%, #FAFAFC 100%)', ...style }}
    >
      <Blob color="#C987BB 0%, rgba(201,135,187,0.9) 38%, rgba(201,135,187,0) 100%" style={{ left: '30%', top: '-2%', width: '118%', height: '128%' }} motion="blob-b 46s var(--ease-in-out) infinite" />
      <Blob color="#9C84B2 0%, rgba(156,132,178,0.8) 35%, rgba(156,132,178,0) 100%" style={{ right: '-36%', top: '-36%', width: '78%', height: '84%' }} motion="blob-c 52s var(--ease-in-out) infinite" />
      <Blob color="#2A1564 0%, rgba(42,21,100,0.92) 34%, rgba(42,21,100,0) 100%" style={{ left: '-30%', top: '-34%', width: '94%', height: '80%' }} motion="blob-a 38s var(--ease-in-out) infinite" />
      <Blob color="#FCFCFE 0%, rgba(252,252,254,0.7) 30%, rgba(252,252,254,0) 100%" style={{ left: '-36%', bottom: '-40%', width: '84%', height: '70%' }} motion="blob-c 52s var(--ease-in-out) -26s infinite reverse" />
      <div className="relative z-10 h-full">{children}</div>
    </div>
  )
}
