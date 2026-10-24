'use client'

import { Sparkles, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useAction } from '@/components/ui/action-form'
import { loadSampleAgency, removeSampleData } from '@/modules/activation/actions'

/** "Load sample agency" while the workspace has none, "Remove sample data" (one confirm) once it does. */
export function SampleDataButton({ loaded, size = 'sm', variant = 'secondary' }: { loaded: boolean; size?: 'sm' | 'md'; variant?: 'primary' | 'secondary' | 'ghost' }) {
  const [load, loading] = useAction(loadSampleAgency)
  if (!loaded) {
    return (
      <Button size={size} variant={variant} loading={loading} icon={<Sparkles className="size-4" />} onClick={() => load({})}>
        Load sample agency
      </Button>
    )
  }
  return (
    <ConfirmDialog
      trigger={<Button size={size} variant="ghost" icon={<Trash2 className="size-4" />}>Remove sample data</Button>}
      title="Remove the sample agency?"
      description="Deletes the sample clients, projects, tasks, leads, invoices and employees nobody has used. Sample rows your team issued, paid, logged time on or linked to stay as your own data, and anything your team added stays."
      confirmLabel="Remove sample data"
      onConfirm={() => removeSampleData({})}
    />
  )
}
