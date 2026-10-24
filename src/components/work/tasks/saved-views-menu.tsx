'use client'

import { Bookmark, BookmarkPlus, Pencil, RefreshCw, Trash2, Users } from 'lucide-react'
import { useState } from 'react'
import { deleteView, saveView, updateView } from '@/modules/work/tasks/view-actions'
import { taskQueryString, type TaskQuery } from '@/modules/work/tasks/filters'
import { ActionForm, FormField, SubmitButton, useAction } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Dialog } from '@/components/ui/dialog'
import { DropdownMenu, type MenuItem } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import type { SavedViewOption } from './types'
import { useTaskData } from './task-data'

/** Saved views: open one, save the current filters, rename/share, refresh or delete the open view. */
export function SavedViewsMenu({ views, query, basePath }: { views: SavedViewOption[]; query: TaskQuery; basePath: string }) {
  const { canManage } = useTaskData()
  const [mode, setMode] = useState<'save' | 'edit' | null>(null)
  const current = views.find((v) => v.id === query.saved)
  const canEditCurrent = Boolean(current && (current.mine || (current.shared && canManage)))
  const currentQuery = taskQueryString(query, { page: 1, saved: null })
  const [refresh, refreshing] = useAction(updateView)

  const items: MenuItem[] = [
    ...(views.length ? [{ type: 'label' as const, label: 'Saved views' }] : []),
    ...views.map((v) => ({
      label: v.name,
      icon: v.shared ? <Users /> : <Bookmark />,
      href: `${basePath}?${v.query}${v.query ? '&' : ''}saved=${v.id}`,
    })),
    ...(views.length ? [{ type: 'separator' as const }] : []),
    { label: 'Save current view…', icon: <BookmarkPlus />, onSelect: () => setMode('save') },
    ...(current && canEditCurrent
      ? [
          { label: `Update "${current.name}" with these filters`, icon: <RefreshCw />, onSelect: () => void refresh({ id: current.id, name: current.name, shared: current.shared, query: currentQuery }) },
          { label: 'Rename or share…', icon: <Pencil />, onSelect: () => setMode('edit') },
        ]
      : []),
  ]

  return (
    <>
      <DropdownMenu
        align="end"
        items={items}
        trigger={
          <Button variant="secondary" size="sm" icon={<Bookmark className="size-3.5" />} loading={refreshing}>
            {current ? current.name : 'Views'}
          </Button>
        }
      />
      {current && canEditCurrent ? (
        <ConfirmDialog
          trigger={
            <Button variant="ghost" size="sm" icon={<Trash2 className="size-3.5" />} aria-label={`Delete view ${current.name}`}>
              <span className="sr-only">Delete view</span>
            </Button>
          }
          title={`Delete view "${current.name}"?`}
          description="The tasks stay as they are; only this saved filter goes."
          confirmLabel="Delete view"
          onConfirm={() => deleteView({ id: current.id })}
        />
      ) : null}
      <Dialog open={mode !== null} onOpenChange={(open) => !open && setMode(null)} title={mode === 'edit' ? 'Rename or share view' : 'Save this view'} description={mode === 'save' ? 'Keeps the current filters, view and sort.' : undefined} size="sm">
        {mode ? (
          <ActionForm action={mode === 'edit' ? updateView : saveView} onDone={() => setMode(null)} className="space-y-4">
            {mode === 'edit' && current ? <input type="hidden" name="id" value={current.id} /> : null}
            {mode === 'save' ? <input type="hidden" name="query" value={currentQuery} /> : null}
            <FormField name="name" label="Name" required>
              <Input id="name" name="name" defaultValue={mode === 'edit' ? current?.name : ''} placeholder="My overdue client work" maxLength={60} autoFocus />
            </FormField>
            <Switch name="shared" defaultChecked={mode === 'edit' ? current?.shared : false} label="Share with everyone" description="People see only the tasks they already have access to." />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setMode(null)}>
                Cancel
              </Button>
              <SubmitButton>{mode === 'edit' ? 'Save' : 'Save view'}</SubmitButton>
            </div>
          </ActionForm>
        ) : null}
      </Dialog>
    </>
  )
}
