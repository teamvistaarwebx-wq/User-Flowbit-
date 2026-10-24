import { cn } from '@/lib/utils'
import { faqHref, type FaqItem } from '@/modules/marketing/content/faq'
import { FaqEntry } from './faq-entry'

/**
 * A short list of questions (landing, pricing, product pages). Native
 * `<details>`, so answers stay in the page and work with JavaScript off.
 * Each question links to its place on /faq.
 */
export function FaqList({ items, className }: { items: readonly FaqItem[]; className?: string }) {
  return (
    <div className={cn('glass divide-y divide-white/[0.07] rounded-[14px] p-0', className)}>
      {items.map((item) => (
        <FaqEntry key={item.id} item={item} href={faqHref(item.id)} anchorId={`faq-${item.id}`} />
      ))}
    </div>
  )
}
