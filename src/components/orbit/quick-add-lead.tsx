'use client'

import { useState, type ReactNode } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { LeadForm, type LeadFormProps } from './lead-form'

/** The lead form in a dialog (dashboard, leads header). */
export function QuickAddLead({ trigger, ...props }: Omit<LeadFormProps, 'onCancel' | 'onDone'> & { trigger: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen} trigger={trigger} title="New lead" description="Under 30 seconds. Everything else is editable later." size="lg">
      <LeadForm {...props} onDone={() => setOpen(false)} onCancel={() => setOpen(false)} />
    </Dialog>
  )
}
