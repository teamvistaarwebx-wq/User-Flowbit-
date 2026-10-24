'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { Check, ChevronRight, Plus } from 'lucide-react'
import { switchOrgAction } from '@/lib/core-actions'
import { play } from '@/lib/sound'
import { guard, toast } from '@/lib/toast'
import { DropdownMenu } from '@/components/ui/dropdown-menu'
import { useShell } from './shell-context'
import { WorkspaceMark } from './workspace-mark'

/** Workspace row (Figma): the 32px workspace square, the name in 17/600 and a faint chevron. Switches workspaces. */
export function WorkspaceSwitcher() {
  const shell = useShell()
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const switchTo = (id: string) =>
    startTransition(guard(async () => {
      const res = await switchOrgAction(id)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      play('whoosh')
      router.push('/app')
      router.refresh()
    }))

  return (
    <DropdownMenu
      align="start"
      className="w-[224px]"
      trigger={
        <button type="button" disabled={pending} title={`${shell.org.name} · ${shell.roleLabel}`} className="group flex h-11 w-full items-center gap-2.5 rounded-[8px] px-0.5 text-left transition-colors hover:bg-white/[0.04]">
          <WorkspaceMark name={shell.org.name} logoUrl={shell.org.logoUrl} size={32} />
          <span className="min-w-0 flex-1 truncate text-[17px] font-semibold leading-6 text-white">{shell.org.name}</span>
          <ChevronRight className="mr-1 size-4 text-white/20 transition-colors group-hover:text-white/60" strokeWidth={1.5} />
        </button>
      }
      items={[
        { type: 'label', label: 'Workspaces' },
        ...shell.orgs.map((o) => ({
          label: o.name,
          icon: o.id === shell.org.id ? <Check className="!text-fg" /> : <WorkspaceMark name={o.name} logoUrl={o.logoUrl} size={16} className="rounded-[4px]" />,
          onSelect: () => (o.id === shell.org.id ? undefined : switchTo(o.id)),
        })),
        { type: 'separator' as const },
        { label: 'Create workspace', icon: <Plus />, href: '/onboarding?new=1' },
      ]}
    />
  )
}
