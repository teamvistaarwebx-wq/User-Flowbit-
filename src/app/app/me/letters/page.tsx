import type { Metadata } from 'next'
import { Download, FileText } from 'lucide-react'
import { breadcrumbFor } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { formatDate } from '@/lib/dates'
import { localeOfUser, translator } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { StatusPill, TONE_TEXT } from '@/components/ui/badge'
import { buttonClass } from '@/components/ui/button-styles'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { ListCard, ListRow, ListRows } from '@/components/muster/ui/list-card'
import { NotLinked } from '@/components/muster/me/not-linked'
import { Letter } from '@/models/muster/Letter'
import { CATEGORY_LABELS, type LetterCategory } from '@/modules/muster/letters/catalogue'
import { myEmployee } from '@/modules/muster/me/queries'

export const metadata: Metadata = { title: 'My letters' }
const BASE = '/app/me/letters'

export default async function MyLettersPage() {
  const ctx = await requireMember({ product: 'muster' })
  const locale = localeOfUser(ctx.user)
  const t = translator(locale)
  const employee = await myEmployee(ctx)
  if (!employee) return <NotLinked locale={locale} />
  // Drafts are HR's work in progress and never shown here.
  const letters = await ctx.db(Letter).find({ employeeId: employee._id, status: { $in: ['issued', 'revoked'] } }, { body: 0, variables: 0, inputs: 0 }).sort({ issueDate: -1 }).lean()

  return (
    <>
      <PageHeader title={t('letters.title')} description={t('letters.description')} breadcrumb={breadcrumbFor(BASE)} />
      <ListCard label={t('letters.issued')} icon={<FileText />} description={t('letters.count', { n: letters.length })}>
        {letters.length ? (
          <ListRows>
            {letters.map((l) => (
              <ListRow key={String(l._id)} className="flex-col items-stretch sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm text-white">{l.templateName}</p>
                  <p className="text-xs text-fg-2">
                    {l.referenceNumber} · {formatDate(l.issueDate)} · {CATEGORY_LABELS[l.category as LetterCategory] ?? l.category}
                  </p>
                  {l.status === 'revoked' ? <p className={cn('mt-1 text-xs', TONE_TEXT.danger)}>{t('letters.revoked')}{l.revokeReason ? `: ${l.revokeReason}` : ''}</p> : null}
                </div>
                <div className="flex items-center gap-2">
                  <StatusPill status={l.status} />
                  <a href={`/api/muster/letters/${l._id}?download=1`} className={buttonClass('secondary', 'sm')}>
                    <Download className="size-3.5" /> PDF
                  </a>
                </div>
              </ListRow>
            ))}
          </ListRows>
        ) : (
          <EmptyState icon={<FileText />} title={t('letters.emptyTitle')} description={t('letters.emptyBody')} />
        )}
      </ListCard>
    </>
  )
}
