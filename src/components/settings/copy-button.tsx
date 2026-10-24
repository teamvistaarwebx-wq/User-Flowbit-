'use client'

import { Copy } from 'lucide-react'
import { toast } from '@/lib/toast'
import { Button } from '@/components/ui/button'

/** Copies a value (a URL to register) and confirms with a toast. */
export function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      toast.success('Copied.')
    } catch {
      toast.error('Could not copy. Select the text and copy it yourself.')
    }
  }
  return (
    <Button size="sm" variant="secondary" icon={<Copy className="size-3.5" />} onClick={copy}>
      {label}
    </Button>
  )
}
