'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { checkSlugAction, createWorkspaceAction } from '@/lib/auth/actions'
import { cn, slugDraft, slugify } from '@/lib/utils'
import { play } from '@/lib/sound'
import { guard, toast } from '@/lib/toast'
import { Logo } from '@/components/ui/logo'
import { Ribbon } from '../_components/ribbon'
import { StepMode } from './step-mode'
import { StepVerify } from './step-verify'
import { StepWorkspace, type Invitee, type SignupLimits, type SlugState } from './step-workspace'

const SLUG_DEBOUNCE_MS = 400
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
/** Unsent answers survive a refresh or browser Back (this tab only); cleared once the workspace exists. */
const DRAFT_KEY = 'flowbit.onboarding.draft'

type Draft = { step: 1 | 2; name: string; slug: string; slugEdited: boolean; teamSize: string; taxId: string; invites: Invitee[]; mode: Mode }

function readDraft(): Partial<Draft> | null {
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY)
    return raw ? (JSON.parse(raw) as Partial<Draft>) : null
  } catch {
    return null
  }
}

function writeDraft(draft: Draft | null): void {
  try {
    if (draft) window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
    else window.sessionStorage.removeItem(DRAFT_KEY)
  } catch {
    // Storage blocked (private window): the wizard still works, it just forgets on refresh.
  }
}

export type Mode = 'project' | 'personal'

/** Two step bars, 57 x 4 (Figma): the active ones carry the blush-to-violet gradient. */
function StepBars({ step }: { step: 1 | 2 }) {
  return (
    <div className="mt-[31px] flex gap-2.5" role="progressbar" aria-valuemin={1} aria-valuemax={2} aria-valuenow={step} aria-label={`Step ${step} of 2`}>
      {[1, 2].map((s) => (
        <span key={s} className={cn('h-1 w-[57px] rounded-[2px] transition-colors duration-500', s <= step ? 'bg-[image:var(--grad-step)]' : 'bg-[#625F67]')} />
      ))}
    </div>
  )
}

/** The onboarding card: glass on the mauve backdrop, ribbons bent behind its left and right edges. */
export function OnboardingWizard({ email, notice, verified: verifiedAtLoad, limits }: { email: string; notice?: string; verified: boolean; limits: SignupLimits }) {
  const router = useRouter()
  const [verified, setVerified] = useState(verifiedAtLoad)
  const [taxId, setTaxId] = useState('')
  const [step, setStep] = useState<1 | 2>(1)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [slugState, setSlugState] = useState<SlugState>({ status: 'idle' })
  const [teamSize, setTeamSize] = useState('Just myself')
  const [invites, setInvites] = useState<Invitee[]>([])
  const [draft, setDraft] = useState('')
  const [mode, setMode] = useState<Mode>('project')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [pending, startTransition] = useTransition()
  const [restored, setRestored] = useState(false)
  // The field may end in a hyphen while typing ("my-"); checks and the request use the finished slug.
  const cleanSlug = slugify(slug)

  // Before the draft restore: on mount both set the slug, and the restored one must win.
  useEffect(() => {
    if (!slugEdited) setSlug(slugify(name))
  }, [name, slugEdited])

  useEffect(() => {
    const saved = readDraft()
    if (saved) {
      if (typeof saved.name === 'string') setName(saved.name)
      if (typeof saved.slug === 'string') setSlug(saved.slug)
      if (typeof saved.slugEdited === 'boolean') setSlugEdited(saved.slugEdited)
      if (typeof saved.teamSize === 'string') setTeamSize(saved.teamSize)
      if (typeof saved.taxId === 'string') setTaxId(saved.taxId)
      if (Array.isArray(saved.invites)) setInvites(saved.invites.filter((i) => typeof i?.email === 'string' && typeof i?.role === 'string'))
      if (saved.mode === 'project' || saved.mode === 'personal') setMode(saved.mode)
      if (saved.step === 2 && saved.name?.trim() && saved.slug) setStep(2)
    }
    setRestored(true)
  }, [])

  useEffect(() => {
    if (restored) writeDraft({ step, name, slug, slugEdited, teamSize, taxId, invites, mode })
  }, [restored, step, name, slug, slugEdited, teamSize, taxId, invites, mode])

  // A field's error belongs to the value that caused it; editing the value clears it.
  const clearError = (key: string) => setErrors(({ [key]: _drop, ...rest }) => rest)

  useEffect(() => {
    if (!cleanSlug) {
      setSlugState({ status: 'idle' })
      return
    }
    setSlugState({ status: 'checking' })
    const timer = setTimeout(async () => {
      const res = await checkSlugAction(cleanSlug)
      setSlugState({ status: res.available ? 'ok' : 'bad', message: res.message })
    }, SLUG_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [cleanSlug])

  /** Adds the typed address to the list; false (with a field error) when it cannot be added. */
  const addInvite = (): boolean => {
    const value = draft.trim().toLowerCase()
    if (!EMAIL_RE.test(value)) {
      setErrors((e) => ({ ...e, invite: 'Enter a valid email address' }))
      play('error')
      return false
    }
    if (value === email || invites.some((i) => i.email === value)) {
      setErrors((e) => ({ ...e, invite: value === email ? 'That is you. You are already the owner' : 'Already on the list' }))
      play('error')
      return false
    }
    setInvites((list) => [...list, { email: value, role: 'member' }])
    setDraft('')
    clearError('invite')
    play('pop')
    return true
  }

  const validateStep1 = () => {
    const next: Record<string, string> = {}
    if (!name.trim()) next.name = 'Workspace name is required'
    if (!cleanSlug) next.slug = 'Workspace URL is required'
    else if (slugState.status === 'bad') next.slug = slugState.message ?? 'Choose another URL'
    setErrors(next)
    if (Object.keys(next).length) {
      play('error')
      return false
    }
    return true
  }

  const goNext = (skipInvites: boolean) => {
    if (!validateStep1()) return
    const dropped = invites.length + (draft.trim() ? 1 : 0)
    if (skipInvites && dropped && !window.confirm(`Skip invites? The ${dropped === 1 ? 'person' : `${dropped} people`} you added will not be invited, and a smaller team may start on Free instead of a trial.`)) return
    if (skipInvites) {
      setInvites([])
      setDraft('')
    } else if (draft.trim() && !addInvite()) {
      // A typed but unadded address is added on Continue, never dropped silently.
      return
    }
    setSlug(cleanSlug)
    play('whoosh')
    setStep(2)
  }

  const submit = () =>
    startTransition(guard(async () => {
      const fd = new FormData()
      fd.set('name', name.trim())
      fd.set('slug', cleanSlug)
      fd.set('teamSize', teamSize)
      fd.set('taxId', taxId.trim())
      fd.set('mode', mode)
      invites.forEach((inv, i) => {
        fd.set(`invites.${i}.email`, inv.email)
        fd.set(`invites.${i}.role`, inv.role)
      })
      const res = await createWorkspaceAction(fd)
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {})
        toast.error(res.error)
        if (res.fieldErrors && 'code' in res.fieldErrors) setVerified(false)
        else if (res.fieldErrors && ['name', 'slug', 'teamSize', 'taxId'].some((k) => k in res.fieldErrors!)) setStep(1)
        return
      }
      writeDraft(null)
      play('whoosh')
      toast.success(res.message ?? 'Workspace created')
      router.push(res.redirect ?? '/app')
      router.refresh()
    }))

  return (
    <div className="relative z-10 w-full max-w-[758px]">
      {/* Ribbons: the outer arms are the Figma raster; where they pass behind the glass, a soft glow stands in for the bend. */}
      <Ribbon name="onboardingLeft" className="hidden lg:block" style={{ left: -113, top: 263.5 }} />
      <Ribbon name="onboardingRight" phase="b" className="hidden lg:block" style={{ right: -61.5, top: 460.5 }} />
      <span aria-hidden className="absolute left-[-6px] top-[300px] hidden h-[190px] w-[90px] rotate-[-18deg] rounded-full bg-[radial-gradient(closest-side,rgba(233,169,221,0.85),rgba(160,90,170,0.35)_55%,transparent)] lg:block" />
      <span aria-hidden className="absolute right-[2px] top-[510px] hidden h-[220px] w-[64px] rotate-[-32deg] rounded-full bg-[radial-gradient(closest-side,rgba(233,169,221,0.9),rgba(160,90,170,0.35)_55%,transparent)] lg:block" />

      <div className="lit-edge lit-edge-bright relative overflow-hidden rounded-[16px] bg-white/[0.1] px-5 pb-8 pt-6 backdrop-blur-[40px] backdrop-saturate-[1.2] animate-scale-in sm:px-[46px] sm:pb-[41px] sm:pt-[25px]">
        {step === 1 ? (
          <span aria-hidden className="pointer-events-none absolute right-[30px] top-[33px] hidden select-none text-[124px] font-bold leading-none tracking-[-0.01em] text-black/[0.18] [writing-mode:vertical-rl] rotate-180 sm:block">
            workspace
          </span>
        ) : null}
        <div className="relative">
          <Logo size={35} />
          <StepBars step={step} />
          {notice && step === 1 ? (
            <p role="status" className="mt-5 rounded-[10px] border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
              {notice}
            </p>
          ) : null}
          {!verified ? (
            <StepVerify email={email} onVerified={() => setVerified(true)} />
          ) : step === 1 ? (
            <StepWorkspace
              limits={limits}
              name={name}
              onName={(v) => {
                setName(v)
                clearError('name')
                if (!slugEdited) clearError('slug')
              }}
              slug={slug}
              onSlug={(v) => {
                setSlugEdited(true)
                setSlug(slugDraft(v))
                clearError('slug')
              }}
              slugState={slugState}
              teamSize={teamSize}
              onTeamSize={(v) => {
                setTeamSize(v)
                clearError('teamSize')
              }}
              taxId={taxId}
              onTaxId={(v) => {
                setTaxId(v)
                clearError('taxId')
              }}
              draft={draft}
              onDraft={(v) => {
                setDraft(v)
                clearError('invite')
              }}
              invites={invites}
              onAddInvite={() => void addInvite()}
              onInviteRole={(address, role) => setInvites((list) => list.map((i) => (i.email === address ? { ...i, role } : i)))}
              onRemoveInvite={(address) => setInvites((list) => list.filter((i) => i.email !== address))}
              errors={errors}
              onSkip={() => goNext(true)}
              onContinue={() => goNext(false)}
            />
          ) : (
            <StepMode mode={mode} onMode={setMode} pending={pending} onBack={() => setStep(1)} onCreate={submit} />
          )}
        </div>
      </div>
    </div>
  )
}
