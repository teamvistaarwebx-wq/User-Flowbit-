import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { BrandMesh } from '@/components/ui/brand-mesh'
import { buttonClass } from '@/components/ui/button-styles'
import { Logo } from '@/components/ui/logo'
import { cn } from '@/lib/utils'
import { START_FREE_LABEL, START_FREE_SENTENCE } from '@/modules/marketing/start-free'
import { Reveal } from './reveal'

/**
 * Final call to action as the sign-in screen's left panel (Figma login-desktop-b): the drifting brand mesh with
 * the white lockup and the tagline, then the line and two buttons. The mesh is the one moving gradient here.
 */
export function CtaBand({ title = 'Start with everything switched on.', body }: { title?: string; body?: string }) {
  return (
    <section className="px-4 pb-24 pt-8 sm:px-6">
      <Reveal className="mx-auto max-w-6xl">
        <BrandMesh className="rounded-[16px]">
          {/* The mesh turns near-white at the bottom left; a soft indigo shade under the copy keeps it readable. */}
          <div aria-hidden className="pointer-events-none absolute inset-0 rounded-[inherit]" style={{ background: 'radial-gradient(58% 52% at 50% 66%, rgba(33,11,93,0.42) 0%, rgba(33,11,93,0.18) 55%, transparent 80%)' }} />
          <div className="relative flex flex-col items-center px-6 py-16 text-center text-white sm:px-12 sm:py-20">
            <Logo variant="white" size={44} />
            <p className="mt-3 text-sm text-white/90">Everything in flow. Nothing in the way</p>
            <h2 className="mx-auto mt-10 max-w-2xl text-balance text-3xl font-semibold leading-tight text-white [text-shadow:0_1px_18px_rgba(42,21,100,0.35)] sm:text-[40px] sm:leading-[48px]">{title}</h2>
            <p className="mx-auto mt-3 max-w-xl text-pretty text-base text-white/90">
              {body ?? `${START_FREE_SENTENCE} Nothing to install, made for Indian teams.`}
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link href="/signup" className={cn(buttonClass('secondary', 'lg'), 'border-transparent bg-black text-white hover:border-transparent hover:bg-black/80')}>
                {START_FREE_LABEL} <ArrowRight className="size-4" strokeWidth={1.5} />
              </Link>
              <Link href="/contact" className={cn(buttonClass('ghost', 'lg'), 'bg-black/20 text-white ring-1 ring-inset ring-white/55 backdrop-blur-md hover:bg-black/30')}>
                Book a demo
              </Link>
            </div>
          </div>
        </BrandMesh>
      </Reveal>
    </section>
  )
}
