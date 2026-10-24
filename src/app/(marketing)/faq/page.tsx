import Link from 'next/link'
import { ArrowRight, CircleQuestionMark } from 'lucide-react'
import { CtaBand } from '@/components/marketing/cta-band'
import { FaqHub } from '@/components/marketing/faq-hub'
import { Mesh } from '@/components/marketing/mesh'
import { SectionLabel } from '@/components/ui/card'
import { ALL_FAQ, faqJsonLd, jsonLdScript } from '@/modules/marketing/content/faq'
import { pageMetadata } from '@/modules/marketing/seo'

export const metadata = pageMetadata({
  title: 'FAQ',
  description: 'Answers about Flowbit Work, Muster, Orbit and Folio: plans and GST, payroll and TDS, invoices and e-invoice, security, integrations and AI.',
  path: '/faq',
})

/** /faq: every question in one place, with search, category chips and FAQPage structured data. */
export default function FaqPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(faqJsonLd(ALL_FAQ)) }} />
      <section className="relative isolate overflow-hidden px-4 pb-4 pt-16 sm:px-6 sm:pt-20">
        <Mesh className="-z-10" intensity="soft" />
        <div className="mx-auto max-w-4xl">
          <SectionLabel icon={<CircleQuestionMark strokeWidth={1.5} />}>Help</SectionLabel>
          <h1 className="mt-4 text-balance text-[40px] font-semibold leading-[1.08] text-white sm:text-[52px]">Frequently asked questions</h1>
          <p className="mt-5 max-w-2xl text-pretty text-lg text-white/75">
            Short answers about every product, plans and billing, security and integrations. For step-by-step help, each answer links to its page in the user manual.
          </p>
          <p className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <Link href="/help" className="inline-flex items-center gap-1.5 text-link hover:text-white">Help centre <ArrowRight className="size-3.5" aria-hidden /></Link>
            <Link href="/manual" className="inline-flex items-center gap-1.5 text-link hover:text-white">User manual <ArrowRight className="size-3.5" aria-hidden /></Link>
          </p>
        </div>
      </section>
      <section className="px-4 pb-20 pt-8 sm:px-6">
        <div className="mx-auto max-w-4xl">
          <FaqHub items={ALL_FAQ} />
        </div>
      </section>
      <CtaBand title="Still deciding? Try every product for free." />
    </>
  )
}
