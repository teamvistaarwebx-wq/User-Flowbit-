'use client'

import { useRouter } from 'next/navigation'
import { Fragment, useState } from 'react'
import { Check, ChevronDown, Copy, Lock, Minus, MoreHorizontal, Pencil, Plus, ShieldCheck, Trash2 } from 'lucide-react'
import { play } from '@/lib/sound'
import { CONNECTION_ERROR, toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { Button, IconButton } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { DropdownMenu, type MenuItem } from '@/components/ui/dropdown-menu'
import { EmptyState } from '@/components/ui/empty-state'
import { Tooltip } from '@/components/ui/tooltip'
import { deleteRole, saveRole } from '@/modules/settings/role-actions'
import type { PermissionGroup } from '@/modules/settings/roles'
import { RoleEditor, type EditorDraft, type RoleColumn } from './role-editor'
import { RoleListMobile } from './role-list-mobile'
import { SurfaceHeader } from './surface'

type Props = { groups: PermissionGroup[]; roles: RoleColumn[]; lockedAreas: string[]; grantable: string[] }

/** Permissions (rows, grouped by product) × roles (columns). Custom columns edit in place with a save bar. */
export function RoleMatrix({ groups, roles, lockedAreas, grantable }: Props) {
  const router = useRouter()
  const [staged, setStaged] = useState<Record<string, string[]>>({})
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [draft, setDraft] = useState<EditorDraft | null>(null)
  const [deleting, setDeleting] = useState<RoleColumn | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const canGrant = new Set(grantable)
  const custom = roles.filter((r) => !r.builtIn)

  const permsOf = (role: RoleColumn) => staged[role.id] ?? role.permissions
  const toggleCell = (role: RoleColumn, key: string) => {
    play('toggle')
    const current = new Set(permsOf(role))
    if (current.has(key)) current.delete(key)
    else current.add(key)
    setStaged((prev) => ({ ...prev, [role.id]: [...current] }))
  }
  const discard = (id: string) => setStaged((prev) => Object.fromEntries(Object.entries(prev).filter(([key]) => key !== id)))
  const changesOf = (role: RoleColumn) => {
    const before = new Set(role.permissions)
    const after = new Set(staged[role.id] ?? [])
    return [...after].filter((k) => !before.has(k)).length + [...before].filter((k) => !after.has(k)).length
  }
  const save = async (role: RoleColumn) => {
    setBusy(role.id)
    const result = await saveRole({ id: role.id, name: role.label, description: role.description, permissions: staged[role.id] }).catch(() => null)
    setBusy(null)
    if (!result) return toast.error(CONNECTION_ERROR)
    if (!result.ok) return toast.error(result.error)
    toast.success(result.message ?? 'Saved')
    discard(role.id)
    router.refresh()
  }
  const confirmDelete = async () => {
    if (!deleting) return
    setBusy(deleting.id)
    const result = await deleteRole({ id: deleting.id }).catch(() => null)
    setBusy(null)
    if (!result) return toast.error(CONNECTION_ERROR)
    if (!result.ok) return toast.error(result.error)
    toast.success(result.message ?? 'Role deleted')
    setDeleting(null)
    router.refresh()
  }
  const duplicate = (role: RoleColumn) => setDraft({ name: `Copy of ${role.label}`.slice(0, 40), description: role.description, permissions: role.permissions.filter((p) => canGrant.has(p)) })
  const toggleGroup = (area: string) => {
    play('toggle')
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(area)) next.delete(area)
      else next.add(area)
      return next
    })
  }

  const edit = (role: RoleColumn) => setDraft({ id: role.id, name: role.label, description: role.description, permissions: permsOf(role) })
  const menuFor = (role: RoleColumn): MenuItem[] =>
    role.builtIn
      ? [{ label: 'Duplicate to customise', icon: <Copy />, onSelect: () => duplicate(role) }]
      : [
          ...(role.editable ? [{ label: 'Edit', icon: <Pencil />, onSelect: () => edit(role) }] : []),
          { label: 'Duplicate', icon: <Copy />, onSelect: () => duplicate(role) },
          ...(role.editable ? [{ type: 'separator' as const }, { label: 'Delete', icon: <Trash2 />, danger: true, onSelect: () => setDeleting(role) }] : []),
        ]

  const dirty = custom.filter((r) => staged[r.id] && changesOf(r) > 0)
  const manager = roles.find((r) => r.id === 'manager')

  return (
    <>
      <section className="card-table overflow-hidden">
        <SurfaceHeader
          icon={<ShieldCheck strokeWidth={1.5} />}
          label="Role access"
          description={`${roles.length} roles · ${custom.length ? `${custom.length} custom` : 'built-in roles are locked; duplicate one to customise'}`}
          actions={
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setDraft({ name: '', description: '', permissions: [] })}>
              New role
            </Button>
          }
          className="px-[23px] pb-4 pt-[17px]"
        />
        <RoleListMobile className="md:hidden" roles={roles} groups={groups} permsOf={permsOf} menuFor={menuFor} onEdit={edit} />
        <div className="relative hidden overflow-x-auto md:block">
          <table className="w-full min-w-[900px] border-collapse text-[13px]">
            <thead>
              <tr className="border-y border-line">
                <th scope="col" className="sticky left-0 z-10 w-44 min-w-[176px] bg-[#292929] sm:w-72 sm:min-w-[260px] px-[23px] py-3 text-left align-bottom text-sm font-normal text-white">Permission</th>
                {roles.map((role) => (
                  <th key={role.id} scope="col" className="min-w-28 px-2 py-3 text-center align-bottom">
                    <div className="flex flex-col items-center gap-1">
                      <span className="flex items-center gap-1 whitespace-nowrap text-[13px] font-medium text-white">
                        {role.builtIn ? <Lock className="size-3 text-icon-muted" strokeWidth={1.5} /> : null}
                        {role.label}
                      </span>
                      <span className="text-xs font-normal text-[#979797]">{role.holders === 1 ? '1 person' : `${role.holders} people`}</span>
                      {role.owner ? <span className="block size-8" aria-hidden /> : (
                        <DropdownMenu align="center" items={menuFor(role)} trigger={<IconButton label={`Actions for ${role.label}`} size="sm"><MoreHorizontal className="size-4" /></IconButton>} />
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <Fragment key={group.area}>
                  <tr className="border-b border-line">
                    <td colSpan={roles.length + 1} className="px-[23px] pb-2 pt-5">
                      <button type="button" onClick={() => toggleGroup(group.area)} className="sticky left-4 flex max-w-[min(48rem,calc(100vw-4rem))] items-center gap-2 text-left">
                        <ChevronDown className={cn('size-4 text-icon-muted transition-transform', collapsed.has(group.area) && '-rotate-90')} strokeWidth={1.5} />
                        <span className="text-[13px] font-semibold uppercase tracking-[0.04em] text-white">{group.label}</span>
                        <span className="hidden truncate text-[13px] text-[#959596] sm:inline">{group.description}</span>
                        {lockedAreas.includes(group.area) ? (
                          <span className="inline-flex shrink-0 items-center gap-1 text-xs text-warning">
                            <Lock className="size-3" strokeWidth={1.5} />
                            Not in your plan
                          </span>
                        ) : null}
                      </button>
                    </td>
                  </tr>
                  {collapsed.has(group.area)
                    ? null
                    : group.permissions.map((perm) => (
                        <tr key={perm.key} className="group h-9 transition-colors hover:bg-white/[0.04]">
                          <td className="sticky left-0 z-10 min-w-[176px] bg-[#292929] sm:min-w-[260px] px-[23px] py-1.5 text-white group-hover:bg-[#2f2f30]">{perm.label}</td>
                          {roles.map((role) => {
                            const on = permsOf(role).includes(perm.key)
                            if (role.owner) {
                              return (
                                <td key={role.id} className="px-2 py-1.5 text-center">
                                  <Tooltip content="The owner always has every permission">
                                    <span className="inline-flex"><Check className="mx-auto size-4 text-white/85" aria-label="Granted" /></span>
                                  </Tooltip>
                                </td>
                              )
                            }
                            const editable = !role.builtIn && role.editable && canGrant.has(perm.key)
                            return (
                              <td key={role.id} className="px-2 py-1.5 text-center">
                                {editable ? (
                                  <button
                                    type="button"
                                    role="checkbox"
                                    aria-checked={on}
                                    aria-label={`${perm.label} for ${role.label}`}
                                    onClick={() => toggleCell(role, perm.key)}
                                    className={cn('press inline-flex size-[22px] items-center justify-center rounded-[6px] border transition-colors', on ? 'border-transparent bg-chip-active text-white' : 'border-white/25 bg-transparent text-transparent hover:border-white/50')}
                                  >
                                    <Check className="size-3.5" />
                                  </button>
                                ) : on ? (
                                  <Check className="mx-auto size-4 text-white/85" aria-label="Granted" />
                                ) : (
                                  <Minus className="mx-auto size-4 text-white/20" aria-label="Not granted" />
                                )}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {!custom.length ? (
        <Card variant="solid" className="mt-4">
          <EmptyState
            compact
            icon={<ShieldCheck />}
            title="No custom roles yet"
            description="Duplicate a built-in role to start from something close."
            action={manager ? <Button variant="secondary" icon={<Copy className="size-4" />} onClick={() => duplicate(manager)}>Duplicate Manager</Button> : null}
          />
        </Card>
      ) : null}

      {dirty.length ? (
        <div className="sticky bottom-24 z-20 mt-4 space-y-2 md:bottom-4">
          {dirty.map((role) => (
            <div key={role.id} className="lit-edge flex flex-wrap items-center justify-between gap-3 rounded-[12px] bg-menu/95 px-4 py-3 backdrop-blur-xl">
              <span className="text-sm text-fg">
                <span className="font-semibold">{role.label}</span>: {changesOf(role)} {changesOf(role) === 1 ? 'change' : 'changes'}
              </span>
              <span className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => discard(role.id)}>Discard</Button>
                <Button variant="primary" size="sm" loading={busy === role.id} onClick={() => save(role)}>Save</Button>
              </span>
            </div>
          ))}
        </div>
      ) : null}

      <RoleEditor draft={draft} onClose={() => setDraft(null)} groups={groups} roles={roles} grantable={grantable} />

      <Dialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        size="sm"
        title={`Delete ${deleting?.label ?? 'role'}?`}
        description={deleting?.holders ? `${deleting.holders} ${deleting.holders === 1 ? 'person holds' : 'people hold'} this role. Move them to another role from Members first.` : "This can't be undone."}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)}>Cancel</Button>
            <Button variant="danger" loading={busy === deleting?.id} disabled={Boolean(deleting?.holders)} onClick={confirmDelete}>Delete role</Button>
          </>
        }
      />
    </>
  )
}
