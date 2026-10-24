import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, Briefcase, Building2, CalendarDays, KeyRound, Mail, Shield, UserRound } from 'lucide-react'
import { breadcrumbFor } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { formatDate } from '@/lib/dates'
import { fileUrl } from '@/lib/files'
import { PageHeader } from '@/components/ui/page-header'
import { AvatarCard, LanguageCard, ProfileCard } from '@/components/settings/profile-forms'
import { FactRow, SurfaceHeader } from '@/components/settings/surface'
import { WhatsAppCard } from '@/components/settings/whatsapp-card'
import { canMessageOnWhatsApp, WA_RECIPIENT_ROLES } from '@/modules/whatsapp/recipients'
import { formatPhone } from '@/modules/whatsapp/phone'
import { isWhatsAppConnected } from '@/modules/whatsapp/connection'
import { whatsAppEnabled } from '@/modules/features/flags'
import { Member } from '@/models/Member'
import { User } from '@/models/User'
import { Employee } from '@/models/muster/Employee'
import { CopyButton } from '@/components/settings/copy-button'
import { personalTaskAddress } from '@/modules/connectors/email/service'
import { localeOfUser } from '@/lib/i18n'

export const metadata: Metadata = { title: 'My account (login)' }

export default async function ProfilePage() {
  const ctx = await requireMember()
  const { user, member } = ctx
  const [manager, employee, teamWhatsApp, whatsappOn] = await Promise.all([
    member.managerId ? ctx.db(Member).findById(member.managerId, { userId: 1 }).lean() : null,
    member.employeeId && ctx.has('muster') ? ctx.db(Employee).findById(member.employeeId, { code: 1 }).lean() : null,
    isWhatsAppConnected(ctx.orgId),
    whatsAppEnabled(),
  ])
  const flowbitBills = whatsappOn && WA_RECIPIENT_ROLES.includes(member.role)
  const managerUser = manager ? await User.findById(manager.userId, { name: 1 }).lean() : null
  const avatarUrl = user.avatarFileId ? fileUrl(user.avatarFileId) : null
  const taskAddress = ctx.has('work') && ctx.can('tasks.write') ? personalTaskAddress(ctx) : null

  return (
    <>
      <PageHeader title="My account (login)" help="login-vs-employee" description="Your sign-in: name, photo, email and language. Salary, bank and leave live on your employee record in My HR." breadcrumb={breadcrumbFor('/app/settings/profile')} />
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 space-y-4 xl:col-span-7">
          <ProfileCard name={user.name} email={user.email} title={member.title ?? ''} skills={member.skills ?? []} timezone={member.timezone ?? ''} />
          <AvatarCard name={user.name} avatarUrl={avatarUrl} />
          <LanguageCard locale={localeOfUser(user)} />
          {flowbitBills || teamWhatsApp ? (
            <WhatsAppCard
              flowbitBills={flowbitBills}
              teamAlerts={teamWhatsApp}
              phone={user.phone && user.phoneVerifiedAt ? formatPhone(user.phone) : (user.phone ?? null)}
              verified={Boolean(user.phone && user.phoneVerifiedAt)}
              optedIn={canMessageOnWhatsApp({ id: String(user._id), phone: user.phone, phoneVerifiedAt: user.phoneVerifiedAt, whatsapp: user.whatsapp })}
            />
          ) : null}
          {taskAddress ? (
            <section className="glass space-y-3 rounded-[14px] p-5">
              <SurfaceHeader icon={<Mail strokeWidth={1.5} />} label="Email to task" description="Forward or send any email here from your own address: the subject becomes the title, the body the description, and attachments are added. Keep it private." />
              <div className="flex h-10 items-center gap-2 rounded-full bg-control pl-4 pr-1.5 ring-1 ring-inset ring-white/10">
                <code className="min-w-0 flex-1 truncate text-xs text-fg-2">{taskAddress}</code>
                <CopyButton value={taskAddress} />
              </div>
              <p className="text-xs text-fg-3">{ctx.org.security?.mailToTaskTeammates ? `Mail from you or a member of ${ctx.org.name} is accepted` : 'Only mail from your own address is accepted'}; the task is assigned to you. Mail that fails SPF, DKIM or DMARC is refused.</p>
            </section>
          ) : null}
        </div>
        <section className="glass col-span-12 h-fit rounded-[14px] p-5 xl:col-span-5">
          <SurfaceHeader icon={<Briefcase strokeWidth={1.5} />} label={`In ${ctx.org.name}`} description="Department and manager are managed by your admin." />
          <div className="mt-4 border-t border-line-soft pt-2">
            <FactRow icon={<Shield strokeWidth={1.5} />} label="Role">
              <span className="font-medium text-blush">{ctx.roleLabel}</span>
            </FactRow>
            <FactRow icon={<Building2 strokeWidth={1.5} />} label="Department">{member.department || <span className="text-[#979797]">Not set</span>}</FactRow>
            <FactRow icon={<UserRound strokeWidth={1.5} />} label="Manager">{managerUser?.name ?? <span className="text-[#979797]">None</span>}</FactRow>
            <FactRow icon={<CalendarDays strokeWidth={1.5} />} label="Joined">{formatDate(member.joinedAt)}</FactRow>
            <FactRow icon={<KeyRound strokeWidth={1.5} />} label="Sign-in methods">
              {[user.passwordHash ? 'Password' : null, user.googleId ? 'Google' : null].filter(Boolean).join(' · ') || '—'}
            </FactRow>
          </div>
          {employee ? (
            <Link href="/app/me" className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-link hover:underline">
              Employee record {employee.code} <ArrowRight className="size-4" strokeWidth={1.5} />
            </Link>
          ) : null}
        </section>
      </div>
    </>
  )
}
