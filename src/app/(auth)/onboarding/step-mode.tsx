'use client'

import { UserRound, UsersRound } from 'lucide-react'
import { play } from '@/lib/sound'
import { OptionCard, type OnboardingOption } from './option-card'
import type { Mode } from './wizard'

/**
 * Card copy from docs/SPEC.md section 3, except "Best for": freelancers run several projects, so they are
 * pointed at the project workspace (the "Who are you?" step already set up the rest).
 */
const OPTIONS: OnboardingOption<Mode>[] = [
  {
    value: 'project',
    icon: <UsersRound />,
    title: 'Project-Based Workspace',
    description: 'Structure work into projects, then break each one down into tasks and sprints.',
    features: ['Tasks, subtasks & sprints', 'Milestones & time tracking', 'Team members & discussions', 'Reports across projects'],
    path: ['Workspace', 'Projects', 'Tasks', 'Subtasks'],
    bestFor: 'freelancers, agencies, startups & teams',
  },
  {
    value: 'personal',
    icon: <UserRound />,
    title: 'Personal Task Workspace',
    description: 'Skip project setup entirely and jump straight into managing your own work.',
    features: ['Personal tasks & to-do lists', 'Reminders & daily planner', 'Notes & goals', 'Calendar events'],
    path: ['Workspace', 'My Tasks (no project setup)'],
    bestFor: 'students, personal productivity',
  },
]

/** Step 3, "Choose how you want to work" (Figma onboarding-b). */
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
