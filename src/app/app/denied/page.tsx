import type { Metadata } from 'next'
import { ShieldAlert } from 'lucide-react'
import { requireMember } from '@/lib/ctx'
import { buttonClass } from '@/components/ui/button-styles'
import { EmptyState } from '@/components/ui/empty-state'
import Link from 'next/link'

export const metadata: Metadata = { title: 'No access' }

export default async function DeniedPage() {
  const ctx = await requireMember({ allowBlocked: true })
  return (
    <div className="glass">
      <EmptyState
        icon={<ShieldAlert />}
        title="You don't have access to that page"
        description={`Your role (${ctx.roleLabel}) doesn't include it. Ask a workspace admin to change your role if you need it.`}
        action={
          <Link href="/app" className={buttonClass('primary')}>
            Back to Home
          </Link>
        }
      />
    </div>
  )
}
