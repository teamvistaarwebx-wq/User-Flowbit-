'use client'

import { LogOut } from 'lucide-react'
import { useAction } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { staffSignOutAction } from '@/modules/console/auth-actions'

export function ConsoleSignOut() {
  const [run, pending] = useAction(staffSignOutAction)
  return <Button size="sm" variant="secondary" icon={<LogOut className="size-3.5" strokeWidth={1.5} />} loading={pending} onClick={() => run(undefined as never)}>Sign out</Button>
}
