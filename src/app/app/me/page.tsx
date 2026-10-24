import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, BadgeCheck, BriefcaseBusiness, Building2, CalendarCheck, CalendarDays, ClipboardCheck, FileText, Hash, IdCard, Landmark, Laptop, Mail, MapPin, MessageSquareText, MessageSquareWarning, Plane, Receipt, UserRound, Wallet } from 'lucide-react'
import { requireMember } from '@/lib/ctx'
import { formatDate, minutesOfDayIST, monthOf, todayIST } from '@/lib/dates'
import { greetingKey, localeOfUser, translator, type MessageKey } from '@/lib/i18n'
import { cn, firstName } from '@/lib/utils'
import { Badge, TONE_TEXT } from '@/components/ui/badge'
import { Card, CardHeader } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Facts } from '@/components/muster/ui/facts'
import { Figures } from '@/components/muster/ui/figures'
import { chipClass } from '@/components/muster/ui/filter-chips'
import { ListCard, ListRow, ListRows } from '@/components/muster/ui/list-card'
import { DetailsForm } from '@/components/muster/me/details-form'
import { NotLinked } from '@/components/muster/me/not-linked'
import { AskHrForm } from '@/components/muster/me/request-forms'
import { BankChangeRequest } from '@/models/muster/BankChangeRequest'
import { EmployeeRemark } from '@/models/muster/EmployeeRemark'
import { getMonthRegister } from '@/modules/muster/attendance/queries'
import { getLeaveBalances } from '@/modules/muster/leave/balances'
import { myChecklist, myContext, myEmployee } from '@/modules/muster/me/queries'
import { EMPLOYMENT_TYPE_LABEL, workModeOf, type EmploymentType } from '@/modules/muster/people/lifecycle'
import { REMARK_KIND_LABEL } from '@/modules/muster/settings/defaults'

export const metadata: Metadata = { title: 'My employee record' }

const LINKS: { href: string; label: MessageKey; icon: typeof Plane }[] = [
  { href: '/app/me/leave', label: 'me.link.leave', icon: Plane },
  { href: '/app/me/attendance', label: 'me.link.attendance', icon: CalendarCheck },
  { href: '/app/me/claims', label: 'me.link.claims', icon: Receipt },
  { href: '/app/me/payslips', label: 'me.link.payslips', icon: Wallet },
  { href: '/app/me/letters', label: 'me.link.letters', icon: FileText },
]

export default async function MePage() {
  const ctx = await requireMember({ product: 'muster' })
  const locale = localeOfUser(ctx.user)
  const t = translator(locale)
  const employee = await myEmployee(ctx)
  if (!employee) return <NotLinked locale={locale} canAddSelf={ctx.can('people.write')} />
  const today = todayIST()
  const [about, checklist, balances, register, bankChanges, notes] = await Promise.all([
    myContext(ctx, employee),
    myChecklist(ctx, employee),
    getLeaveBalances(ctx, employee, today),
    getMonthRegister(ctx, monthOf(today), { employeeIds: [String(employee._id)] }),
    ctx.db(BankChangeRequest).find({ employeeId: employee._id }).sort({ createdAt: -1 }).limit(5).lean(),
    ctx.db(EmployeeRemark).find({ employeeId: employee._id, visibleToEmployee: true, deletedAt: null }, { kind: 1, occurredOn: 1, body: 1, authorName: 1 }).sort({ occurredOn: -1, createdAt: -1 }).limit(8).lean(),
  ])
  const month = register.rows[0]?.summary
  const earned = balances.rows.filter((r) => r.remaining !== null)
  const pending = balances.rows.reduce((s, r) => s + r.pending, 0)
  const missingKeys = checklist.progress.missing.map((s) => s.key)

  const viewAll = 'inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-white/80 transition-colors hover:text-white'

  return (
    <div className="@container">
      <header className="mb-[22px] flex flex-col gap-4 animate-slide-up lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-xl font-medium leading-6 text-white">
            {t(greetingKey(Math.floor(minutesOfDayIST(new Date()) / 60)))}, <span className="text-name">{firstName(employee.fullName)}</span>
          </h1>
          <p className="mt-2 text-sm text-white">
            {formatDate(today, { withWeekday: true, locale: locale === 'hi' ? 'hi-IN' : undefined })}
            <span className="text-white/60"> · {employee.designation ?? t('me.teamMember')}{about.department ? `, ${about.department}` : ''}</span>
          </p>
        </div>
        <nav aria-label="Self-service" className="flex flex-wrap gap-2">
          {LINKS.filter((l) => l.href !== '/app/me/payslips' || ctx.hasFeature('muster.payroll')).map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className={cn(chipClass(false), 'lift h-9 px-4 [&_svg]:text-icon-muted')}>
              <Icon /> {t(label)}
            </Link>
          ))}
        </nav>
      </header>
      <div className="grid grid-cols-12 gap-3">
        <Card className="col-span-12 rounded-[14px] md:col-span-6 xl:col-span-4">
          <CardHeader label={t('me.leave.label')} icon={<Plane />} description={t('me.leave.year', { year: balances.year.label })} actions={<Link href="/app/me/leave" className={viewAll}>{t('me.leave.apply')} <ArrowRight className="size-3" /></Link>} />
          {earned.length && earned.some((r) => r.accrues) ? (
            <ul>
              {earned.map((r) => (
                <li key={r.typeId} className="flex items-baseline justify-between gap-3 border-b border-white/[0.1] py-2.5 last:border-0">
                  <span className="text-sm text-white/85">{r.name}</span>
                  <span className="text-2xl font-semibold leading-[30px] tabular-nums text-white">
                    {r.remaining}
                    <span className="ml-1 text-xs font-normal text-fg-2">{t('common.days')}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-fg-2">{t('me.leave.none')}</p>
          )}
          {pending ? <p className={cn('mt-3 text-xs', TONE_TEXT.warning)}>{t('me.leave.pending', { n: pending })}</p> : null}
        </Card>
        <Card className="col-span-12 rounded-[14px] md:col-span-6 xl:col-span-4">
          <CardHeader label={t('me.month.label')} icon={<CalendarCheck />} actions={<Link href="/app/me/attendance" className={viewAll}>{t('me.month.details')} <ArrowRight className="size-3" /></Link>} />
          {month ? (
            <>
              <Figures
                items={[
                  { label: t('me.month.payable'), value: month.payableDays, hint: t('me.month.ofWorking', { n: month.workingDays }) },
                  { label: t('me.month.lop'), value: month.lopDays, tone: month.lopDays > 0 ? 'danger' : undefined, hint: month.lopDays > 0 ? t('me.month.lopSoFar') : t('me.month.noneSoFar') },
                ]}
              />
              {month.assumedDays || month.upcomingDays ? <p className="mt-4 text-xs text-fg-2">{t('me.month.includes', { parts: [month.assumedDays ? t('me.month.notMarked', { n: month.assumedDays }) : '', month.upcomingDays ? t('me.month.toCome', { n: month.upcomingDays }) : ''].filter(Boolean).join(t('me.month.and')) })}</p> : null}
            </>
          ) : (
            <p className="text-sm text-fg-2">{t('me.month.notEmployed')}</p>
          )}
        </Card>
        <Card className="col-span-12 rounded-[14px] xl:col-span-4">
          <CardHeader label={t('me.checklist.label')} icon={<ClipboardCheck />} />
          <Progress size="lg" value={checklist.progress.percent} label={t('me.checklist.done', { done: checklist.progress.done, total: checklist.progress.total })} />
          {checklist.progress.missing.length ? (
            <ul className="mt-4 flex flex-wrap gap-1.5">
              {checklist.progress.missing.map((s) => <li key={s.key}><Badge tone="warning">{s.label}</Badge></li>)}
            </ul>
          ) : (
            <p className={cn('mt-4 flex items-center gap-1.5 text-sm', TONE_TEXT.success)}><BadgeCheck className="size-4" /> {t('me.checklist.nothing')}</p>
          )}
          {checklist.progress.missing.some((s) => s.group === 'Documents') ? <p className="mt-3 text-xs text-fg-2">{t('me.checklist.docsBefore')} <Link href="/app/me/documents" className="text-link underline-offset-2 hover:underline">{t('me.checklist.docsLink')}</Link>.</p> : null}
        </Card>
        <Card className="col-span-12 self-start rounded-[14px] lg:col-span-4">
          <CardHeader label={t('me.details.label')} icon={<IdCard />} />
          <Facts
            items={[
              { icon: <Hash />, label: t('me.details.employeeId'), value: <span className="font-mono text-[13px]">{employee.code}</span> },
              { icon: <Mail />, label: t('me.details.workEmail'), value: employee.workEmail },
              { icon: <CalendarDays />, label: t('me.details.joined'), value: formatDate(employee.joinDate) },
              { icon: <UserRound />, label: t('me.details.manager'), value: about.manager },
              { icon: <Building2 />, label: t('me.details.department'), value: about.department },
              { icon: <BriefcaseBusiness />, label: t('me.details.employment'), value: EMPLOYMENT_TYPE_LABEL[employee.employmentType as EmploymentType] ?? employee.employmentType },
              { icon: <MapPin />, label: t('me.details.location'), value: employee.workLocation },
              { icon: <Laptop />, label: t('me.details.workMode'), value: t(`me.details.workMode.${workModeOf(employee.workMode)}`) },
            ]}
          />
          <p className="mt-3 text-xs text-fg-2">{t('me.details.keptByHr')}</p>
        </Card>
        <Card variant="solid" className="col-span-12 lg:col-span-8">
          <CardHeader label={t('me.update.label')} icon={<IdCard />} />
          <DetailsForm
            missing={missingKeys}
            values={{
              personalEmail: employee.personalEmail ?? '',
              phone: employee.phone ?? '',
              dob: employee.dob ?? '',
              address: employee.address?.text ?? '',
              emergencyName: employee.emergencyContact?.name ?? '',
              emergencyPhone: employee.emergencyContact?.phone ?? '',
              emergencyRelation: employee.emergencyContact?.relation ?? '',
              pan: employee.pan ?? '',
              uan: employee.uan ?? '',
              bankName: employee.bank?.bankName ?? '',
              accountName: employee.bank?.accountName ?? '',
              accountNumber: employee.bank?.accountNumber ?? '',
              ifsc: employee.bank?.ifsc ?? '',
            }}
          />
        </Card>
        <ListCard className="col-span-12 lg:col-span-6" label={t('me.bank.label')} icon={<Landmark />} description={t('me.bank.description')}>
          {bankChanges.length ? (
            <ListRows>
              {bankChanges.map((b) => (
                <ListRow key={String(b._id)} className="flex-nowrap justify-between">
                  <span className="min-w-0 truncate text-white/85">{formatDate(b.createdAt)} · {b.previousMasked || 'none'} → <span className="text-white">{b.newMasked}</span></span>
                  {b.verifiedAt ? <Badge tone="success">{t('me.bank.verified')}</Badge> : <Badge tone="warning">{t('me.bank.waiting')}</Badge>}
                </ListRow>
              ))}
            </ListRows>
          ) : (
            <p className="px-5 py-6 text-sm text-fg-2 sm:px-[23px]">{t('me.bank.none')}</p>
          )}
        </ListCard>
        <Card variant="solid" className="col-span-12 lg:col-span-6">
          <CardHeader label={t('me.askHr.label')} icon={<MessageSquareWarning />} />
          <AskHrForm />
        </Card>
        {notes.length ? (
          <Card className="col-span-12">
            <CardHeader label={t('me.notes.label')} icon={<MessageSquareText />} description={t('me.notes.description')} />
            <ul className="border-t border-line">
              {notes.map((n) => (
                <li key={String(n._id)} className="border-b border-white/[0.1] py-4 last:border-0">
                  <p className="mb-1.5 text-xs text-fg-2"><span className="font-medium text-white">{REMARK_KIND_LABEL[n.kind] ?? n.kind}</span> · {formatDate(n.occurredOn)}{n.authorName ? ` · ${n.authorName}` : ''}</p>
                  <p className="max-w-[72ch] whitespace-pre-line text-sm leading-relaxed text-white/85">{n.body}</p>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </div>
    </div>
  )
}
