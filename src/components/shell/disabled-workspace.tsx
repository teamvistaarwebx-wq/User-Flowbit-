import { ShieldAlert } from 'lucide-react'
import { buttonClass } from '@/components/ui/button-styles'
import { Logo } from '@/components/ui/logo'

/** Full-page notice for a workspace Flowbit staff disabled (Org.disabled). Nothing else renders. */
export function DisabledWorkspace({ name, reason, supportEmail }: { name: string; reason?: string | null; supportEmail: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-bg px-4 py-10">
      <Logo />
      <div className="glass-hero lit-edge w-full max-w-lg p-8 text-center">
        <ShieldAlert className="mx-auto size-8 text-icon-muted" strokeWidth={1.25} />
        <h1 className="mt-5 text-xl font-semibold text-fg">{name} has been disabled by Flowbit</h1>
        {reason ? <p className="mt-3 text-sm text-fg-2">Reason: {reason}</p> : null}
        <p className="mt-3 text-sm text-fg-2">
          Your data is kept. Contact{' '}
          <a className="text-link underline-offset-4 hover:underline" href={`mailto:${supportEmail}`}>
            {supportEmail}
          </a>{' '}
          to restore access.
        </p>
        <form action="/api/auth/signout" method="post" className="mt-7">
          <button type="submit" className={buttonClass('outline')}>
            Sign out
          </button>
        </form>
      </div>
    </div>
  )
}
