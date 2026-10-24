import { Icon } from '@/components/ui/icon'
import { PRODUCTS, type ProductKey } from '@/lib/catalog'
import { cn } from '@/lib/utils'
import { accentOf } from './accent'

/** The product's own icon in its accent colour. Use instead of a coloured dot before a product name. */
export function ProductIcon({ product, className }: { product: ProductKey; className?: string }) {
  return <Icon name={PRODUCTS[product].icon} className={cn('size-4 shrink-0', className)} style={{ color: accentOf(product) }} />
}
