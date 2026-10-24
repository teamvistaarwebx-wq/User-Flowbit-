'use client'

import { ShieldCheck } from 'lucide-react'
import { verifyBankChange } from '@/modules/muster/payroll/entry-actions'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Button } from '@/components/ui/button'

/** Confirms a self-service bank change was checked with the employee. */
export function VerifyBankButton({ id, name, account }: { id: string; name: string; account: string }) {
  return (
    <ConfirmDialog
      trigger={<Button size="sm" variant="secondary" icon={<ShieldCheck className="size-3.5" />}>Verify</Button>}
      title={`Verify ${name}'s new account?`}
      description={`Confirm with ${name} that account ${account} is theirs before salary goes to it.`}
      confirmLabel="Mark verified"
      tone="primary"
      onConfirm={() => verifyBankChange({ id })}
    />
  )
}
