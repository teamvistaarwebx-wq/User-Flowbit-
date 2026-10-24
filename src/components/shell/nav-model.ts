import { PRODUCT_KEYS, RAIL_BOTTOM, RAIL_TOP, SIDE_PANELS, type PanelKey, type RailItem, type SideSection } from '@/lib/catalog'
import type { FeatureKey, Permission, ProductKey } from '@/lib/catalog'

export type Access = {
  can: (perm?: Permission) => boolean
  has: (product: ProductKey) => boolean
  hasFeature: (feature?: FeatureKey) => boolean
  products: Record<ProductKey, { entitled: boolean; enabled: boolean }>
  hasEmployee: boolean
  /** The workspace connected its own WhatsApp number (links with `requires: 'whatsapp'`). */
  whatsapp?: boolean
}

export type RailEntry = RailItem & { state: 'open' | 'locked'; target: string }

/** Product preview page for a product the workspace has not bought. */
export const previewHref = (product: ProductKey) => `/app/locked?product=${product}`

/** The product a /app/locked preview is about (?product=orbit, or ?feature=muster.payroll), else null. */
export function previewProduct(pathname: string, params: { get: (name: string) => string | null } | null): ProductKey | null {
  if (pathname !== '/app/locked' || !params) return null
  const key = params.get('product') ?? params.get('feature')?.split('.')[0]
  return key && (PRODUCT_KEYS as readonly string[]).includes(key) ? (key as ProductKey) : null
}

/** The one rail item to highlight on a product preview: the first plain item that belongs to that product. */
export const previewRailKey = (entries: RailEntry[], product: ProductKey | null): string | undefined =>
  product ? entries.find((e) => !e.special && e.products?.[0] === product)?.key : undefined

/**
 * Rail items the member sees. Not entitled -> locked (upgrade dialog).
 * Entitled but switched off -> hidden. Missing permission -> fallback href or hidden.
 */
export function railEntries(items: RailItem[], access: Access): RailEntry[] {
  return items.flatMap((item): RailEntry[] => {
    if (item.products?.length) {
      const anyEntitled = item.products.some((p) => access.products[p].entitled)
      if (!anyEntitled) return [{ ...item, state: 'locked', target: item.href }]
      if (!item.products.some(access.has)) return []
    }
    if (item.perm && !access.can(item.perm)) {
      if (item.key === 'hr' && !access.hasEmployee) return []
      if (!item.fallbackHref || (item.fallbackPerm && !access.can(item.fallbackPerm))) return []
      return [{ ...item, state: 'open', target: item.fallbackHref }]
    }
    return [{ ...item, state: 'open', target: item.href }]
  })
}

export const railTop = (a: Access) => railEntries(RAIL_TOP, a)
export const railBottom = (a: Access) => railEntries(RAIL_BOTTOM, a)

/** Side-panel sections for a panel with links filtered by permission, product and feature. */
export function sideSections(panel: PanelKey, access: Access): SideSection[] {
  return SIDE_PANELS[panel]
    .filter((s) => (!s.selfService || access.hasEmployee) && access.can(s.perm))
    .map((s) => ({
      ...s,
      links: s.links?.filter((l) => access.can(l.perm) && (!l.anyPerm?.length || l.anyPerm.some((p) => access.can(p))) && access.hasFeature(l.feature) && (!l.products || l.products.some(access.has)) && (!l.requires || Boolean(access.whatsapp))),
    }))
    .filter((s) => s.dynamic || (s.links?.length ?? 0) > 0)
}
