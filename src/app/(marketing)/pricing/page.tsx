import Link from 'next/link'
import { ArrowRight, CircleQuestionMark, Table2, Tag } from 'lucide-react'
import { CompareTable } from '@/components/marketing/compare-table'
import { CtaBand } from '@/components/marketing/cta-band'
import { FaqList } from '@/components/marketing/faq-list'
import { Mesh } from '@/components/marketing/mesh'
import { PricingSection } from '@/components/marketing/pricing-section'
import { Section } from '@/components/marketing/section'
import { SectionLabel } from '@/components/ui/card'
import { GST_PERCENT, PLAN_PRICES, TRIAL_DAYS } from '@/lib/plans'
import { PRICING_FAQ } from '@/modules/marketing/content/faq'
import { lowestMonthly, rupees } from '@/modules/marketing/pricing'
import { pageMetadata } from '@/modules/marketing/seo'
import { START_FREE_SENTENCE } from '@/modules/marketing/start-free'

export const metadata = pageMetadata({
  title: 'Pricing',
  description: `Suite: Work, Muster, Orbit and Folio for ${rupees(PLAN_PRICES.suite.monthlyPaise)} per person a month, or pick products from ${rupees(lowestMonthly())}. Prices in INR excluding ${GST_PERCENT}% GST. ${TRIAL_DAYS}-day free trial.`,
  path: '/pricing',
})

export default function PricingPage() {
  return (
    <>
      <section className="relative isolate overflow-hidden px-4 pb-6 pt-16 text-center sm:px-6 sm:pt-20">
        <Mesh className="-z-10" intensity="soft" />
        <SectionLabel icon={<Tag strokeWidth={1.5} />} className="justify-center">Pricing</SectionLabel>
        <h1 className="mx-auto mt-4 max-w-3xl text-balance text-[40px] font-semibold leading-[1.08] text-white sm:text-[52px]">
          One price for everything, or just what you need
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-pretty text-lg text-white/75">
          Suite is all four products for {rupees(PLAN_PRICES.suite.monthlyPaise)} per person a month. Or pick products from {rupees(lowestMonthly())}. {START_FREE_SENTENCE}
        </p>
      </section>

      <Section className="pt-10 sm:pt-12">
        <PricingSection />
      </Section>

      <Section id="compare" label="Compare plans" icon={<Table2 />} title="What each plan includes" description="Every feature below is in the product today. Muster Starter is everything in Muster except payroll.">
        <CompareTable />
      </Section>

      <Section id="faq" label="Questions" icon={<CircleQuestionMark />} title="Pricing questions, answered" center>
        <div className="mx-auto max-w-3xl">
          <FaqList items={PRICING_FAQ} />
          <p className="mt-5 text-center text-sm">
            <Link href="/faq" className="inline-flex items-center gap-1.5 text-link hover:text-white">All questions <ArrowRight className="size-3.5" aria-hidden /></Link>
          </p>
        </div>
      </Section>

      <CtaBand title="Try every product before you pick a plan." />
    </>
  )
}
