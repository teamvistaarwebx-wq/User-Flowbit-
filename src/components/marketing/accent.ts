/** Product accent CSS variable for a product key ('var(--work)'), or the orchid brand accent. */
export const accentOf = (product: string): string =>
  ['work', 'muster', 'orbit', 'folio'].includes(product) ? `var(--${product})` : 'var(--orchid)'
