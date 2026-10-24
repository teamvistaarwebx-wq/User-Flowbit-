import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Ribbon } from './ribbon'

/**
 * The sign-in card (Figma login-desktop-b): 508 wide glass on black, radius 16, a lit hairline brighter on the
 * left and bottom, the two elbow ribbons bent behind its right corners. On phones the form sits straight on
 * black under the mesh hero, as the iPhone frame. `footer` renders under the card (e.g. "Create an account").
 */
export function AuthCard({ title, brandWord = 'Flowbit', subtitle, children, className, footer }: { title: string; brandWord?: string | null; subtitle?: ReactNode; children: ReactNode; className?: string; footer?: ReactNode }) {
  return (
    <div className={cn('relative w-full max-w-[347px] lg:max-w-[508px]', className)}>
      {/* The top ribbon's arm comes in from above and fades out, so it never ends in mid-air on a tall screen. */}
      <Ribbon name="authTop" className="hidden lg:block" style={{ right: -119, top: -86.5, maskImage: 'linear-gradient(to bottom, transparent 0%, #000 34%)' }} />
      <Ribbon name="authBottom" phase="b" className="hidden lg:block" style={{ right: -124, bottom: -101, maskImage: 'linear-gradient(to top, transparent 0%, #000 40%)' }} />
      <div className="relative lg:glass-hero lg:edge-stroke lg:px-[84px] lg:pb-[46px] lg:pt-[46px] lg:[--stroke:linear-gradient(200deg,rgba(255,255,255,0.3)_0%,rgba(255,255,255,0.32)_40%,rgba(255,255,255,0.46)_75%,rgba(255,255,255,0.5)_100%)] animate-scale-in">
        <h1 className="text-balance text-center text-2xl font-semibold leading-tight text-fg lg:-mx-12 lg:text-[40px] lg:leading-[48px] lg:tracking-[-0.005em]">
          {title}{' '}
          {brandWord ? <span className="bg-[image:var(--grad-brand-word)] bg-clip-text text-transparent">{brandWord}</span> : null}
        </h1>
        {subtitle ? <p className="mt-3 text-center text-[13px] text-fg lg:mt-[14px] lg:text-[15px]">{subtitle}</p> : null}
        <div className="mt-[50px] lg:mt-9">{children}</div>
      </div>
      {footer ? <div className="relative mt-7 text-center text-sm text-fg-2">{footer}</div> : null}
    </div>
  )
}

/** "Or continue with" between two #5F5F5F rules. */
export function OrDivider({ label = 'Or continue with' }: { label?: string }) {
  return (
    <div className="my-[30px] flex items-center gap-[18px] text-sm text-fg lg:my-[26px]">
      <span className="hidden h-px flex-1 bg-[#5F5F5F] lg:block" />
      <span className="mx-auto lg:mx-0">{label}</span>
      <span className="hidden h-px flex-1 bg-[#5F5F5F] lg:block" />
    </div>
  )
}

/** The auth field look: 48px black pills with a light hairline on phones, 42px #1D1D1D with #4A4A4A on desktop. */
export const authInput = 'h-12 border-[#A3A3A3] bg-black hover:border-white/60 lg:h-[42px] lg:border-[#4A4A4A] lg:bg-[#1D1D1D] lg:hover:border-[#6a6a6a]'

/** Error banner at the top of an auth form. */
export function AuthError({ children }: { children: ReactNode }) {
  return <p className="mb-5 rounded-[10px] border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-[#FF8A86]">{children}</p>
}
