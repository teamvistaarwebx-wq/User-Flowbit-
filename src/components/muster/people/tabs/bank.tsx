import { History, Landmark, ShieldCheck } from 'lucide-react'
import { maskAccount } from '@/lib/audit-diff'
import { formatDateTime } from '@/lib/dates'
import { Card, CardHeader } from '@/components/ui/card'
import { KeyValue } from '@/components/ui/key-value'
import { Timeline } from '@/components/ui/timeline'
import { Badge } from '@/components/ui/badge'
import { VerifyBankButton } from '@/components/muster/payroll/verify-bank-button'
import { AuditLog } from '@/models/AuditLog'
import { BankChangeRequest } from '@/models/muster/BankChangeRequest'
import { mayDecideOwn, ownEmployeeId } from '@/modules/muster/people/scope'
import { ListCard, ListRow, ListRows } from '../../ui/list-card'
import { Reveal } from '../reveal'
import type { TabProps } from './types'

/** Bank & statutory tab (people.read_sensitive): identifiers, bank account masked with reveal, self-service bank changes to verify, change history. */
export async function BankTab({ ctx, employee: e }: TabProps) {
  const filter: Record<string, unknown> = {
    entity: 'Employee',
    entityId: String(e._id),
    $or: [{ action: { $in: ['employee.updated', 'employee.created'] }, 'meta.after.bank': { $exists: true } }, { action: { $in: ['employee.bank_changed_self', 'employee.bank_verified'] } }],
  }
  const [history, changes] = await Promise.all([
    ctx.db(AuditLog).find(filter).sort({ createdAt: -1 }).limit(20).lean(),
    ctx.db(BankChangeRequest).find({ employeeId: e._id }).sort({ createdAt: -1 }).limit(20).lean(),
  ])
  // Someone's own bank change is verified by someone else (verifyBankChange refuses it too).
  const ownRecord = String(e._id) === ownEmployeeId(ctx) && !mayDecideOwn(ctx)
  const masked = (v?: string | null) => (v ? <Reveal masked={maskAccount(v)} value={v} /> : null)
  return (
    <div className="grid grid-cols-12 gap-4">
      <Card className="col-span-12 lg:col-span-7">
        <CardHeader label="Bank & statutory" icon={<Landmark />} description="Shown only to people who may see sensitive details." />
        <KeyValue items={[
          { label: 'PAN', value: e.pan ? <span className="font-mono">{e.pan}</span> : null },
          { label: 'UAN', value: e.uan ? <span className="font-mono">{e.uan}</span> : null },
          { label: 'ESIC number', value: e.esicNumber },
          { label: 'Aadhaar', value: masked(e.aadhaar) },
          { label: 'PF number', value: e.pfAccountNumber },
          { label: 'Bank', value: e.bank?.bankName },
          { label: 'Account holder', value: e.bank?.accountName },
          { label: 'Account number', value: masked(e.bank?.accountNumber) },
          { label: 'IFSC', value: e.bank?.ifsc ? <span className="font-mono">{e.bank.ifsc}</span> : null },
        ]} />
      </Card>
      <Card className="col-span-12 lg:col-span-5">
        <CardHeader label="Bank changes" icon={<History />} />
        <Timeline empty="No bank changes recorded." items={history.map((h) => ({ id: String(h._id), title: bankTitle(h.action, h.summary, h.meta), description: `${h.actorName ?? 'Someone'}${h.actorRole ? ` (${h.actorRole})` : ''}`, at: h.createdAt }))} />
      </Card>
      {changes.length ? (
        <ListCard className="col-span-12" label="Bank change requests" icon={<ShieldCheck />} description="Changes made in self-service. Verify each one with the person before the next payroll run.">
          <ListRows>
            {changes.map((c) => (
              <ListRow key={String(c._id)}>
                <span className="min-w-0 flex-1">
                  <span className="block text-white">
                    <span className="font-mono">{c.previousMasked ?? 'none'}</span> → <span className="font-mono">{c.newMasked ?? 'none'}</span>
                    {c.newIfsc ? <span className="ml-2 font-mono text-xs text-fg-2">{c.newIfsc}</span> : null}
                  </span>
                  <span className="block text-xs text-fg-2">{c.changedBySelf ? 'Changed in self-service' : 'Changed by HR'}, {formatDateTime(c.createdAt)}</span>
                </span>
                {c.verifiedAt ? (
                  <Badge tone="success">Verified by {c.verifiedByName ?? 'HR'}, {formatDateTime(c.verifiedAt)}</Badge>
                ) : (
                  <>
                    <Badge tone="warning">Not verified</Badge>
                    {ownRecord ? null : <VerifyBankButton id={String(c._id)} name={c.employeeName} account={c.newMasked ?? 'the new account'} />}
                  </>
                )}
              </ListRow>
            ))}
          </ListRows>
        </ListCard>
      ) : null}
    </div>
  )
}

function bankTitle(action: string, summary: string, meta: unknown): string {
  if (action !== 'employee.updated' && action !== 'employee.created') return summary
  const after = (meta as { after?: { bank?: { accountNumber?: string | null; ifsc?: string | null } } } | null)?.after?.bank
  if (!after?.accountNumber) return action === 'employee.created' ? 'Bank details added' : 'Bank details changed'
  return `Bank account set to ${after.accountNumber}${after.ifsc ? ` (${after.ifsc})` : ''}`
}
