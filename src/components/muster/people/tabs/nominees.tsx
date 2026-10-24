import { HeartHandshake, Trash2 } from 'lucide-react'
import { formatDate, todayIST } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { TONE_TEXT } from '@/components/ui/badge'
import { Card, CardHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Nominee, NOMINEE_SCHEMES } from '@/models/muster/Nominee'
import { archiveNominee } from '@/modules/muster/people/record-actions'
import { NOMINEE_SCHEME_LABEL } from '@/modules/muster/settings/defaults'
import { ActionButton } from '../action-button'
import { NomineeDialog } from '../nominee-dialog'
import type { TabProps } from './types'

/** Nominees tab (people.read_sensitive): grouped by scheme, flags schemes that do not add up to 100%. */
export async function NomineesTab({ ctx, employee: e }: TabProps) {
  const rows = await ctx.db(Nominee).find({ employeeId: e._id, deletedAt: null }).sort({ scheme: 1, createdAt: 1 }).lean()
  const canWrite = ctx.can('people.write')
  const groups = NOMINEE_SCHEMES.map((scheme) => ({ scheme, rows: rows.filter((r) => r.scheme === scheme) })).filter((g) => g.rows.length)
  return (
    <Card>
      <CardHeader label="Nominees" icon={<HeartHandshake />} description="Who receives PF, gratuity or insurance benefits." actions={canWrite ? <NomineeDialog employeeId={String(e._id)} today={todayIST()} /> : null} />
      {groups.length ? (
        <div className="space-y-5">
          {groups.map((g) => {
            const total = Math.round(g.rows.reduce((s, r) => s + r.sharePercent, 0) * 100) / 100
            return (
              <section key={g.scheme}>
                <div className="mb-1 flex items-center justify-between gap-2 border-b border-line pb-2">
                  <h4 className="text-[13px] font-semibold uppercase tracking-[0.04em] text-white">{NOMINEE_SCHEME_LABEL[g.scheme]}</h4>
                  <span className={cn('text-[13px] font-medium tabular-nums', total === 100 ? TONE_TEXT.success : TONE_TEXT.warning)}>{total}% allocated</span>
                </div>
                <ul>
                  {g.rows.map((n) => (
                    <li key={String(n._id)} className="-mx-2 flex flex-wrap items-center gap-3 rounded-[8px] px-2 py-2.5 text-sm transition-colors hover:bg-white/[0.04]">
                      <span className="min-w-0 flex-1">
                        <span className="block text-white">{n.name} <span className="text-fg-2">· {n.relationship}</span></span>
                        <span className="block text-xs text-fg-2">{n.dob ? `Born ${formatDate(n.dob)} · ` : ''}From {formatDate(n.effectiveFrom)}{n.phone ? ` · ${n.phone}` : ''}</span>
                      </span>
                      <span className="w-14 text-right text-sm font-semibold tabular-nums text-white">{n.sharePercent}%</span>
                      {canWrite ? <ActionButton action={archiveNominee} input={{ id: String(n._id) }} label="Remove" icon={<Trash2 className="size-3.5" />} title={`Remove ${n.name}?`} confirmLabel="Remove" reason={{ label: 'Reason', required: true }} /> : null}
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      ) : (
        <EmptyState compact icon={<HeartHandshake />} title="No nominees recorded" description="Add the PF and gratuity nominees from their nomination forms." />
      )}
    </Card>
  )
}
