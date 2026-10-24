import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowRight, BookOpenCheck, CircleQuestionMark, CircleSlash, Footprints, LayoutGrid, Network, Tag } from 'lucide-react'
import { accentOf } from '@/components/marketing/accent'
import { CtaBand } from '@/components/marketing/cta-band'
import { FaqList } from '@/components/marketing/faq-list'
import { HowToUse } from '@/components/marketing/how-to-use'
import { Mesh } from '@/components/marketing/mesh'
import { Mock } from '@/components/marketing/mocks'
import { PricingSection } from '@/components/marketing/pricing-section'
import { FeatureGrid, NotYet, SpotlightRow, Steps, WorksWith } from '@/components/marketing/product-sections'
import { Section } from '@/components/marketing/section'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { PRODUCT_KEYS, PRODUCTS } from '@/lib/catalog'
import { PLAN_PRICES } from '@/lib/plans'
import { PRODUCT_CONTENT, isProductKey } from '@/modules/marketing/content'
import { productFaq } from '@/modules/marketing/content/faq'
import { PRODUCT_HOW_TO } from '@/modules/marketing/content/help'
import { rupees } from '@/modules/marketing/pricing'
import { pageMetadata } from '@/modules/marketing/seo'
import { START_FREE_LABEL, START_FREE_NOTE } from '@/modules/marketing/start-free'

type Props = { params: Promise<{ slug: string }> }

export const dynamicParams = false

export function generateStaticParams() {
  return PRODUCT_KEYS.map((slug) => ({ slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  if (!isProductKey(slug)) return {}
  const { seo } = PRODUCT_CONTENT[slug]
  return pageMetadata({ title: seo.title, description: seo.description, path: `/products/${slug}` })
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params
  if (!isProductKey(slug)) notFound()
  const product = PRODUCTS[slug]
  const content = PRODUCT_CONTENT[slug]
  const accent = accentOf(slug)

  return (
    <>
      <section className="relative isolate overflow-hidden px-4 pb-16 pt-14 sm:px-6 sm:pt-20">
        <Mesh className="-z-10" />
        <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          <div>
            <p className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.06em] text-white/70">
              <Icon name={product.icon} className="size-4" strokeWidth={1.5} style={{ color: accent }} /> {product.name} · {content.eyebrow}
            </p>
            <h1 className="mt-5 text-balance text-[40px] font-semibold leading-[1.08] text-white sm:text-[52px]">
              <span className="text-name">{product.name}</span>
              <span className="block">{content.oneLiner}</span>
            </h1>
            <p className="mt-6 max-w-xl text-pretty text-lg leading-relaxed text-white/75">{content.sub}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button variant="primary" size="lg" href="/signup" iconRight={<ArrowRight className="size-4" />}>{START_FREE_LABEL}</Button>
              <Button variant="secondary" size="lg" href="/contact">Book a demo</Button>
            </div>
            <p className="mt-5 text-[13px] text-[#979797]">{START_FREE_NOTE} · No card needed</p>
          </div>
          <div className="min-w-0">
            <Mock name={content.heroMock} />
          </div>
        </div>
      </section>

      <Section id="features" label="What you get" icon={<LayoutGrid />} title={`Everything in ${product.name}`} description={product.description}>
        <FeatureGrid content={content} />
      </Section>

      <section className="px-4 py-12 sm:px-6">
        <div className="mx-auto grid max-w-6xl gap-24">
          {content.spotlights.map((s, i) => (
            <SpotlightRow key={s.mock} spotlight={s} product={slug} flip={i % 2 === 1} />
          ))}
        </div>
      </section>

      <Section id="how" label="How it works" icon={<Footprints />} title={`Up and running with ${product.name}`}>
        <Steps steps={content.steps} />
      </Section>

      <Section id="how-to-use" label="How to use" icon={<BookOpenCheck />} title={`How to use ${product.name}`} description="The tasks you will do most, each with a step-by-step guide in the user manual." center>
        <HowToUse howTo={PRODUCT_HOW_TO[slug]} accent={accent} />
      </Section>

      <Section id="connects" label="Works with the rest of Flowbit" icon={<Network />} title="Better with the other three" description="Same login, same client list, same people. Nothing to sync.">
        <WorksWith items={content.worksWith} />
      </Section>

      <Section id="not-yet" label="Honest list" icon={<CircleSlash />} title="What it doesn’t do (yet)" description="So you can decide quickly, here is what is not built today.">
        <NotYet items={content.notYet} />
      </Section>

      <Section id="pricing" label="Pricing" icon={<Tag />} title={`${product.name} pricing`} description={`${content.pricingNote} Or take Suite: all four products for ${rupees(PLAN_PRICES.suite.monthlyPaise)} per person a month.`} center>
        <PricingSection only={[...content.plans, 'suite']} calculator={false} />
      </Section>

      <Section id="faq" label="Questions" icon={<CircleQuestionMark />} title={`${product.name} questions`} center>
        <div className="mx-auto max-w-3xl">
          <FaqList items={productFaq(slug)} />
          <p className="mt-5 text-center text-sm">
            <Link href="/faq" className="inline-flex items-center gap-1.5 text-link hover:text-white">All questions <ArrowRight className="size-3.5" aria-hidden /></Link>
          </p>
        </div>
      </Section>

      <CtaBand title={`Try ${product.name} with the rest of Flowbit.`} />
    </>
  )
}
