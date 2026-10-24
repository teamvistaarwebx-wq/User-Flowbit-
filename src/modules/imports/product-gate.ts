import type { ProductKey } from '@/lib/catalog'

/** Why an importer may not run in this workspace because its product is off, or null (V2-REVIEW C7: staff imports too). */
export const importProductRefusal = (has: (product: ProductKey) => boolean, importer: { product?: ProductKey | null; label: string }): string | null =>
  importer.product && !has(importer.product) ? `${importer.label} needs a product that is not on in this workspace.` : null
