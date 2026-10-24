import { forwardRef, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

/** Field surface (DESIGN 12): translucent fill, translucent hairline, a soft orchid ring on focus. */
export const fieldBase =
  'w-full border border-white/[0.18] bg-white/[0.06] text-fg placeholder:text-fg-4 transition-[border-color,background-color,box-shadow] duration-150 hover:border-white/[0.28] focus:border-white/45 focus:bg-white/[0.07] focus:shadow-[0_0_0_3px_rgba(187,98,165,0.25)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-danger/70'

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  /** Icon inside the left edge. */
  icon?: ReactNode
  /** Element inside the right edge (e.g. a unit or button). */
  trailing?: ReactNode
  inputSize?: 'sm' | 'md' | 'lg'
}

const sizes = { sm: 'h-8 text-[13px]', md: 'h-10 text-sm', lg: 'h-12 text-[15px]' }

/** Pill text input. Works in server and client components. */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ className, icon, trailing, inputSize = 'md', ...props }, ref) {
  const input = (
    <input
      ref={ref}
      className={cn(fieldBase, 'rounded-full px-4', sizes[inputSize], icon && 'pl-11', trailing && 'pr-12', !icon && !trailing && className)}
      {...props}
    />
  )
  if (!icon && !trailing) return input
  return (
    <div className={cn('relative', className)}>
      {icon ? <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-3 [&_svg]:size-[18px]">{icon}</span> : null}
      {input}
      {trailing ? <span className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-3 text-xs">{trailing}</span> : null}
    </div>
  )
})

/** Rounded multi-line input. */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, rows = 4, ...props }, ref) {
  return <textarea ref={ref} rows={rows} className={cn(fieldBase, 'rounded-[14px] px-4 py-3 text-sm leading-relaxed resize-y min-h-20', className)} {...props} />
})

/** Native select styled like the inputs (server-friendly; use Select for the Radix version). */
export const NativeSelect = forwardRef<HTMLSelectElement, InputHTMLAttributes<HTMLSelectElement> & { options: { value: string; label: string }[]; placeholder?: string }>(
  function NativeSelect({ className, options, placeholder, ...props }, ref) {
    return (
      <select ref={ref} className={cn(fieldBase, 'h-10 rounded-full px-4 text-sm appearance-none bg-[size:16px] bg-[position:right_14px_center] bg-no-repeat pr-10', className)} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23858386' stroke-width='1.5'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }} {...props}>
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-bg-2">
            {o.label}
          </option>
        ))}
      </select>
    )
  },
)

/** Date input ('YYYY-MM-DD'), styled as a pill. */
export const DateInput = forwardRef<HTMLInputElement, Omit<InputProps, 'type'> & { type?: 'date' | 'month' | 'time' | 'datetime-local' }>(function DateInput({ type = 'date', ...props }, ref) {
  return <Input ref={ref} type={type} {...props} />
})
