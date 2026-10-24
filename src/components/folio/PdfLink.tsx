import { FileDown } from 'lucide-react'
import { buttonClass } from '@/components/ui/button-styles'

/** Opens a document PDF in a new tab (a route handler, so a plain anchor). Server-safe. */
export function PdfLink({ href, label = 'PDF' }: { href: string; label?: string }) {
  return (
    <a href={href} target="_blank" rel="noopener" className={buttonClass('secondary', 'sm')}>
      <FileDown className="size-4" />
      {label}
    </a>
  )
}
