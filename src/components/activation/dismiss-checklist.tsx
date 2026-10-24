'use client'

import { X } from 'lucide-react'
import { IconButton } from '@/components/ui/button'
import { useAction } from '@/components/ui/action-form'
import { dismissChecklist } from '@/modules/activation/actions'

/** Hides the Get started checklist for the workspace. */
export function DismissChecklist() {
  const [dismiss, pending] = useAction(dismissChecklist)
  return (
    <IconButton label="Hide the checklist" size="sm" loading={pending} onClick={() => dismiss({})}>
      <X className="size-4" />
    </IconButton>
  )
}
