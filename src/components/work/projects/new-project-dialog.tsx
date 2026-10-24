'use client'

import { Plus } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import type { ClientOption, Person } from '../tasks/types'
import { ProjectForm } from './project-form'

/** "New project" button + dialog; also opens when the URL has ?new=1 (side panel "+"), with ?clientId= preselecting the client (client pages). */
export function NewProjectDialog({ people, clients, me, canCreateClient, label = 'New project' }: { people: Person[]; clients: ClientOption[]; me: string; canCreateClient: boolean; label?: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const search = useSearchParams()
  const wantsNew = search.get('new') === '1'
  const presetClient = search.get('clientId')
  const defaultClientId = presetClient && clients.some((c) => c.id === presetClient) ? presetClient : undefined
  const [open, setOpen] = useState(wantsNew)
  useEffect(() => {
    if (wantsNew) setOpen(true)
  }, [wantsNew])
  const change = (next: boolean) => {
    setOpen(next)
    if (!next && (search.get('new') || presetClient)) {
      const params = new URLSearchParams(search.toString())
      params.delete('new')
      params.delete('clientId')
      const qs = params.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    }
  }
  return (
    <Dialog open={open} onOpenChange={change} title="New project" description="Projects hold tasks, milestones and files for one piece of work." size="lg" trigger={<Button variant="primary" icon={<Plus className="size-4" />}>{label}</Button>}>
      <ProjectForm people={people} clients={clients} me={me} canCreateClient={canCreateClient} defaultClientId={defaultClientId} onDone={() => setOpen(false)} onCancel={() => change(false)} />
    </Dialog>
  )
}
