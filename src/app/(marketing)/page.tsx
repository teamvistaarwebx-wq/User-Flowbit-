import Link from 'next/link'
import { ArrowRight, Boxes, Check, CircleQuestionMark, IndianRupee, Network, Scale, ShieldCheck, Tag } from 'lucide-react'
import { ArcCardMock, HomeMock, Mock } from '@/components/marketing/mocks'
import { accentOf } from '@/components/marketing/accent'
import { Comparison } from '@/components/marketing/comparison'
import { Connected } from '@/components/marketing/connected'
import { CtaBand } from '@/components/marketing/cta-band'
import { FaqList } from '@/components/marketing/faq-list'
import { Mesh } from '@/components/marketing/mesh'
import { PricingSection } from '@/components/marketing/pricing-section'
import { ProductSwitcher, type SwitcherPanel } from '@/components/marketing/product-switcher'
import { Reveal } from '@/components/marketing/reveal'
import { Ribbon } from '@/components/marketing/ribbon'
import { Section } from '@/components/marketing/section'
import { Button } from '@/components/ui/button'
import { PRODUCT_KEYS, PRODUCTS } from '@/lib/catalog'
import { PLAN_PRICES } from '@/lib/plans'
import { PRODUCT_CONTENT, productHref } from '@/modules/marketing/content'
import { LANDING_FAQ } from '@/modules/marketing/content/faq'
import { lowestMonthly, rupees } from '@/modules/marketing/pricing'
import { pageMetadata } from '@/modules/marketing/seo'
import { ProductIcon } from '@/components/marketing/product-icon'
import { START_FREE_LABEL, START_FREE_NOTE, START_FREE_SENTENCE } from '@/modules/marketing/start-free'

export const metadata = pageMetadata({
  title: 'Flowbit: one workspace for your team’s work, people, sales and money',
  description: `Tasks and projects, attendance and payroll, a sales pipeline, and quotes, invoices and collections, in one workspace with one login. ${START_FREE_SENTENCE}`,
  path: '/',
  absoluteTitle: true,
})

const INDIA = [
  '₹ amounts with Indian grouping: ₹1,23,456',
  'GST split into CGST and SGST, or IGST, by place of supply',
  'PF, ESI and Professional Tax by state',
  'Invoice numbers that restart each April',
  'IST everywhere, dates like 20 Jul 2026',
  'Work weeks from Mon–Fri to Mon–Sat',
]

const TRUST = [
  { title: 'Your records stay yours', body: 'Every record belongs to one workspace and every request is checked against it.' },
  { title: 'Roles decide who sees what', body: 'Down to who can see salaries. Managers approve leave without seeing pay.' },
  { title: 'An audit log of sensitive changes', body: 'Salary edits, payroll stages, invoices, roles and members, with who and when.' },
  { title: 'Voided, never deleted', body: 'Issued invoices, HR letters and released payroll are voided with a reason.' },
]

const ARC_POINTS = [
  'Every suggestion waits for your click.',
  'Arc can’t touch money or people records.',
  'Works without AI too: when AI isn’t turned on, Arc uses built-in templates and search.',
]

function Hero() {
  return (
    <section className="relative isolate overflow-hidden px-4 pb-20 pt-14 sm:px-6 sm:pt-20 lg:pb-28">
      <Mesh className="-z-10" />
      <div className="mx-auto grid max-w-6xl items-center gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <div>
          <p className="text-[13px] font-semibold uppercase tracking-[0.06em] text-white/70">Built for Indian teams of up to 150</p>
          <h1 className="mt-5 text-balance text-[40px] font-semibold leading-[1.06] text-white sm:text-[60px]">
            Everything in flow. Nothing in the way.
          </h1>
          <p className="mt-6 max-w-xl text-pretty text-lg leading-relaxed text-white/75">
            Flowbit runs your team’s work, people, sales and money in one workspace. One login, one client list, one record per person.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Button variant="primary" size="lg" href="/signup" iconRight={<ArrowRight className="size-4" />}>{START_FREE_LABEL}</Button>
            <Button variant="secondary" size="lg" href="/pricing">See pricing</Button>
          </div>
          <p className="mt-5 text-[13px] text-[#979797]">{START_FREE_NOTE} · No card needed</p>
          <nav aria-label="Products" className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-line/70 pt-6">
            {PRODUCT_KEYS.map((k) => (
              <Link key={k} href={productHref(k)} className="inline-flex items-center gap-2 text-sm text-white/75 transition-colors hover:text-white">
                <ProductIcon product={k} className="size-4" /> {PRODUCTS[k].name}
              </Link>
            ))}
          </nav>
        </div>
        {/* The sign-in card's composition: glass over black, the two elbow ribbons bent behind its right corners. */}
        <div className="relative min-w-0 lg:pr-6">
          <Ribbon name="top" className="hidden lg:block" style={{ right: -95, top: -86, maskImage: 'linear-gradient(to bottom, transparent 0%, #000 34%)' }} />
          <Ribbon name="bottom" phase="b" className="hidden lg:block" style={{ right: -100, bottom: -101, maskImage: 'linear-gradient(to top, transparent 0%, #000 40%)' }} />
          <HomeMock />
        </div>
      </div>
    </section>
  )
}

const panels: SwitcherPanel[] = PRODUCT_KEYS.map((k) => ({
  key: k,
  name: PRODUCTS[k].name,
  oneLiner: PRODUCT_CONTENT[k].oneLiner,
  accent: accentOf(k),
  href: productHref(k),
  features: PRODUCTS[k].features.map((f) => ({ name: f.name, description: f.description })),
  mock: <Mock name={PRODUCT_CONTENT[k].heroMock} />,
}))

export default function LandingPage() {
  return (
    <>
      <Hero />

      <Section id="products" label="Four products" icon={<Boxes />} title="Four products. One workspace." description="Use one, or all four. Each is complete on its own, and they get better together because they read the same records." center>
        <ProductSwitcher panels={panels} />
      </Section>

      <Section id="connected" label="How they connect" icon={<Network />} title="Connected, not stitched together" description="No sync jobs, no CSV round trips. The products share one login, one client list and one record per person.">
        <Connected />
      </Section>

      <Section id="arc">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <Reveal>
            <h2 className="text-balance text-3xl font-semibold leading-tight text-white sm:text-[40px] sm:leading-[48px]">AI reads. People decide.</h2>
            <p className="mt-4 text-pretty text-base leading-relaxed text-white/75 sm:text-[17px]">
              Arc is Flowbit’s assistant. It searches your workspace (tasks, projects, clients, people, posts and meetings) and drafts things for you to check: a project outline with milestones and tasks, subtasks for a big task, a summary of your week built from what actually happened. Nothing is created until you click Apply. Arc never changes pay, attendance, HR letters, invoice amounts or anything else on its own.
            </p>
            <ul className="mt-7 border-t border-line/70">
              {ARC_POINTS.map((p, i) => (
                <li key={p} className="flex items-baseline gap-4 border-b border-line/70 py-3 text-sm text-white/85">
                  <span className="w-6 shrink-0 text-xs font-semibold tabular-nums text-[#979797]">{String(i + 1).padStart(2, '0')}</span>
                  {p}
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal delay={120}>
            <div className="relative">
              <ArcCardMock />
              <div className="card-table mt-3 p-5">
                <p className="text-[13px] font-semibold uppercase tracking-[0.04em] text-white">Draft · Outline a project</p>
                <ul className="mt-3 grid gap-2 text-sm text-white/80">
                  {['Milestone 1: Discovery and sitemap · 3 tasks', 'Milestone 2: Design and copy · 5 tasks', 'Milestone 3: Build, QA and launch · 6 tasks'].map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
                <div className="mt-4 flex gap-2">
                  <span className="inline-flex h-8 items-center rounded-full bg-grad-button px-4 text-xs font-medium text-white">Apply</span>
                  <span className="inline-flex h-8 items-center rounded-full bg-control px-4 text-xs text-white ring-1 ring-inset ring-white/[0.18]">Discard</span>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </Section>

      <Section id="india" label="Made for India" icon={<IndianRupee />} title="Made for how Indian teams work">
        <Reveal>
          <ul className="card-solid grid gap-x-10 px-6 py-3 sm:grid-cols-2 lg:grid-cols-3">
            {INDIA.map((item) => (
              <li key={item} className="flex items-start gap-3 border-b border-line/60 py-4 text-sm text-white last:border-0 sm:[&:nth-last-child(2)]:border-0 lg:[&:nth-last-child(3)]:border-0">
                <Check className="mt-0.5 size-4 shrink-0 text-white/60" strokeWidth={1.5} aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </Reveal>
      </Section>

      <Section id="trust" label="Your workspace is yours" icon={<ShieldCheck />} title="Built for records that matter">
        <div className="grid gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
          {TRUST.map((t, i) => (
            <Reveal key={t.title} delay={i * 70}>
              <div className="h-full border-t border-line pt-5">
                <span className="text-xs font-semibold tabular-nums text-[#979797]">{String(i + 1).padStart(2, '0')}</span>
                <h3 className="mt-3 text-lg font-semibold text-white">{t.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-white/70">{t.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section id="compare" label="Compared" icon={<Scale />} title="One workspace instead of four tools" description="Most small teams run an HR tool, a CRM, an invoicing app and a task board, and copy data between them. Here is what changes.">
        <Comparison />
      </Section>

      <Section id="pricing" label="Pricing" icon={<Tag />} title={`Suite: all four products for ${rupees(PLAN_PRICES.suite.monthlyPaise)} per person a month.`} description={`Or pick only the products you need, from ${rupees(lowestMonthly())}.`} center>
        <PricingSection />
      </Section>

      <Section id="faq" label="Questions" icon={<CircleQuestionMark />} title="Questions teams ask first" center>
        <div className="mx-auto max-w-3xl">
          <FaqList items={LANDING_FAQ} />
          <p className="mt-5 text-center text-sm">
            <Link href="/faq" className="inline-flex items-center gap-1.5 text-link hover:text-white">All questions <ArrowRight className="size-3.5" aria-hidden /></Link>
          </p>
        </div>
      </Section>

      <CtaBand />
    </>
  )
}
