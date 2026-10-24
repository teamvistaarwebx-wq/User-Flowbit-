'use client'

import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { TITLE_MAX, TITLE_MIN } from '@/modules/work/tasks/constants'
import { EDIT_TITLE_EVENT } from '../panel/task-order'
import { useTaskPatch } from './use-patch'

/** Click to edit (or E in the task panel); Enter or blur saves (when changed and long enough), Esc reverts. */
export function TitleEditor({ id, title, canEdit }: { id: string; title: string; canEdit: boolean }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(title)
  const [patch] = useTaskPatch(id)
  const done = useRef(false)
  useEffect(() => {
    if (!canEdit) return
    const start = (e: Event) => {
      if ((e as CustomEvent<string>).detail !== id) return
      setValue(title)
      done.current = false
      setEditing(true)
    }
    window.addEventListener(EDIT_TITLE_EVENT, start)
    return () => window.removeEventListener(EDIT_TITLE_EVENT, start)
  }, [id, title, canEdit])

  const save = () => {
    if (done.current) return
    done.current = true
    setEditing(false)
    const next = value.trim()
    if (next.length < TITLE_MIN || next === title) {
      setValue(title)
      return
    }
    void patch({ title: next })
  }
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') save()
    if (e.key === 'Escape') {
      done.current = true
      setValue(title)
      setEditing(false)
    }
  }

  if (!canEdit) return <h1 className="text-xl font-medium leading-7 text-white">{title}</h1>
  if (editing) {
    return (
      <input
        autoFocus
        value={value}
        maxLength={TITLE_MAX}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={onKeyDown}
        aria-label="Task title"
        className="-mx-3 w-[calc(100%+1.5rem)] rounded-[10px] border border-white/45 bg-white/[0.06] px-3 py-1 text-xl font-medium leading-7 text-white shadow-[0_0_0_3px_rgba(187,98,165,0.25)] focus:outline-none"
      />
    )
  }
  return (
    <h1>
      <button type="button" onClick={() => {
          setValue(title)
          done.current = false
          setEditing(true)
        }} title="Click to rename" className="-mx-3 w-[calc(100%+1.5rem)] rounded-[10px] border border-transparent px-3 py-1 text-left text-xl font-medium leading-7 text-white transition-colors hover:bg-white/[0.04]">
        {title}
      </button>
    </h1>
  )
}
