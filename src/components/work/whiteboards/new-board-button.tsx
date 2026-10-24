'use client'

import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAction } from '@/components/ui/action-form'
import { createWhiteboard } from '@/modules/work/whiteboards/actions'

/** Creates "Untitled whiteboard" and opens it. */
export function NewBoardButton({ label = 'New whiteboard' }: { label?: string }) {
  const [create, pending] = useAction(createWhiteboard)
  return (
    <Button variant="primary" icon={<Plus className="size-4" />} loading={pending} onClick={() => create({})}>
      {label}
    </Button>
  )
}
