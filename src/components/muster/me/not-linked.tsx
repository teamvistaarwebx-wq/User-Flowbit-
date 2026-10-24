import { UserRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { DEFAULT_LOCALE, t, type Locale } from '@/lib/i18n'

/**
 * Shown on every self-service page when the member has no linked employee record. People who add employees
 * themselves (often the owner, who *is* HR) get a way to add their own record instead of being told to ask HR.
 */
export function NotLinked({ locale = DEFAULT_LOCALE, canAddSelf = false }: { locale?: Locale; canAddSelf?: boolean }) {
  return (
    <Card variant="solid" className="mt-2">
      <EmptyState
        icon={<UserRound />}
        title={t(locale, 'me.notLinked.title')}
        description={canAddSelf ? 'Add your own employee record to check in, apply for leave and get payslips. It links to this login by your email.' : t(locale, 'me.notLinked.body')}
        action={canAddSelf ? <Button size="sm" href="/app/hr/people/new?self=1">Add me as an employee</Button> : undefined}
      />
    </Card>
  )
}
