'use client'

import { useState, useTransition } from 'react'
import { MailCheck } from 'lucide-react'
import { sendSignupCodeAction, verifySignupCodeAction } from '@/lib/auth/actions'
import { cn } from '@/lib/utils'
import { play } from '@/lib/sound'
import { guard, toast } from '@/lib/toast'
import { glassField } from './step-workspace'

const CODE_LENGTH = 6

/** Step 0 (console spec 5.1): a six digit code to the account's email before the workspace exists. */
export function StepVerify({ email, onVerified }: { email: string; onVerified: () => void }) {
  const [sent, setSent] = useState(false)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | undefined>()
  const [pending, startTransition] = useTransition()

  const send = () =>
    startTransition(guard(async () => {
      const res = await sendSignupCodeAction({})
      if (!res.ok) {
        toast.error(res.error)
        play('error')
        return
      }
      setSent(true)
      setError(undefined)
      toast.success(res.message ?? 'Code sent')
    }))

  const verify = () => {
    if (code.length !== CODE_LENGTH) {
      setError('Enter the six digit code')
      play('error')
      return
    }
    startTransition(guard(async () => {
      const res = await verifySignupCodeAction({ code })
      if (!res.ok) {
        setError(res.fieldErrors?.code ?? res.error)
        play('error')
        return
      }
      play('whoosh')
      toast.success(res.message ?? 'Email verified')
      onVerified()
    }))
  }

  return (
    <div className="animate-slide-up sm:max-w-[495px]">
      <h1 className="mt-[30px] text-2xl font-semibold leading-[30px] text-white">Verify your email</h1>
      <p className="mt-1 text-sm text-white">
        We send a six digit code to <span className="font-semibold">{email}</span> so only you can set up a workspace with it.
      </p>

      {sent ? (
        <div className="mt-[30px]">
          <label htmlFor="verify-code" className="block text-sm font-medium leading-5 text-white">
            Code from the email<span className="text-[#F64A45]">*</span>
          </label>
          <input
            id="verify-code"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH))
              setError(undefined)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                verify()
              }
            }}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            aria-invalid={Boolean(error)}
            autoFocus
            className={cn(glassField, 'mt-[7px] tracking-[0.3em]')}
          />
          {error ? <p className="mt-1.5 text-[13px] text-[#FFB0AD]">{error}</p> : <p className="mt-1.5 text-[13px] text-white/70">It lasts 10 minutes. Check spam if it is not in your inbox.</p>}
        </div>
      ) : (
        <p className="mt-[30px] flex items-center gap-2 rounded-[10px] bg-black/25 px-4 py-3 text-sm text-white/80">
          <MailCheck className="size-4 shrink-0" strokeWidth={1.5} /> Phone numbers are verified later, on WhatsApp.
        </p>
      )}

      <div className="mt-[37px] flex items-center justify-between gap-4">
        {sent ? (
          <button type="button" onClick={send} disabled={pending} className="text-sm font-medium text-white transition-opacity hover:opacity-75 disabled:opacity-50">
            Send a new code
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={sent ? verify : send}
          disabled={pending}
          className="shimmer press h-[46px] w-[186px] rounded-full bg-grad-button-alt text-[15px] font-semibold text-white [text-shadow:0_1px_2px_rgba(40,20,80,0.35)] disabled:opacity-60"
        >
          {sent ? 'Verify' : 'Email me a code'}
        </button>
      </div>
    </div>
  )
}
