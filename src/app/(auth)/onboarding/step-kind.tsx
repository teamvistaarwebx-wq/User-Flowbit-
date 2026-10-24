'use client'

import { Building2, ChevronDown, UserRound, UsersRound } from 'lucide-react'
import { useState } from 'react'
import { PRODUCTS } from '@/lib/catalog'
import { cn } from '@/lib/utils'
import { play } from '@/lib/sound'
import { WORKSPACE_KIND_DEFS, type WorkspaceKind } from '@/lib/workspace-kind'
import { OptionCard, type OnboardingOption } from './option-card'

const card = (kind: WorkspaceKind, icon: OnboardingOption<WorkspaceKind>['icon'], features: string[]): OnboardingOption<WorkspaceKind> => {
  const def = WORKSPACE_KIND_DEFS[kind]
  return { value: kind, icon, title: def.title, description: def.description, features, path: def.products.map((p) => PRODUCTS[p].shortName), bestFor: def.bestFor }
}

/** Features listed per kind; the path row under them is the products the kind gets (lib/workspace-kind). */
const OPTIONS: OnboardingOption<WorkspaceKind>[] = [
  card('freelancer', <UserRound />, ['Projects, tasks & time tracking', 'Leads & deals', 'GST invoices, quotes & retainers', 'Collaborators when you need them']),
  card('agency', <UsersRound />, ['Client projects, tasks & sprints', 'HR, attendance & payroll', 'Leads & deal pipeline', 'GST invoices & retainers']),
  card('business', <Building2 />, ['Tasks, teams & meetings', 'HR, attendance & payroll', 'Customers & sales pipeline', 'GST invoices & expenses']),
]

/** Step 1, "Who are you?": the workspace kind decides products, roles and settings; changeable later in Settings → General. */
export function StepKind({ kind, onKind, email, onContinue }: { kind: WorkspaceKind; onKind: (k: WorkspaceKind) => void; email: string; onContinue: () => void }) {
  const [joining, setJoining] = useState(false)
  return (
    <div className="animate-slide-up">
      <h1 className="mt-[25px] text-2xl font-semibold leading-[30px] text-white">Who are you?</h1>
      <p className="mt-1.5 max-w-[640px] text-sm leading-4 text-white">We set up Flowbit around how you work. You can change this anytime from Workspace Settings.</p>
      <div role="radiogroup" aria-label="Who are you" className="mt-[30px] grid gap-[21px] gap-y-[30px] sm:max-w-[666px] md:grid-cols-3 md:gap-[14px]">
        {OPTIONS.map((o) => (
          <OptionCard
            key={o.value}
            option={o}
            compact
            separator="dot"
            selected={o.value === kind}
            onSelect={() => {
              play('toggle')
              onKind(o.value)
            }}
          />
        ))}
      </div>

      <div className="mt-5 sm:max-w-[666px]">
        <button type="button" onClick={() => setJoining((v) => !v)} aria-expanded={joining} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-white/80 transition-opacity hover:opacity-75">
          Joining your team&apos;s workspace?
          <ChevronDown className={cn('size-3.5 transition-transform duration-200', joining && 'rotate-180')} strokeWidth={1.75} />
        </button>
        {joining ? (
          <p role="status" className="mt-2 rounded-[10px] border border-white/[0.15] bg-black/25 px-4 py-3 text-[13px] leading-[18px] text-white/85 animate-fade-in">
            You don&apos;t need a workspace of your own. Ask your owner or admin to invite <span className="font-semibold text-white">{email}</span> from Settings → Members; the invite email brings you straight in.
          </p>
        ) : null}
      </div>

      <div className="mt-[30px] flex items-center justify-end gap-4 sm:max-w-[666px]">
        <button type="button" onClick={onContinue} className="shimmer press h-[46px] w-[186px] rounded-full bg-grad-button-alt text-[15px] font-semibold text-white [text-shadow:0_1px_2px_rgba(40,20,80,0.35)]">
          Continue
        </button>
      </div>
    </div>
  )
}
