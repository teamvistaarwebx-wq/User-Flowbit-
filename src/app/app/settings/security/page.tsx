import type { Metadata } from 'next'
import { breadcrumbFor } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { formatDate, timeAgo } from '@/lib/dates'
import { PageHeader } from '@/components/ui/page-header'
import { PasswordCard, SessionsCard, type SessionRow } from '@/components/settings/security-forms'
import { RequireTwoFactorCard, TwoFactorCard } from '@/components/settings/two-factor-card'
import { MailToTaskTeammatesCard } from '@/components/settings/mail-to-task-card'
import { isInboundEmailConfigured } from '@/lib/env'
import { twoFactorView } from '@/modules/settings/two-factor-view'
import { TWO_FACTOR_ADMIN_ROLES } from '@/lib/auth/two-factor-core'
import { Org } from '@/models/Org'
import { Session } from '@/models/Session'
import { deviceLabel } from '@/modules/settings/format'

export const metadata: Metadata = { title: 'Security' }

export default async function SecurityPage() {
  const ctx = await requireMember({ allowWithout2fa: true, allowBlocked: true })
  const sessions = await Session.find({ userId: ctx.userId, expiresAt: { $gt: new Date() } }).sort({ lastSeenAt: -1 }).limit(50).lean()
  const orgs = await Org.find({ _id: { $in: sessions.map((s) => s.activeOrgId).filter(Boolean) } }, { name: 1 }).lean()
  const orgName = new Map(orgs.map((o) => [String(o._id), o.name]))
  const rows: SessionRow[] = sessions.map((s) => ({
    id: String(s._id),
    device: deviceLabel(s.userAgent),
    workspace: (s.activeOrgId && orgName.get(String(s.activeOrgId))) || 'No workspace',
    lastActive: timeAgo(s.lastSeenAt ?? s.updatedAt),
    signedIn: formatDate(s.createdAt),
    current: String(s._id) === String(ctx.session._id),
  }))
  const required = Boolean(ctx.org.security?.requireTwoFactorAdmins)
  const view = twoFactorView(ctx.user)
  return (
    <>
      <PageHeader title="Security" description="Your password, two-factor sign-in and the devices you're signed in on." breadcrumb={breadcrumbFor('/app/settings/security')} />
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 xl:col-span-7">
          <TwoFactorCard view={view} required={ctx.twoFactorMissing || (required && TWO_FACTOR_ADMIN_ROLES.includes(ctx.role))} />
        </div>
        {ctx.can('org.manage') ? (
          <div className="col-span-12 xl:col-span-5">
            <RequireTwoFactorCard required={required} workspace={ctx.org.name} />
          </div>
        ) : null}
        {ctx.can('org.manage') && ctx.has('work') && isInboundEmailConfigured() ? (
          <div className="col-span-12 xl:col-span-5">
            <MailToTaskTeammatesCard allowed={Boolean(ctx.org.security?.mailToTaskTeammates)} />
          </div>
        ) : null}
        <div className="col-span-12 xl:col-span-5">
          <PasswordCard hasPassword={Boolean(ctx.user.passwordHash)} />
        </div>
        <div className="col-span-12 xl:col-span-7">
          <SessionsCard sessions={rows} />
        </div>
      </div>
    </>
  )
}
