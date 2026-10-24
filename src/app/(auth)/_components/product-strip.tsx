import Link from 'next/link'
import { PRODUCT_KEYS, PRODUCTS } from '@/lib/catalog'
import { cn } from '@/lib/utils'

/** One sign-in for all four products: a quiet line of product names. */
export function ProductStrip({ className }: { className?: string }) {
  return (
    <p className={cn('text-[13px]', className)}>
      <span className="opacity-80">One sign-in for </span>
      {PRODUCT_KEYS.map((key, i) => (
        <span key={key}>
          {i > 0 ? <span className="opacity-60">{i === PRODUCT_KEYS.length - 1 ? ' and ' : ', '}</span> : null}
          <Link href={`/products/${PRODUCTS[key].slug}`} className="underline-offset-4 transition-opacity hover:underline">
            {PRODUCTS[key].shortName}
          </Link>
        </span>
      ))}
    </p>
  )
}
