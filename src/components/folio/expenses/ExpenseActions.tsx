'use client'

import { CopyPlus, Repeat, Trash2 } from 'lucide-react'
import { useAction } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { copyExpenseForward, copyRecurringForward, deleteExpense } from '@/modules/folio/expenses/actions'
import { useRun } from '../use-run'

/** Copy forward and delete, on the expense page. */
export function ExpenseActions({ id, vendor, nextMonthLabel, canCopy }: { id: string; vendor: string; nextMonthLabel: string; canCopy: boolean }) {
  const [copy, copying] = useAction(copyExpenseForward)
  const run = useRun()
  return (
    <>
      {canCopy ? (
        <Button variant="secondary" icon={<CopyPlus className="size-4" />} loading={copying} onClick={() => copy({ id })}>
          Copy to {nextMonthLabel}
        </Button>
      ) : null}
      <ConfirmDialog
        trigger={<Button variant="ghost" icon={<Trash2 className="size-4" />}>Delete</Button>}
        title="Delete this expense?"
        description={`The ${vendor} expense and its attached bill are removed for good. The audit log keeps a record.`}
        confirmLabel="Delete expense"
        onConfirm={() => run(deleteExpense({ id }))}
      />
    </>
  )
}

/** "Copy N recurring from September": last month's repeating expenses into this month. */
export function CopyRecurringButton({ month, entityId, count, fromLabel }: { month: string; entityId: string | null; count: number; fromLabel: string }) {
  const [copy, copying] = useAction(copyRecurringForward)
  return (
    <Button variant="secondary" icon={<Repeat className="size-4" />} loading={copying} onClick={() => copy({ month, entityId: entityId ?? undefined })}>
      Copy {count} recurring from {fromLabel}
    </Button>
  )
}
