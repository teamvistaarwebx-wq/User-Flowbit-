import { PRODUCT_KEYS, type ProductKey } from '@/lib/catalog'
import { FOLIO_CONTENT } from './folio'
import { MUSTER_CONTENT } from './muster'
import { ORBIT_CONTENT } from './orbit'
import type { ProductContent } from './types'
import { WORK_CONTENT } from './work'

export type { FeatureBlock, MockKey, ProductContent, Spotlight } from './types'

export const PRODUCT_CONTENT: Record<ProductKey, ProductContent> = {
  work: WORK_CONTENT,
  muster: MUSTER_CONTENT,
  orbit: ORBIT_CONTENT,
  folio: FOLIO_CONTENT,
}

export const isProductKey = (value: string): value is ProductKey => (PRODUCT_KEYS as readonly string[]).includes(value)

export const productHref = (key: ProductKey) => `/products/${key}`
