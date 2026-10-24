'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Mail } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { toast } from '@/lib/toast'
import { requestPortalCodeAction, verifyPortalCodeAction } from '@/modules/portal/public-actions'

const FAILED = 'Something went wrong. Check your connection and try again.'

const brandButton = 'press inline-flex h-11 w-full items-center justify-center gap-2 rounded-full px-6 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50'

/** Email → six-digit code → signed in. The code request answers the same for any email. */
export function PortalSignInForm({ slug }: { slug: string }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [pending, start] = useTransition()

  const send = () =>
    start(async () => {
      try {
        const res = await requestPortalCodeAction({ slug, email })
        if (!res.ok) return void toast.error(res.error)
        toast.success(res.message ?? 'Check your email.')
        setSent(true)
      } catch (error) {
        console.error('[portal] code request failed', error)
        toast.error(FAILED)
      }
    })

  const verify = () =>
    start(async () => {
      try {
        const res = await verifyPortalCodeAction({ slug, email, code })
        if (!res.ok) return void toast.error(res.error)
        router.replace(res.redirect ?? `/portal/${slug}`)
        router.refresh()
      } catch (error) {
        console.error('[portal] code check failed', error)
        toast.error(FAILED)
      }
    })

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (sent) verify()
        else send()
      }}
    >
      <label className="grid gap-1.5 text-sm text-white/80">
        Your email
        <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} disabled={sent} />
      </label>
      {sent ? (
        <label className="grid gap-1.5 text-sm text-white/80">
          Code from the email
          <Input inputMode="numeric" autoComplete="one-time-code" required maxLength={10} value={code} onChange={(e) => setCode(e.target.value)} autoFocus />
        </label>
      ) : null}
      <button type="submit" disabled={pending} className={brandButton} style={{ background: 'var(--doc-brand)', color: 'var(--doc-ink)' }}>
        {sent ? <>Sign in <ArrowRight className="size-4" /></> : <><Mail className="size-4" /> Email me a code</>}
      </button>
      {sent ? (
        <button type="button" className="w-full text-center text-xs text-white/60 hover:text-white" onClick={() => { setSent(false); setCode('') }}>
          Use another email, or send a new code
        </button>
      ) : null}
    </form>
  )
}
