import { PRODUCTS } from '@/lib/catalog'
import { OG_SIZE, ogImage } from '@/components/marketing/og-card'
import { PRODUCT_CONTENT, isProductKey } from '@/modules/marketing/content'

export const alt = 'A Flowbit product'
export const size = OG_SIZE
export const contentType = 'image/png'

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const key = isProductKey(slug) ? slug : 'work'
  const product = PRODUCTS[key]
  return ogImage({ eyebrow: product.name, title: PRODUCT_CONTENT[key].oneLiner, line: product.tagline, accent: product.accent })
}
