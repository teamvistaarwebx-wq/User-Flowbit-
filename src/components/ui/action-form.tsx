'use client'

import { useRouter } from 'next/navigation'
import { createContext, useCallback, useContext, useRef, useState, useTransition, type FormEvent, type ReactNode } from 'react'
import type { ActionResult } from '@/lib/action-types'
import { openLimitPrompt } from '@/lib/limit-prompt'
import { play } from '@/lib/sound'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { Button, type ButtonProps } from './button'
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL } from '@/lib/upload-limit'
import { SAVE_FAILED } from '@/lib/user-errors'

type FormState = { pending: boolean; fieldErrors: Record<string, string> }
const FormContext = createContext<FormState>({ pending: false, fieldErrors: {} })

/** Field error for `name` inside the nearest ActionForm. */
export const useFieldError = (name?: string) => {
  const { fieldErrors } = useContext(FormContext)
  return name ? fieldErrors[name] : undefined
}
export const useFormPending = () => useContext(FormContext).pending

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyAction = (input: FormData) => Promise<ActionResult<any>>

export type ActionFormProps<A extends AnyAction> = {
  action: A
  children: ReactNode
  /** Called after a successful result (before redirect); receives the `ok: true` branch. */
  onDone?: (result: Extract<Awaited<ReturnType<A>>, { ok: true }>) => void
  /** Clear the form after success (quick-add rows, comment boxes). */
  resetOnSuccess?: boolean
  /** Skip router.refresh() after success. */
  noRefresh?: boolean
  className?: string
  id?: string
}

/** Matches the server's upload cap (MAX_UPLOAD_MB); larger bodies are refused before the action runs (on Vercel with a 413). */
const MAX_FORM_UPLOAD_BYTES = MAX_UPLOAD_BYTES
const UPLOAD_TOO_LARGE = `Files must be ${MAX_UPLOAD_LABEL} or smaller in total. Choose a smaller file.`

const uploadBytes = (data: FormData) => [...data.values()].reduce((sum, v) => sum + (typeof v === 'string' ? 0 : v.size), 0)

function scrollToField(form: HTMLFormElement, name: string) {
  const el = form.querySelector<HTMLElement>(`[name="${CSS.escape(name)}"], [data-field="${CSS.escape(name)}"]`)
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  if ('focus' in el && el.getAttribute('type') !== 'hidden') el.focus({ preventScroll: true })
}

/**
 * Runs a server action built with `action()`: submits FormData, disables the
 * submit button while pending, toasts with sound, shows field errors (kept
 * input on refusal), scrolls to the first error and follows `redirect`.
 */
export function ActionForm<A extends AnyAction>({ action, children, onDone, resetOnSuccess, noRefresh, className, id }: ActionFormProps<A>) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const formRef = useRef<HTMLFormElement>(null)

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    if (uploadBytes(data) > MAX_FORM_UPLOAD_BYTES) {
      toast.error(UPLOAD_TOO_LARGE)
      return
    }
    startTransition(async () => {
      try {
        const result = (await action(data)) as Awaited<ReturnType<A>>
        if (!result.ok) {
          setFieldErrors(result.fieldErrors ?? {})
          if (!openLimitPrompt(result)) toast.error(result.error)
          const firstField = Object.keys(result.fieldErrors ?? {})[0]
          if (firstField) scrollToField(form, firstField)
          return
        }
        setFieldErrors({})
        if (result.message) toast.success(result.message)
        else play('success')
        // `!result.ok` returned above; TS cannot narrow the generic result itself.
        onDone?.(result as Extract<Awaited<ReturnType<A>>, { ok: true }>)
        if (resetOnSuccess) form.reset()
        if (result.redirect) router.push(result.redirect)
        else if (!noRefresh) router.refresh()
      } catch (error) {
        // Thrown errors are transport or framework failures (a dropped connection, a refused body); their text is not for users.
        console.error('[ui] form action failed', error)
        toast.error(SAVE_FAILED)
      }
    })
  }

  return (
    <FormContext.Provider value={{ pending, fieldErrors }}>
      {/* method="post": a submit before hydration (or without JS) must never put fields such as passwords in the URL. */}
      <form ref={formRef} id={id} method="post" onSubmit={onSubmit} className={className} noValidate aria-busy={pending || undefined}>
        {children}
      </form>
    </FormContext.Provider>
  )
}

/** Submit button for ActionForm: primary by default, shows `pendingLabel` while saving. */
export function SubmitButton({ children, pendingLabel = 'Saving…', variant = 'primary', ...rest }: ButtonProps & { pendingLabel?: string }) {
  const pending = useFormPending()
  return (
    <Button type="submit" variant={variant} loading={pending} {...rest}>
      {pending ? pendingLabel : children}
    </Button>
  )
}

/**
 * For buttons that run an action without a form:
 *   const [run, pending] = useAction(deleteTask)
 *   <Button onClick={() => run({ id })} loading={pending}>Delete</Button>
 */
export function useAction<I, O>(fn: (input: I) => Promise<ActionResult<O>>, opts: { onDone?: (result: Extract<ActionResult<O>, { ok: true }>) => void; noRefresh?: boolean } = {}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const { onDone, noRefresh } = opts
  const run = useCallback(
    (input: I) =>
      new Promise<ActionResult<O>>((resolve) => {
        startTransition(async () => {
          try {
            const result = await fn(input)
            if (result.ok) {
              if (result.message) toast.success(result.message)
              onDone?.(result)
              if (result.redirect) router.push(result.redirect)
              else if (!noRefresh) router.refresh()
            } else if (!openLimitPrompt(result)) {
              toast.error(result.error)
            }
            resolve(result)
          } catch (error) {
            console.error('[ui] action failed', error)
            toast.error(SAVE_FAILED)
            resolve({ ok: false, error: SAVE_FAILED })
          }
        })
      }),
    [fn, onDone, noRefresh, router],
  )
  return [run, pending] as const
}

export type FormFieldProps = {
  /** Field name: links the error from the action's fieldErrors. */
  name?: string
  label?: ReactNode
  required?: boolean
  help?: ReactNode
  children: ReactNode
  className?: string
  /** Puts the label and control on one row (switches). */
  inline?: boolean
  htmlFor?: string
}

/** Label + control + error/help text. Errors come from the surrounding ActionForm. */
export function FormField({ name, label, required, help, children, className, inline, htmlFor }: FormFieldProps) {
  const error = useFieldError(name)
  return (
    <div data-field={name} data-invalid={error ? 'true' : undefined} className={cn('min-w-0', inline ? 'flex items-center justify-between gap-4' : 'space-y-1.5', error && '[&_input]:border-danger/70 [&_textarea]:border-danger/70 [&_button[role=combobox]]:border-danger/70', className)}>
      {label ? (
        <label htmlFor={htmlFor ?? name} className="block text-sm font-medium text-fg">
          {label}
          {required ? <span className="text-[#F64A45]">*</span> : null}
        </label>
      ) : null}
      {children}
      {error ? (
        <p role="alert" className="text-[13px] text-[#ff7b77] animate-fade-in">
          {error}
        </p>
      ) : help ? (
        <p className="text-[13px] text-fg-3">{help}</p>
      ) : null}
    </div>
  )
}
