'use client'

import { ArrowRight, Check, UserRound, UsersRound } from 'lucide-react'
import { Fragment } from 'react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { play } from '@/lib/sound'
import type { Mode } from './wizard'

type Option = { value: Mode; icon: ReactNode; title: string; description: string; features: string[]; path: string[]; bestFor: string }

/** Card copy from docs/SPEC.md section 3, verbatim. */
const OPTIONS: Option[] = [
  {
    value: 'project',
    icon: <UsersRound />,
    title: 'Project-Based Workspace',
    description: 'Structure work into projects, then break each one down into tasks and sprints.',
    features: ['Tasks, subtasks & sprints', 'Milestones & time tracking', 'Team members & discussions', 'Reports across projects'],
    path: ['Workspace', 'Projects', 'Tasks', 'Subtasks'],
    bestFor: 'agencies, startups, software & marketing teams',
  },
  {
    value: 'personal',
    icon: <UserRound />,
    title: 'Personal Task Workspace',
    description: 'Skip project setup entirely and jump straight into managing your own work.',
    features: ['Personal tasks & to-do lists', 'Reminders & daily planner', 'Notes & goals', 'Calendar events'],
    path: ['Workspace', 'My Tasks (no project setup)'],
    bestFor: 'students, freelancers, personal productivity',
  },
]

/** Figma option card: grey glass, radius 14; chosen = 3px white-to-orchid stroke + "Selected" tab; violet "Best for" band. */
function OptionCard({ option, selected, onSelect }: { option: Option; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn('relative flex flex-col rounded-[14px] text-left transition-transform duration-150 hover:-translate-y-px active:scale-[0.99]', selected ? 'edge-selected bg-white/[0.32]' : 'border border-[#585558] bg-white/[0.3]')}
    >
      {selected ? <span className="absolute -top-[17px] right-[18px] flex h-[17px] w-[83px] items-center justify-center rounded-t-[8px] bg-violet-2 text-xs font-medium text-white">Selected</span> : null}
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

/** Step 2, "Choose how you want to work" (Figma onboarding-b). */
export function StepMode({ mode, onMode, pending, onBack, onCreate }: { mode: Mode; onMode: (m: Mode) => void; pending: boolean; onBack: () => void; onCreate: () => void }) {
  return (
    <div className="animate-slide-up">
      <h1 className="mt-[25px] text-2xl font-semibold leading-[30px] text-white">Choose how you want to work</h1>
      <p className="mt-1.5 max-w-[640px] text-sm leading-4 text-white">This sets your default experience. You can turn on the other mode anytime from Workspace Settings.</p>
      <div role="radiogroup" aria-label="Workspace mode" className="mt-[30px] grid gap-[21px] sm:max-w-[647px] sm:grid-cols-2">
        {OPTIONS.map((o) => (
          <OptionCard
            key={o.value}
            option={o}
            selected={o.value === mode}
            onSelect={() => {
              play('toggle')
              onMode(o.value)
            }}
          />
        ))}
      </div>
      <div className="mt-[36px] flex items-center justify-between gap-4 sm:max-w-[647px]">
        <button type="button" onClick={onBack} disabled={pending} className="text-sm font-medium text-white transition-opacity hover:opacity-75 disabled:opacity-40">
          Back
        </button>
        <button type="button" onClick={onCreate} disabled={pending} aria-busy={pending || undefined} className="shimmer press inline-flex h-[47px] min-w-[195px] items-center justify-center gap-2 rounded-full bg-grad-button-alt px-6 text-[15px] font-semibold text-white [text-shadow:0_1px_2px_rgba(40,20,80,0.35)] disabled:opacity-70">
          {pending ? 'Creating workspace…' : 'Create Workspace'}
        </button>
      </div>
    </div>
  )
}
