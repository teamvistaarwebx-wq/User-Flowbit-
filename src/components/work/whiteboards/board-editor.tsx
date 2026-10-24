'use client'

import '@excalidraw/excalidraw/index.css'
import dynamic from 'next/dynamic'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Check, CloudOff, LoaderCircle, RefreshCw } from 'lucide-react'
import type { BinaryFileData, BinaryFiles, ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/lib/toast'
import { mergeElements } from '@/modules/work/whiteboards/merge'
import { MAX_SCENE_BYTES } from '@/modules/work/whiteboards/scene'
import { BOARD_TOO_LARGE, BoardSaveError, boardSaveErrorMessage, readBoardSave, type StoredRef } from './save-response'

const Excalidraw = dynamic(async () => (await import('@excalidraw/excalidraw')).Excalidraw, {
  ssr: false,
  loading: () => <Skeleton className="size-full rounded-card" />,
})

const AUTOSAVE_MS = 1500
const KEEPALIVE_LIMIT = 60_000
const THUMB_LIMIT = 190_000
/** After a reload, the save sent while the old page was closing can land after this page read the board. */
const FLUSH_RECHECK_WINDOW = 15_000
const RECHECK_DELAYS = [600, 1500, 3500]
const flushKey = (boardId: string) => `flowbit:whiteboard-flush:${boardId}`
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
/** Checked before sending: an oversized body is refused by the host (413) before the app can answer. */
const tooLarge = (text: string) => new Blob([text]).size > MAX_SCENE_BYTES

type Scene = { elements: Record<string, unknown>[]; appState: Record<string, unknown>; files: Record<string, StoredRef> }
type Status = 'saved' | 'dirty' | 'saving' | 'conflict' | 'error'
type Element = { id: string; version: number; isDeleted?: boolean; type?: string; fileId?: string | null }

/** Sum of element versions: changes on any edit, ignores scroll/zoom. */
const signature = (elements: readonly Element[], fileCount: number) => `${elements.reduce((s, e) => s + e.version, 0)}:${elements.length}:${fileCount}`

async function toDataUrl(url: string): Promise<string> {
  const blob = await (await fetch(url)).blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

/** Notes that a save was sent while the page was closing, so a reloaded page re-reads the board. */
function markFlush(boardId: string) {
  try {
    sessionStorage.setItem(flushKey(boardId), String(Date.now()))
  } catch {
    // Storage blocked: the reloaded page just skips the re-read.
  }
}

function hasRecentFlush(boardId: string): boolean {
  try {
    const at = Number(sessionStorage.getItem(flushKey(boardId))) || 0
    return at > 0 && Date.now() - at < FLUSH_RECHECK_WINDOW
  } catch {
    return false
  }
}

function clearFlush(boardId: string) {
  try {
    sessionStorage.removeItem(flushKey(boardId))
  } catch {
    // Nothing to clear.
  }
}

async function loadImages(refs: Record<string, StoredRef>): Promise<BinaryFileData[]> {
  return Promise.all(
    Object.entries(refs).map(async ([id, ref]) => ({ id, mimeType: ref.mimeType, dataURL: await toDataUrl(`/api/files/${ref.fileId}`), created: Date.now() }) as unknown as BinaryFileData),
  )
}

async function thumbnailOf(elements: readonly Element[], files: BinaryFiles): Promise<string | undefined> {
  const live = elements.filter((e) => !e.isDeleted)
  if (!live.length) return undefined
  const { exportToSvg } = await import('@excalidraw/excalidraw')
  const svg = await exportToSvg({ elements: live as never, appState: { exportBackground: false, viewBackgroundColor: 'transparent', exportWithDarkMode: true }, files, exportPadding: 16 })
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.outerHTML)}`
  return url.length <= THUMB_LIMIT ? url : undefined
}

/** Excalidraw canvas with debounced autosave, version check and image upload on save. */
export function BoardEditor({ boardId, initialScene, initialVersion, editable, onStatus }: { boardId: string; initialScene: Scene; initialVersion: number; editable: boolean; onStatus?: (s: Status) => void }) {
  const api = useRef<ExcalidrawImperativeAPI | null>(null)
  const version = useRef(initialVersion)
  const stored = useRef<Record<string, StoredRef>>(initialScene.files)
  const lastSig = useRef<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** One PUT at a time: a save started while another is running waits and runs after it with the new version. */
  const inFlight = useRef(false)
  const resave = useRef(false)
  const saveRef = useRef<() => Promise<void>>(async () => {})
  /** Latest scene seen in onChange: still readable after the canvas unmounts. */
  const latest = useRef<{ elements: readonly Element[]; appState: { viewBackgroundColor?: unknown; gridSize?: unknown }; files: BinaryFiles } | null>(null)
  /** True while a reloaded page re-reads the board; saves wait for it. */
  const syncing = useRef(false)
  const [status, setStatusState] = useState<Status>('saved')
  const statusRef = useRef<Status>('saved')
  const setStatus = useCallback((s: Status) => {
    statusRef.current = s
    setStatusState(s)
    onStatus?.(s)
  }, [onStatus])

  const payload = useCallback(async (withThumb: boolean) => {
    const a = api.current
    const snap = latest.current
    if (!snap && !a) return null
    const elements = (snap?.elements ?? a!.getSceneElementsIncludingDeleted()) as unknown as Element[]
    const binary = snap?.files ?? a!.getFiles()
    const files: Record<string, { mimeType: string; fileId?: string; dataURL?: string }> = {}
    for (const e of elements) {
      if (e.type !== 'image' || !e.fileId || e.isDeleted) continue
      const known = stored.current[e.fileId]
      files[e.fileId] = known ? { mimeType: known.mimeType, fileId: known.fileId } : { mimeType: binary[e.fileId]?.mimeType ?? 'image/png', dataURL: binary[e.fileId]?.dataURL }
    }
    const appState = snap?.appState ?? a!.getAppState()
    return {
      version: version.current,
      elements: elements.filter((e) => !e.isDeleted),
      appState: { viewBackgroundColor: appState.viewBackgroundColor, gridSize: appState.gridSize },
      files,
      thumbnail: withThumb ? await thumbnailOf(elements, binary) : undefined,
    }
  }, [])

  const save = useCallback(async () => {
    if (!editable || statusRef.current === 'conflict') return
    if (inFlight.current || syncing.current) {
      resave.current = true
      return
    }
    inFlight.current = true
    const sentSig = lastSig.current
    setStatus('saving')
    try {
      const body = await payload(true)
      if (!body) return
      const text = JSON.stringify(body)
      if (tooLarge(text)) throw new BoardSaveError(BOARD_TOO_LARGE)
      const res = await fetch(`/api/work/whiteboards/${boardId}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: text })
      const outcome = await readBoardSave(res)
      if (outcome.kind === 'conflict') {
        setStatus('conflict')
        toast.error(outcome.message)
        return
      }
      if (outcome.kind === 'error') throw new BoardSaveError(outcome.message)
      version.current = outcome.version
      stored.current = outcome.files ?? {}
      // Edits made while this save was running are not in it yet.
      setStatus(lastSig.current === sentSig ? 'saved' : 'dirty')
    } catch (error) {
      setStatus('error')
      toast.error(boardSaveErrorMessage(error))
    } finally {
      inFlight.current = false
      if (resave.current) {
        resave.current = false
        if (statusRef.current === 'dirty') void saveRef.current()
      }
    }
  }, [boardId, editable, payload, setStatus])

  useEffect(() => {
    saveRef.current = save
  }, [save])

  const onChange = useCallback((elements: readonly Element[], appState: { viewBackgroundColor?: unknown; gridSize?: unknown }, files: BinaryFiles) => {
    latest.current = { elements, appState, files }
    const sig = signature(elements, Object.keys(files).length)
    if (lastSig.current === null) {
      lastSig.current = sig
      return
    }
    if (sig === lastSig.current || !editable) return
    lastSig.current = sig
    setStatus('dirty')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void save(), AUTOSAVE_MS)
  }, [editable, save, setStatus])

  /**
   * Sends unsaved edits now, without waiting for the debounce: on page hide or
   * close (keepalive so the request survives the unload) and when the editor
   * unmounts on an in-app link.
   */
  const flush = useCallback(() => {
    if (!editable || statusRef.current !== 'dirty') return
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    // A save is running with the current version; it saves these edits when it returns.
    if (inFlight.current) {
      resave.current = true
      return
    }
    inFlight.current = true
    setStatus('saving')
    markFlush(boardId)
    void payload(false)
      .then(async (body) => {
        if (!body) return
        const text = JSON.stringify(body)
        if (tooLarge(text)) {
          setStatus('error')
          return
        }
        const res = await fetch(`/api/work/whiteboards/${boardId}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: text, keepalive: text.length < KEEPALIVE_LIMIT })
        const outcome = await readBoardSave(res)
        if (outcome.kind === 'conflict') setStatus('conflict')
        else if (outcome.kind === 'saved') {
          version.current = outcome.version
          stored.current = outcome.files ?? stored.current
          setStatus('saved')
        } else setStatus('error')
      })
      .catch(() => setStatus('error'))
      .finally(() => {
        inFlight.current = false
        if (resave.current) {
          resave.current = false
          void saveRef.current()
        }
      })
  }, [boardId, editable, payload, setStatus])

  const flushRef = useRef(flush)
  useEffect(() => {
    flushRef.current = flush
  }, [flush])

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') flushRef.current()
    }
    const onPageHide = () => flushRef.current()
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', onPageHide)
      // Leaving through a link unmounts the editor: send what the debounce has not saved yet.
      flushRef.current()
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  // A save sent while the previous page closed may land after this page read the board:
  // re-read it, lay any new edits over it, and carry on with the newer version.
  useEffect(() => {
    if (!editable || !hasRecentFlush(boardId)) return
    let cancelled = false
    syncing.current = true
    void (async () => {
      try {
        for (const delay of RECHECK_DELAYS) {
          await wait(delay)
          if (cancelled) return
          const res = await fetch(`/api/work/whiteboards/${boardId}`, { cache: 'no-store' })
          if (!res.ok) return
          const data = (await res.json()) as { version: number; scene: Scene }
          if (cancelled || data.version <= version.current) continue
          const a = api.current
          if (!a) return
          const local = a.getSceneElementsIncludingDeleted() as unknown as Element[]
          const hadEdits = statusRef.current !== 'saved'
          const fresh = Object.fromEntries(Object.entries(data.scene.files).filter(([id]) => !stored.current[id]))
          version.current = data.version
          stored.current = { ...data.scene.files, ...stored.current }
          if (Object.keys(fresh).length) a.addFiles(await loadImages(fresh))
          // The next onChange becomes the new baseline unless local edits still need saving.
          if (!hadEdits) lastSig.current = null
          a.updateScene({ elements: mergeElements(data.scene.elements as unknown as Element[], local) as never })
          return
        }
      } catch {
        // Keep the loaded board; a later save reports a real conflict if there is one.
      } finally {
        if (!cancelled) {
          clearFlush(boardId)
          syncing.current = false
          if (statusRef.current === 'dirty') void saveRef.current()
        }
      }
    })()
    return () => {
      cancelled = true
      syncing.current = false
    }
  }, [boardId, editable])

  // Load stored images into the canvas once the API is ready.
  const onApi = useCallback((instance: ExcalidrawImperativeAPI) => {
    api.current = instance
    if (!Object.keys(initialScene.files).length) return
    void loadImages(initialScene.files)
      .then((files) => instance.addFiles(files))
      .catch(() => toast.error('Some images on this board could not be loaded.'))
  }, [initialScene.files])

  return (
    <div className="relative h-[calc(100dvh-210px)] min-h-[480px] max-md:h-[calc(100dvh-300px-env(safe-area-inset-top)-env(safe-area-inset-bottom))] max-md:min-h-[340px] overflow-hidden rounded-card border border-line">
      <Excalidraw
        excalidrawAPI={onApi}
        theme="dark"
        viewModeEnabled={!editable}
        initialData={{ elements: initialScene.elements as never, appState: { ...initialScene.appState, theme: 'dark' } as never, scrollToContent: true }}
        onChange={onChange as never}
      />
      {status === 'conflict' ? (
        <div className="absolute inset-x-0 top-3 z-10 mx-auto flex w-fit items-center gap-3 rounded-full border border-white/[0.12] bg-menu/95 px-4 py-2 text-sm text-white shadow-pop">
          This board changed elsewhere.
          <Button size="sm" variant="primary" icon={<RefreshCw className="size-4" />} onClick={() => window.location.reload()}>Reload</Button>
        </div>
      ) : null}
    </div>
  )
}

export function SaveIndicator({ status }: { status: Status }) {
  const map: Record<Status, { icon: ReactNode; label: string; cls: string }> = {
    saved: { icon: <Check className="size-3.5" />, label: 'Saved', cls: 'text-[#2DCBAF]' },
    dirty: { icon: null, label: 'Unsaved changes', cls: 'text-warning' },
    saving: { icon: <LoaderCircle className="size-3.5 animate-spin" />, label: 'Saving…', cls: 'text-fg-2' },
    conflict: { icon: <CloudOff className="size-3.5" />, label: 'Out of date', cls: 'text-[#FF6A66]' },
    error: { icon: <CloudOff className="size-3.5" />, label: 'Not saved', cls: 'text-[#FF6A66]' },
  }
  const s = map[status]
  return <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${s.cls}`} aria-live="polite">{s.icon}{s.label}</span>
}

export type { Status as SaveStatus, Scene as BoardScene }
