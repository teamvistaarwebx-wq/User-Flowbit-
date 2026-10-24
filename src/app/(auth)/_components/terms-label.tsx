import Link from 'next/link'

/** "By signing in, you agree to our Terms of Service and Privacy Policy" (Figma), with the two documents linked. */
export function TermsLabel({ action }: { action: string }) {
  const link = 'underline-offset-[3px] hover:underline'
  return (
    <span className="block text-sm leading-[17px] text-fg">
      By {action}, you agree to our{' '}
      <Link href="/legal/terms" className={link}>
        Terms of Service
      </Link>{' '}
      and{' '}
      <Link href="/legal/privacy" className={link}>
        Privacy Policy
      </Link>
    </span>
  )
}
