'use client'

import { ArrowRight, Check } from 'lucide-react'
import { Fragment } from 'react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** The "Selected" tab on the chosen card (Figma). */
export const SelectedTab = ({ selected }: { selected: boolean }) =>
  selected ? <span className="absolute -top-[17px] right-[18px] flex h-[17px] w-[83px] items-center justify-center rounded-t-[8px] bg-violet-2 text-xs font-medium text-white">Selected</span> : null

export type OnboardingOption<V extends string> = { value: V; icon: ReactNode; title: string; description: string; features: string[]; path: string[]; bestFor: string }

/** Figma option card: grey glass, radius 14; chosen = 3px white-to-orchid stroke + "Selected" tab; violet "Best for" band. */
export function OptionCard<V extends string>({ option, selected, onSelect }: { option: OnboardingOption<V>; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn('relative flex flex-col rounded-[14px] text-left transition-transform duration-150 hover:-translate-y-px active:scale-[0.99]', selected ? 'edge-selected bg-white/[0.32]' : 'border border-[#585558] bg-white/[0.3]')}
    >
      <SelectedTab selected={selected} />
      <span className="flex flex-1 flex-col px-4 pb-[19px] pt-[14px]">
        <span className="text-pink [&_svg]:size-[26px] [&_svg]:stroke-[1.5]">{option.icon}</span>
        <span className="mt-[11px] text-base font-semibold leading-5 text-white">{option.title}</span>
        <span className="mt-2 text-[13px] leading-[15px] text-white">{option.description}</span>
        <ul className="mt-[30px] space-y-[11px]">
          {option.features.map((f) => (
            <li key={f} className="flex items-center gap-[7px] text-[13px] leading-4 text-white">
              <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-violet-2">
                <Check className="size-2.5 text-white" strokeWidth={3} />
              </span>
              {f}
            </li>
          ))}
        </ul>
        <span className="mt-[25px] flex flex-wrap items-center gap-x-1 text-[13px] leading-4 text-white" aria-label={option.path.join(' then ')}>
          {option.path.map((step, i) => (
            <Fragment key={step}>
              {i > 0 ? <ArrowRight aria-hidden className="size-3" strokeWidth={1.75} /> : null}
              <span>{step}</span>
            </Fragment>
          ))}
        </span>
      </span>
      <span className={cn('flex min-h-[50px] items-center rounded-b-[14px] bg-violet-2 px-[19px] py-2 text-[13px] leading-[15px] text-white', selected && 'mx-[3px] mb-[3px] rounded-b-[11px] px-4')}>
        <span>
          Best for: <span className="font-semibold">{option.bestFor}</span>
        </span>
      </span>
    </button>
  )
}
