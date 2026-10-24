import { Download, ReceiptIndianRupee } from 'lucide-react'
import { formatMonth } from '@/lib/dates'
import { formatINR } from '@/lib/money'
import { Badge } from '@/components/ui/badge'
import { buttonClass } from '@/components/ui/button-styles'
import { EmptyState } from '@/components/ui/empty-state'
import { payslipsFor } from '@/modules/muster/people/foreign'
import { ListCard, ListRow, ListRows } from '../../ui/list-card'
import type { TabProps } from './types'

/** Payslips tab (payroll.read): this person's payslips by month. */
export async function PayslipsTab({ ctx, employee: e }: TabProps) {
  const slips = await payslipsFor(ctx, String(e._id))
  return (
    <ListCard label="Payslips" icon={<ReceiptIndianRupee />} description="One per payroll month">
      {slips.length ? (
        <ListRows>
          {slips.map((s) => (
            <ListRow key={s.id}>
              <span className="min-w-0 flex-1">
                <span className="block text-white">{s.month ? formatMonth(s.month) : 'Payslip'}</span>
                <span className="block text-xs text-fg-2">{s.number} · net {formatINR(s.netPay)}</span>
              </span>
              <Badge tone={s.published ? 'success' : 'warning'}>{s.published ? 'Published' : 'Not published'}</Badge>
              {s.pdfHref ? <a href={s.pdfHref} className={buttonClass('secondary', 'sm')} target="_blank" rel="noreferrer"><Download className="size-3.5" /> PDF</a> : null}
            </ListRow>
          ))}
        </ListRows>
      ) : (
        <EmptyState compact icon={<ReceiptIndianRupee />} title="No payslips yet" description="Payslips appear here once a payroll month that includes them is generated." />
      )}
    </ListCard>
  )
}
