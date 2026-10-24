'use client'

import type { ReactNode } from 'react'
import { CircleCheck, CircleX, LoaderCircle, X } from 'lucide-react'
import { signupAccountType, TEAM_SIZES } from '@/lib/account-types'
import { cn } from '@/lib/utils'
import { play } from '@/lib/sound'

export type Invitee = { email: string; role: string }
export type SlugState = { status: 'idle' | 'checking' | 'ok' | 'bad'; message?: string }

const ROLES = [
  { value: 'member', label: 'Member' },
  { value: 'manager', label: 'Manager' },
  { value: 'admin', label: 'Admin' },
  { value: 'hr_admin', label: 'HR admin' },
  { value: 'finance', label: 'Finance' },
  { value: 'sales', label: 'Sales' },
]

/** Glass field on the glass card (Figma: white 28% fill, white 18% hairline, 40px pill). */
export const glassField =
  'h-10 w-full rounded-full border border-white/[0.18] bg-white/[0.28] px-4 text-sm text-white placeholder:text-white/50 transition-[border-color,background-color,box-shadow] duration-150 hover:border-white/30 focus:border-white/55 focus:bg-white/[0.32] focus:shadow-[0_0_0_3px_rgba(187,98,165,0.3)] focus:outline-none aria-[invalid=true]:border-[#FF8A86]'

function Label({ htmlFor, required, children, aside }: { htmlFor?: string; required?: boolean; children: ReactNode; aside?: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-medium leading-5 text-white">
      {children}
      {required ? <span className="text-[#F64A45]">*</span> : null}
      {aside ? <span className="ml-1 text-xs font-normal text-white/60">{aside}</span> : null}
    </label>
  )
}

const FieldError = ({ children }: { children?: string }) => (children ? <p className="mt-1.5 text-[13px] text-[#FFB0AD]">{children}</p> : null)

export type StepWorkspaceProps = {
  name: string
  onName: (v: string) => void
  slug: string
  onSlug: (v: string) => void
  slugState: SlugState
  teamSize: string
  onTeamSize: (v: string) => void
  taxId: string
  onTaxId: (v: string) => void
  draft: string
  onDraft: (v: string) => void
  invites: Invitee[]
  onAddInvite: () => void
  onInviteRole: (email: string, role: string) => void
  onRemoveInvite: (email: string) => void
  errors: Record<string, string>
  onSkip: () => void
  onContinue: () => void
  limits: SignupLimits
}

/** The Console's Free seats, Free months and trial days (lib/plan-config), from the page. */
export type SignupLimits = Readonly<{ freeSeats: number; freeMonths: number; trialDays: number }>

/** Step 1, "Create your workspace" (Figma onboarding-a): name, URL, team size chips, invites. */
export function StepWorkspace(p: StepWorkspaceProps) {
  const { freeSeats, freeMonths, trialDays } = p.limits
  const plan = signupAccountType({ teamSize: p.teamSize, invites: p.invites.length }, freeSeats)
  const slugMessage = p.errors.slug ?? (p.slugState.status === 'checking' ? 'Checking…' : p.slugState.status === 'idle' ? undefined : p.slugState.message)
  return (
    <div className="animate-slide-up sm:max-w-[495px]">
      <h1 className="mt-[30px] text-2xl font-semibold leading-[30px] text-white">Create your workspace</h1>
      <p className="mt-1 text-sm text-white">All your work — unified.</p>

      <div className="mt-[30px]">
        <Label htmlFor="ws-name" required>
          Workspace name
        </Label>
        <input id="ws-name" value={p.name} onChange={(e) => p.onName(e.target.value)} placeholder="Vistaar WebX" aria-invalid={Boolean(p.errors.name)} autoFocus className={cn(glassField, 'mt-[7px]')} />
        <FieldError>{p.errors.name}</FieldError>
      </div>

      <div className="mt-5">
        <Label htmlFor="ws-slug" required>
          Set Your Workspace URL
        </Label>
        <div className={cn(glassField, 'mt-[7px] flex items-center gap-0 pr-3 focus-within:border-white/55 focus-within:shadow-[0_0_0_3px_rgba(187,98,165,0.3)]', (p.errors.slug || p.slugState.status === 'bad') && 'border-[#FF8A86]')}>
          <span className="shrink-0 text-white/60">useflowbit.com/</span>
          <input id="ws-slug" value={p.slug} onChange={(e) => p.onSlug(e.target.value)} placeholder="vistaar" aria-invalid={Boolean(p.errors.slug) || p.slugState.status === 'bad'} className="h-full min-w-0 flex-1 bg-transparent text-white placeholder:text-white/50 focus:outline-none" />
          {p.slugState.status === 'checking' ? <LoaderCircle className="size-4 animate-spin text-white/70" /> : p.slugState.status === 'ok' ? <CircleCheck className="size-4 text-mint" /> : p.slugState.status === 'bad' ? <CircleX className="size-4 text-[#FF8A86]" /> : null}
        </div>
        {slugMessage ? <p className={cn('mt-1.5 text-[13px]', p.errors.slug || p.slugState.status === 'bad' ? 'text-[#FFB0AD]' : 'text-white/70')}>{slugMessage}</p> : null}
      </div>

      <div className="mt-5">
        <Label required>How many people will use this workspace?</Label>
        <div role="radiogroup" aria-label="Team size" className="mt-4 grid grid-cols-3 gap-x-[18px] gap-y-5 sm:grid-cols-4">
          {TEAM_SIZES.map((size) => {
            const active = size === p.teamSize
            return (
              <button
                key={size}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => {
                  play('toggle')
                  p.onTeamSize(size)
                }}
                className={cn(
                  'press h-9 rounded-full text-sm font-medium transition-colors duration-150',
                  active ? 'bg-chip-active text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]' : 'border border-white/[0.15] bg-white/[0.3] text-white hover:bg-white/[0.36]',
                )}
              >
                {size.replace(/^(\d+)-(\d+)$/, '$1–$2')}
              </button>
            )
          })}
        </div>
      </div>

      <p role="status" className="mt-3 text-[13px] text-white/75">
        {plan === 'free'
          ? `Free for ${freeMonths} months: every product for up to ${freeSeats} people. No card needed.`
          : `More than ${freeSeats} people: a ${trialDays}-day trial of every product for the whole team. No card needed.`}
      </p>
      <FieldError>{p.errors.teamSize}</FieldError>

      <div className="mt-5">
        <Label htmlFor="ws-taxid" aside="Optional — one Free workspace per business">
          GSTIN or PAN
        </Label>
        <input id="ws-taxid" value={p.taxId} onChange={(e) => p.onTaxId(e.target.value.toUpperCase())} placeholder="23ABCDE1234F1Z5" maxLength={20} aria-invalid={Boolean(p.errors.taxId)} className={cn(glassField, 'mt-[7px]')} />
        <FieldError>{p.errors.taxId}</FieldError>
      </div>

      <div className="mt-[18px]">
        <Label htmlFor="ws-invite" aside="Optional — you can also do this later">
          Invite team members
        </Label>
        <div className="mt-[7px] flex gap-3.5">
          <input
            id="ws-invite"
            type="email"
            value={p.draft}
            onChange={(e) => p.onDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                p.onAddInvite()
              }
            }}
            placeholder="teammate@company.com"
            aria-invalid={Boolean(p.errors.invite)}
            className={cn(glassField, 'h-[38px] flex-1')}
          />
          <button type="button" onClick={p.onAddInvite} className="press h-9 shrink-0 self-center rounded-full bg-chip-active px-5 text-sm font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14)] transition-colors hover:bg-[#61428a] sm:w-[153px]">
            Add Member
          </button>
        </div>
        <FieldError>{p.errors.invite}</FieldError>
        {p.invites.length ? (
          <ul className="mt-3 space-y-2">
            {p.invites.map((inv) => (
              <li key={inv.email} className="flex h-10 items-center gap-2 rounded-full bg-black/25 pl-4 pr-1.5 text-sm text-white animate-fade-in">
                <span className="min-w-0 flex-1 truncate">{inv.email}</span>
                <select
                  value={inv.role}
                  onChange={(e) => p.onInviteRole(inv.email, e.target.value)}
                  aria-label={`Role for ${inv.email}`}
                  className="h-7 rounded-full border border-white/[0.18] bg-transparent px-2.5 text-[13px] text-white focus:outline-none [&>option]:bg-[#1f1f1f]"
                >
                  {ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
                <button type="button" onClick={() => p.onRemoveInvite(inv.email)} className="flex size-7 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white" aria-label={`Remove ${inv.email}`}>
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="mt-[37px] flex items-center justify-between gap-4">
        <button type="button" onClick={p.onSkip} className="text-sm font-medium text-white transition-opacity hover:opacity-75">
          Skip invites
        </button>
        <button type="button" onClick={p.onContinue} className="shimmer press h-[46px] w-[186px] rounded-full bg-grad-button-alt text-[15px] font-semibold text-white [text-shadow:0_1px_2px_rgba(40,20,80,0.35)]">
          Continue
        </button>
      </div>
    </div>
  )
}
