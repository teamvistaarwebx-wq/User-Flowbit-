'use client'

import { ArrowRight, Check } from 'lucide-react'
import { Fragment } from 'react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type OnboardingOption<V extends string> = { value: V; icon: ReactNode; title: string; description: string; features: string[]; path: string[]; bestFor: string }

/**
 * Figma option card: grey glass, radius 14; chosen = 3px white-to-orchid stroke + "Selected" tab; violet "Best for" band.
 * `separator`: arrows for a hierarchy (Workspace → Projects), dots for a plain list (Work · Orbit · Folio).
 */
export function OptionCard<V extends string>({ option, selected, onSelect, compact, separator = 'arrow' }: { option: OnboardingOption<V>; selected: boolean; onSelect: () => void; compact?: boolean; separator?: 'arrow' | 'dot' }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn('relative flex flex-col rounded-[14px] text-left transition-transform duration-150 hover:-translate-y-px active:scale-[0.99]', selected ? 'edge-selected bg-white/[0.32]' : 'border border-[#585558] bg-white/[0.3]')}
    >
      {selected ? <span className="absolute -top-[17px] right-[18px] flex h-[17px] w-[83px] items-center justify-center rounded-t-[8px] bg-violet-2 text-xs font-medium text-white">Selected</span> : null}
      <span className={cn('flex flex-1 flex-col pb-[19px] pt-[14px]', compact ? 'px-3.5' : 'px-4')}>
        <span className="text-pink [&_svg]:size-[26px] [&_svg]:stroke-[1.5]">{option.icon}</span>
        <span className="mt-[11px] text-base font-semibold leading-5 text-white">{option.title}</span>
        <span className="mt-2 text-[13px] leading-[15px] text-white">{option.description}</span>
        <ul className={cn('space-y-[11px]', compact ? 'mt-5' : 'mt-[30px]')}>
          {option.features.map((f) => (
            <li key={f} className="flex items-start gap-[7px] text-[13px] leading-4 text-white">
              <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-violet-2">
                <Check className="size-2.5 text-white" strokeWidth={3} />
              </span>
              {f}
            </li>
          ))}
        </ul>
        <span className={cn('flex flex-wrap items-center gap-x-1 text-[13px] leading-4 text-white', compact ? 'mt-5' : 'mt-[25px]')} aria-label={option.path.join(separator === 'arrow' ? ' then ' : ', ')}>
          {option.path.map((step, i) => (
            <Fragment key={step}>
              {i === 0 ? null : separator === 'arrow' ? <ArrowRight aria-hidden className="size-3" strokeWidth={1.75} /> : <span aria-hidden className="px-0.5 text-white/60">·</span>}
              <span>{step}</span>
            </Fragment>
          ))}
        </span>
      </span>
      <span className={cn('flex min-h-[50px] items-center rounded-b-[14px] bg-violet-2 py-2 text-[13px] leading-[15px] text-white', compact ? 'px-3.5' : 'px-[19px]', selected && 'mx-[3px] mb-[3px] rounded-b-[11px] px-4')}>
        <span>
          Best for: <span className="font-semibold">{option.bestFor}</span>
        </span>
      </span>
    </button>
  )
}
