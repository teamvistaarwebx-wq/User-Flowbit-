import { Download, FileLock2, FileSignature, ScrollText } from 'lucide-react'
import Link from 'next/link'
import { formatDate } from '@/lib/dates'
import { Badge, StatusPill } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { buttonClass } from '@/components/ui/button-styles'
import { EmptyState } from '@/components/ui/empty-state'
import { lettersFor } from '@/modules/muster/people/foreign'
import { mayDecideOwn, ownEmployeeId } from '@/modules/muster/people/scope'
import { ListCard, ListRow, ListRows } from '../../ui/list-card'
import type { TabProps } from './types'

/** Letters tab (letters.read): letters issued to this person; pay-stating ones stay locked without payroll.read. */
export async function LettersTab({ ctx, employee: e }: TabProps) {
  const ownRecord = String(e._id) === ownEmployeeId(ctx) && !mayDecideOwn(ctx)
  // Drafts about yourself stay with HR until they are issued.
  const letters = (await lettersFor(ctx, String(e._id))).filter((l) => !(ownRecord && l.status === 'draft'))
  const seesPay = ctx.can('payroll.read')
  const canDraft = ctx.can('letters.write')
  return (
    <ListCard label="Letters" icon={<ScrollText />} description="Offer, confirmation and experience letters issued to them" actions={canDraft ? <Button size="sm" variant="violet" icon={<FileSignature className="size-4" />} href={`/app/hr/letters/new?employee=${e._id}`}>Draft a letter</Button> : null}>
      {letters.length ? (
        <ListRows>
          {letters.map((l) => {
            const locked = l.statesPay && !seesPay
            return (
              <ListRow key={l.id}>
                <span className="min-w-0 flex-1">
                  {locked ? (
                    <span className="inline-flex items-center gap-1.5 text-fg-2"><FileLock2 className="size-4" /> Letter stating pay</span>
                  ) : (
                    <Link href={`/app/hr/letters/${l.id}`} className="text-white transition-colors hover:text-blush">{l.templateName}</Link>
                  )}
                  <span className="block text-xs text-fg-2">{l.referenceNumber || 'Draft'} · {l.issueDate ? formatDate(l.issueDate) : 'not issued'}{l.emailed ? ' · emailed' : ''}</span>
                </span>
                {l.statesPay ? <Badge tone="orchid">States pay</Badge> : null}
                <StatusPill status={l.status} />
                {locked ? null : <a href={l.pdfHref} className={buttonClass('secondary', 'sm')} target="_blank" rel="noreferrer"><Download className="size-3.5" /> PDF</a>}
              </ListRow>
            )
          })}
        </ListRows>
      ) : (
        <EmptyState compact icon={<ScrollText />} title="No letters yet" description="Offer, confirmation and experience letters issued to them appear here." />
      )}
    </ListCard>
  )
}
