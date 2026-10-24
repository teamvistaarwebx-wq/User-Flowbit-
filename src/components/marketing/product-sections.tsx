import Link from 'next/link'
import { ArrowRight, Check, CircleSlash } from 'lucide-react'
import { Icon } from '@/components/ui/icon'
import { BurstMark } from '@/components/ui/logo'
import { SectionLabel } from '@/components/ui/card'
import type { ProductContent, Spotlight } from '@/modules/marketing/content'
import { PRODUCT_KEYS, type ProductKey } from '@/lib/catalog'
import { cn } from '@/lib/utils'
import { ProductIcon } from './product-icon'
import { Mock } from './mocks'
import { Reveal } from './reveal'

/** "What you get": feature blocks with icon, title, body and optional points. */
export function FeatureGrid({ content }: { content: ProductContent }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {content.features.map((f, i) => (
        <Reveal key={f.title} delay={(i % 3) * 70}>
          <article className="glass h-full rounded-[12px] p-6">
            <Icon name={f.icon} className="size-5 text-white" strokeWidth={1.5} />
            <h3 className="mt-4 text-lg font-semibold text-white">{f.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-white/70">{f.body}</p>
            {f.points?.length ? (
              <ul className="mt-4 grid gap-2 border-t border-line-soft/50 pt-4">
                {f.points.map((p) => (
                  <li key={p} className="flex gap-2 text-[13px] text-white/80"><Check className="mt-0.5 size-3.5 shrink-0 text-white/50" strokeWidth={1.5} aria-hidden />{p}</li>
                ))}
              </ul>
            ) : null}
          </article>
        </Reveal>
      ))}
    </div>
  )
}

/** A deep-dive row: copy on one side, the mock screen on the other (alternating). */
export function SpotlightRow({ spotlight, flip }: { spotlight: Spotlight; product: string; flip?: boolean }) {
  return (
    <div className="grid items-center gap-10 lg:grid-cols-2">
      <Reveal className={cn(flip && 'lg:order-2')}>
        <SectionLabel icon={<Icon name={spotlight.icon} strokeWidth={1.5} />}>{spotlight.label}</SectionLabel>
        <h3 className="mt-3 text-balance text-2xl font-semibold leading-tight text-white sm:text-[30px]">{spotlight.title}</h3>
        <p className="mt-4 text-pretty text-base leading-relaxed text-white/75">{spotlight.body}</p>
        <ul className="mt-6 grid gap-3">
          {spotlight.points.map((p) => (
            <li key={p} className="flex gap-3 text-sm text-white/85">
              <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-violet-2" aria-hidden>
                <Check className="size-2.5" strokeWidth={2.5} />
              </span>
              {p}
            </li>
          ))}
        </ul>
      </Reveal>
      <Reveal className={cn('min-w-0', flip && 'lg:order-1')} delay={100}>
        <Mock name={spotlight.mock} />
      </Reveal>
    </div>
  )
}

/** "How it works": numbered steps, each under a hairline, like the onboarding step bars laid flat. */
export function Steps({ steps }: { steps: ProductContent['steps'] }) {
  return (
    <ol className="grid gap-x-6 gap-y-8 md:auto-cols-fr md:grid-flow-col">
      {steps.map((s, i) => (
        <li key={s.title}>
          <Reveal delay={i * 80}>
            <span aria-hidden className="block h-1 w-14 rounded-full bg-[linear-gradient(90deg,#E7D5E7,#8B6AAE)]" />
            <span className="mt-5 block text-xs font-semibold tabular-nums text-[#979797]">Step {i + 1}</span>
            <h3 className="mt-1.5 text-lg font-semibold text-white">{s.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-white/70">{s.body}</p>
          </Reveal>
        </li>
      ))}
    </ol>
  )
}

const isProduct = (key: string): key is ProductKey => (PRODUCT_KEYS as readonly string[]).includes(key)

/** "Works with the rest of Flowbit": cross-links, each led by the product's own icon. */
export function WorksWith({ items }: { items: ProductContent['worksWith'] }) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {items.map((w) => (
        <Link key={w.title} href={w.href} className="glass lift group flex h-full flex-col rounded-[12px] p-6">
          {isProduct(w.product) ? <ProductIcon product={w.product} className="size-5" /> : <BurstMark size={20} variant="white" />}
          <h3 className="mt-4 text-lg font-semibold text-white">{w.title}</h3>
          <p className="mt-2 flex-1 text-sm leading-relaxed text-white/70">{w.body}</p>
          <span className="mt-4 inline-flex items-center gap-1.5 text-sm text-link">Learn more <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden /></span>
        </Link>
      ))}
    </div>
  )
}

/** "What it doesn't do (yet)": the honest list. */
export function NotYet({ items }: { items: string[] }) {
  return (
    <Reveal>
      <ul className="card-solid grid gap-x-10 gap-y-3.5 p-6 sm:grid-cols-2">
        {items.map((item) => (
          <li key={item} className="flex gap-3 text-sm text-white/85"><CircleSlash className="mt-0.5 size-4 shrink-0 text-icon-muted" strokeWidth={1.5} aria-hidden />{item}</li>
        ))}
      </ul>
    </Reveal>
  )
}
