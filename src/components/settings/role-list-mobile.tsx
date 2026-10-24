'use client'

import { useState } from 'react'
import { Check, ChevronRight, Lock, MoreHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { IconButton } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { DropdownMenu, type MenuItem } from '@/components/ui/dropdown-menu'
import type { PermissionGroup } from '@/modules/settings/roles'
import type { RoleColumn } from './role-editor'

type Props = {
  roles: RoleColumn[]
  groups: PermissionGroup[]
  permsOf: (role: RoleColumn) => string[]
  menuFor: (role: RoleColumn) => MenuItem[]
  /** Opens the role editor for a custom role the viewer may edit. */
  onEdit: (role: RoleColumn) => void
  className?: string
}

const peopleLabel = (n: number) => (n === 1 ? '1 person' : `${n} people`)

/**
 * Phones get a role list instead of the wide matrix (platform spec, Roles on mobile). Tapping a custom role the
 * viewer may edit opens the role editor; any other role opens a read-only list of what it can do.
 */
export function RoleListMobile({ roles, groups, permsOf, menuFor, onEdit, className }: Props) {
  const [viewing, setViewing] = useState<RoleColumn | null>(null)
  const open = (role: RoleColumn) => (!role.builtIn && role.editable ? onEdit(role) : setViewing(role))
  const granted = viewing ? new Set(permsOf(viewing)) : new Set<string>()

  return (
    <>
      <ul className={cn('divide-y divide-line border-t border-line', className)}>
        {roles.map((role) => (
          <li key={role.id} className="flex items-center gap-1 pr-3">
            <button type="button" onClick={() => open(role)} className="flex min-w-0 flex-1 items-center gap-3 px-[23px] py-3 text-left transition-colors hover:bg-white/[0.04]">
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-sm font-medium text-white">
                  {role.builtIn ? <Lock className="size-3 shrink-0 text-icon-muted" strokeWidth={1.5} /> : null}
                  <span className="truncate">{role.label}</span>
                </span>
                <span className="block text-xs text-[#979797]">
                  {peopleLabel(role.holders)} · {role.owner ? 'every permission' : `${permsOf(role).length} permissions`}
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-icon-muted" strokeWidth={1.5} />
            </button>
            {role.owner ? null : <DropdownMenu align="end" items={menuFor(role)} trigger={<IconButton label={`Actions for ${role.label}`} size="sm"><MoreHorizontal className="size-4" /></IconButton>} />}
          </li>
        ))}
      </ul>

      <Dialog
        open={viewing !== null}
        onOpenChange={(isOpen) => !isOpen && setViewing(null)}
        size="lg"
        title={viewing?.label ?? 'Role'}
        description={viewing?.owner ? 'The owner always has every permission.' : viewing?.builtIn ? 'Built-in roles are locked. Duplicate one from its menu to customise it.' : viewing?.description || 'You can only edit roles whose permissions you hold yourself.'}
      >
        {viewing && !viewing.owner ? (
          <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
            {groups.map((group) => {
              const on = group.permissions.filter((p) => granted.has(p.key))
              return (
                <section key={group.area} className="rounded-[10px] bg-white/[0.04] p-4">
                  <p className="mb-2 text-[13px] font-semibold uppercase tracking-[0.04em] text-white">{group.label}</p>
                  {on.length ? (
                    <ul className="space-y-1.5">
                      {on.map((p) => (
                        <li key={p.key} className="flex items-center gap-2 text-sm text-white">
                          <Check className="size-3.5 shrink-0 text-white/85" aria-hidden />
                          {p.label}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-fg-2">No access</p>
                  )}
                </section>
              )
            })}
          </div>
        ) : null}
      </Dialog>
    </>
  )
}
