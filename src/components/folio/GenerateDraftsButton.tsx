'use client'

import { Repeat } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { generateDueDrafts } from '@/modules/folio/recurring/actions'
import { useRun } from './use-run'

/** "Generate {n} due drafts": catches every due retainer up; safe to run twice. */
export function GenerateDraftsButton({ count, label }: { count: number; label?: string }) {
  const run = useRun()
  return (
    <ConfirmDialog
      trigger={<Button variant="secondary" icon={<Repeat className="size-4" />}>{label ?? `Generate ${count} due draft${count === 1 ? '' : 's'}`}</Button>}
      title="Generate retainer drafts?"
      description="Each due retainer gets a draft invoice for each missed service period. Nothing is issued and nothing reaches a client until you say so. Running this twice will not bill anyone twice."
      tone="primary"
      confirmLabel="Generate drafts"
      onConfirm={() => run(generateDueDrafts({}))}
    />
  )
}
