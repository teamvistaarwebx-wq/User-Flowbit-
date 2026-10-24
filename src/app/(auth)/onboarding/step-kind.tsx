'use client'

import { Building2, ChevronDown, UserRound, UsersRound } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { PRODUCTS } from '@/lib/catalog'
import { cn } from '@/lib/utils'
import { play } from '@/lib/sound'
import { WORKSPACE_KINDS, WORKSPACE_KIND_DEFS, type WorkspaceKind } from '@/lib/workspace-kind'
import { SelectedTab } from './option-card'

const ICONS: Record<WorkspaceKind, ReactNode> = { freelancer: <UserRound />, agency: <UsersRound />, business: <Building2 /> }

/** One kind: the option-card glass and "Selected" tab, cut down to an icon, a title, one line and the products it gets. */
function KindCard({ kind, selected, onSelect }: { kind: WorkspaceKind; selected: boolean; onSelect: () => void }) {
  const def = WORKSPACE_KIND_DEFS[kind]
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn('relative flex flex-col rounded-[14px] px-4 pb-4 pt-[14px] text-left transition-transform duration-150 hover:-translate-y-px active:scale-[0.99]', selected ? 'edge-selected bg-white/[0.32]' : 'border border-[#585558] bg-white/[0.3]')}
    >
      <SelectedTab selected={selected} />
      <span className="text-pink [&_svg]:size-[26px] [&_svg]:stroke-[1.5]">{ICONS[kind]}</span>
      <span className="mt-[18px] text-base font-semibold leading-5 text-white">{def.title}</span>
      <span className="mt-1 text-[13px] leading-4 text-white/70">{def.tagline}</span>
      <span className="mt-[18px] border-t border-white/[0.12] pt-3 text-xs font-medium leading-4 text-white/60">{def.products.map((p) => PRODUCTS[p].shortName).join(' · ')}</span>
    </button>
  )
}

/** Step 1, "Who are you?": the workspace kind decides products, roles and settings; changeable later in Settings → General. */
export function StepKind({ kind, onKind, email, onContinue }: { kind: WorkspaceKind; onKind: (k: WorkspaceKind) => void; email: string; onContinue: () => void }) {
  const [joining, setJoining] = useState(false)
  return (
    <div className="animate-slide-up">
      <h1 className="mt-[25px] text-2xl font-semibold leading-[30px] text-white">Who are you?</h1>
      <p className="mt-1.5 text-sm leading-4 text-white/80">You can change this later in Settings.</p>
      <div role="radiogroup" aria-label="Who are you" className="mt-[34px] grid gap-y-[30px] sm:max-w-[666px] md:grid-cols-3 md:gap-[14px]">
        {WORKSPACE_KINDS.map((k) => (
          <KindCard
            key={k}
            kind={k}
            selected={k === kind}
            onSelect={() => {
              play('toggle')
              onKind(k)
            }}
          />
        ))}
      </div>

      <div className="mt-[30px] flex items-start justify-between gap-4 sm:max-w-[666px]">
        <div className="min-w-0 pt-3">
          <button type="button" onClick={() => setJoining((v) => !v)} aria-expanded={joining} className="inline-flex items-center gap-1 text-[13px] font-medium text-white/70 transition-opacity hover:opacity-75">
            Joining a team?
            <ChevronDown className={cn('size-3.5 transition-transform duration-200', joining && 'rotate-180')} strokeWidth={1.75} />
          </button>
          {joining ? (
            <p role="status" className="mt-1.5 max-w-[360px] text-[13px] leading-[18px] text-white/70 animate-fade-in">
              Ask your admin to invite <span className="font-medium text-white">{email}</span>.
            </p>
          ) : null}
        </div>
        <button type="button" onClick={onContinue} className="shimmer press h-[46px] w-[186px] shrink-0 rounded-full bg-grad-button-alt text-[15px] font-semibold text-white [text-shadow:0_1px_2px_rgba(40,20,80,0.35)]">
          Continue
        </button>
      </div>
    </div>
  )
}
