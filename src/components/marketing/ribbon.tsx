import type { CSSProperties } from 'react'
import Image from 'next/image'
import { cn } from '@/lib/utils'

/**
 * The glossy 3D ribbons from the Figma sign-in frame (public/brand/ribbons, extracted at 2x on black), for the
 * marketing site. A local copy of the auth ribbon so the public site and the sign-in screen share one material.
 */
const RIBBONS = {
  top: { src: '/brand/ribbons/auth-elbow-top.png', width: 203, height: 175 },
  bottom: { src: '/brand/ribbons/auth-elbow-bottom.png', width: 215, height: 180 },
} as const

/**
 * One ribbon, screen-blended so its black backing disappears. Put it under a glass panel: the panel's backdrop
 * blur gives the soft glow where they overlap. Floats ±6px / ±1.5deg on a 14s or 17s loop, never in sync.
 */
export function Ribbon({ name, className, style, phase = 'a' }: { name: keyof typeof RIBBONS; className?: string; style?: CSSProperties; phase?: 'a' | 'b' }) {
  const r = RIBBONS[name]
  return (
    <Image
      src={r.src}
      alt=""
      aria-hidden
      draggable={false}
      width={r.width}
      height={r.height}
      className={cn('pointer-events-none absolute select-none mix-blend-screen will-change-transform', className)}
      style={{ width: r.width, height: r.height, animation: phase === 'a' ? 'ribbon-float 14s var(--ease-in-out) infinite' : 'ribbon-float-b 17s var(--ease-in-out) -5s infinite', ...style }}
    />
  )
}
