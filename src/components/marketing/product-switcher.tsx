'use client'

import { useState, type ReactNode } from 'react'
import { ArrowRight, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ProductKey } from '@/lib/catalog'
import { cn } from '@/lib/utils'
import { ProductIcon } from './product-icon'
import { START_FREE_LABEL } from '@/modules/marketing/start-free'

export type SwitcherPanel = {
  key: ProductKey
  name: string
  oneLiner: string
  accent: string
  href: string
  features: { name: string; description: string }[]
  mock: ReactNode
}

/** Four product tabs: each shows the product's real feature list beside a mock of its main screen. */
export function ProductSwitcher({ panels }: { panels: SwitcherPanel[] }) {
  const [active, setActive] = useState<ProductKey>(panels[0]?.key ?? 'work')
  const panel = panels.find((p) => p.key === active) ?? panels[0]
  if (!panel) return null

  const select = (key: ProductKey) => {
    if (key === active) return
    setActive(key)
  }

  return (
    <div>
      <div role="tablist" aria-label="Flowbit products" className="mx-auto flex w-fit max-w-full gap-0.5 overflow-x-auto rounded-full bg-control p-[5px] ring-1 ring-inset ring-white/[0.08] scrollbar-none">
        {panels.map((p) => {
          const selected = p.key === active
          return (
            <button
              key={p.key}
              type="button"
              role="tab"
              id={`product-tab-${p.key}`}
              aria-selected={selected}
              aria-controls={`product-panel-${p.key}`}
              onClick={() => select(p.key)}
              className={cn('press inline-flex h-9 shrink-0 items-center gap-2 rounded-full px-4 text-sm transition-colors duration-150', selected ? 'bg-control-active text-white' : 'text-white/75 hover:bg-white/[0.05] hover:text-white')}
            >
              <ProductIcon product={p.key} className={selected ? undefined : 'opacity-80'} />
              {p.name}
            </button>
          )
        })}
      </div>

      <div
        key={panel.key}
        role="tabpanel"
        id={`product-panel-${panel.key}`}
        aria-labelledby={`product-tab-${panel.key}`}
        className="mt-10 grid items-start gap-10 animate-fade-in lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]"
      >
        <div>
          <h3 className="text-2xl font-semibold leading-tight text-white sm:text-[30px]">{panel.oneLiner}</h3>
          <ul className="mt-6 grid gap-3">
            {panel.features.map((f) => (
              <li key={f.name} className="flex gap-3">
                <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-violet-2" aria-hidden>
                  <Check className="size-2.5" strokeWidth={2.5} />
                </span>
                <span className="text-sm leading-relaxed text-white/70">
                  <span className="font-medium text-white">{f.name}.</span> {f.description}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button variant="primary" href={panel.href} iconRight={<ArrowRight className="size-4" />}>Explore {panel.name}</Button>
            <Button variant="secondary" href="/signup">{START_FREE_LABEL}</Button>
          </div>
        </div>
        {/* Long feature lists: the mock aligns with the heading and stays in view while the list scrolls past. */}
        <div className="min-w-0 lg:sticky lg:top-24">{panel.mock}</div>
      </div>
    </div>
  )
}
