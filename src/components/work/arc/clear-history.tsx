'use client'

import { Eraser } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { clearArcHistory } from '@/modules/work/arc/actions'

export function ClearHistory() {
  return (
    <ConfirmDialog
      trigger={<Button variant="ghost" size="sm" icon={<Eraser className="size-4" />}>Clear history</Button>}
      title="Clear your Arc history?"
      description="Searches, open drafts and updates disappear from this page. Anything you already applied stays."
      confirmLabel="Clear"
      onConfirm={() => clearArcHistory({})}
    />
  )
}
