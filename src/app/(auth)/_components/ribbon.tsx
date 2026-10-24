import type { CSSProperties } from 'react'
import Image from 'next/image'
import { cn } from '@/lib/utils'

/** The glossy 3D ribbons from the Figma, extracted at 2x on black (public/brand/ribbons), sized in design px. */
export const RIBBONS = {
  authTop: { src: '/brand/ribbons/auth-elbow-top.png', width: 203, height: 175 },
  authBottom: { src: '/brand/ribbons/auth-elbow-bottom.png', width: 215, height: 180 },
  onboardingLeft: { src: '/brand/ribbons/onboarding-left-outer.png', width: 113, height: 232 },
  onboardingRight: { src: '/brand/ribbons/onboarding-right-outer.png', width: 61.5, height: 215 },
} as const

export type RibbonName = keyof typeof RIBBONS

/**
 * One ribbon, screen-blended so its black backing disappears on the dark page. It sits under the glass card, so
 * the card's backdrop blur gives the soft glow where they overlap. It floats ±6px / ±1.5deg on a 14s or 17s
 * loop (`phase` picks which), never in sync with its partner.
 */
export function Ribbon({ name, className, style, phase = 'a' }: { name: RibbonName; className?: string; style?: CSSProperties; phase?: 'a' | 'b' }) {
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
