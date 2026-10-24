import Link from 'next/link'
import { BrandMesh } from '@/components/ui/brand-mesh'
import { Logo } from '@/components/ui/logo'
import { ProductStrip } from '../_components/product-strip'

const TAGLINE = 'Everything in flow. Nothing in the way'

/**
 * Auth frame (Figma login-desktop-b / login-mobile-dark). Desktop: the moving brand mesh fills the left 45.5%
 * with the white lockup and tagline at its centre; the right is pure black with the glass card. Phones: a
 * 280px mesh hero, then the form on black.
 */
export default function SplitAuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-black lg:grid lg:grid-cols-[45.5%_1fr]">
      <BrandMesh className="sticky top-0 hidden h-dvh lg:block">
        <div className="flex h-full flex-col items-center justify-center px-10 text-white">
          <Link href="/" aria-label="Flowbit" className="block">
            <Logo variant="white" size={70} />
          </Link>
          <p className="mt-4 text-base">{TAGLINE}</p>
        </div>
        <ProductStrip className="absolute inset-x-0 bottom-8 text-center text-[#2c1a5e]" />
      </BrandMesh>

      <BrandMesh className="h-[280px] lg:hidden">
        <div className="flex h-full flex-col items-center pt-[102px] text-white">
          <Link href="/" aria-label="Flowbit" className="block">
            <Logo variant="white" size={49} />
          </Link>
          <p className="mt-[9px] text-[13px]">{TAGLINE}</p>
        </div>
      </BrandMesh>

      <section className="relative flex flex-col items-center overflow-hidden px-7 pb-16 pt-[38px] lg:min-h-dvh lg:justify-center lg:px-10 lg:py-20">{children}</section>
    </div>
  )
}
