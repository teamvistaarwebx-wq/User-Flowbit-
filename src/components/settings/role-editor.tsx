'use client'

import { useState } from 'react'
import { play } from '@/lib/sound'
import { cn } from '@/lib/utils'
import { useAction } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog } from '@/components/ui/dialog'
import { Input, Textarea } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { saveRole } from '@/modules/settings/role-actions'
import type { PermissionGroup } from '@/modules/settings/roles'

export type RoleColumn = { id: string; label: string; description: string; permissions: string[]; builtIn: boolean; owner: boolean; editable: boolean; holders: number }
export type EditorDraft = { id?: string; name: string; description: string; permissions: string[] }

type Props = { draft: EditorDraft | null; onClose: () => void; groups: PermissionGroup[]; roles: RoleColumn[]; grantable: string[] }

/** Create or edit a custom role: name, description, a starting point and grouped permissions. */
export function RoleEditor({ draft, onClose, groups, roles, grantable }: Props) {
  return (
    <Dialog open={draft !== null} onOpenChange={(open) => !open && onClose()} size="lg" title={draft?.id ? `Edit ${draft.name}` : 'New role'} description="Pick what people with this role can do. You can only grant permissions you hold yourself.">
      {draft ? <EditorBody key={draft.id ?? draft.name} draft={draft} onClose={onClose} groups={groups} roles={roles} grantable={grantable} /> : null}
    </Dialog>
  )
}

function EditorBody({ draft, onClose, groups, roles, grantable }: Omit<Props, 'draft'> & { draft: EditorDraft }) {
  const [name, setName] = useState(draft.name)
  const [description, setDescription] = useState(draft.description)
  const [perms, setPerms] = useState<Set<string>>(() => new Set(draft.permissions))
  const [run, pending] = useAction(saveRole, { onDone: onClose })
  const canGrant = new Set(grantable)

  const toggle = (key: string, on: boolean) => setPerms((prev) => {
    const next = new Set(prev)
    if (on) next.add(key)
    else next.delete(key)
    return next
  })
  const toggleGroup = (group: PermissionGroup, on: boolean) => {
    play('toggle')
    setPerms((prev) => {
      const next = new Set(prev)
      group.permissions.filter((p) => canGrant.has(p.key)).forEach((p) => (on ? next.add(p.key) : next.delete(p.key)))
      return next
    })
  }
  const startFrom = (id: string) => {
    const source = roles.find((r) => r.id === id)
    if (source) setPerms(new Set(source.permissions.filter((p) => canGrant.has(p))))
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-white">Name<span className="text-[#F64A45]"> *</span></span>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="e.g. Project coordinator" />
        </label>
        {!draft.id ? (
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-white">Start from</span>
            <Select placeholder="Blank" onValueChange={startFrom} options={roles.filter((r) => !r.owner).map((r) => ({ value: r.id, label: `Copy of ${r.label}` }))} />
          </label>
        ) : null}
        <label className="block space-y-1.5 sm:col-span-2">
          <span className="text-sm font-medium text-white">Description</span>
          <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} placeholder="Optional. What this role is for." />
        </label>
      </div>
      <div className="max-h-[45vh] space-y-3 overflow-y-auto pr-1">
        {groups.map((group) => {
          const selectable = group.permissions.filter((p) => canGrant.has(p.key))
          const allOn = selectable.length > 0 && selectable.every((p) => perms.has(p.key))
          return (
            <section key={group.area} className="rounded-[10px] bg-white/[0.04] p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-[13px] font-semibold uppercase tracking-[0.04em] text-white">{group.label}</p>
                {selectable.length ? (
                  <button type="button" className="text-xs font-medium text-link hover:underline" onClick={() => toggleGroup(group, !allOn)}>
                    {allOn ? 'Clear group' : 'Select all in group'}
                  </button>
                ) : null}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {group.permissions.map((p) => (
                  <div key={p.key} className={cn(!canGrant.has(p.key) && 'opacity-50')} title={!canGrant.has(p.key) ? "You don't hold this permission, so you can't grant it." : undefined}>
                    <Checkbox label={p.label} checked={perms.has(p.key)} disabled={!canGrant.has(p.key)} onCheckedChange={(on) => toggle(p.key, on)} />
                  </div>
                ))}
              </div>
            </section>
          )
        })}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-fg-3">{perms.size} permissions selected</span>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={pending} disabled={name.trim().length < 2} onClick={() => run({ id: draft.id, name, description, permissions: [...perms] })}>
            {draft.id ? 'Save role' : 'Create role'}
          </Button>
        </div>
      </div>
    </div>
  )
}
