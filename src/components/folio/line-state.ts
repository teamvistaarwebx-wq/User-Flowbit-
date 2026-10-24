/** Builder line state (strings, as typed). Plain module so server pages can build initial lines. */

export type LineState = { key: string; serviceItemId: string; description: string; hsnSac: string; quantity: string; unit: string; rate: string; discountPercent: string; gstRatePercent: string }

export const newLine = (gstRatePercent: number, patch: Partial<Omit<LineState, 'key'>> = {}): LineState => ({
  key: `line-${Math.random().toString(36).slice(2, 10)}`,
  serviceItemId: '',
  description: '',
  hsnSac: '',
  quantity: '1',
  unit: 'nos',
  rate: '',
  discountPercent: '',
  gstRatePercent: String(gstRatePercent),
  ...patch,
})

type StoredLine = { serviceItemId?: unknown; description: string; hsnSac?: string | null; quantity: number; unit?: string | null; ratePaise: number; discountPercent: number; gstRatePercent: number }

/** Stored invoice/quote lines back into builder state (rates in rupees). */
export const linesFromStored = (lines: readonly StoredLine[]): LineState[] =>
  lines.map((l) =>
    newLine(l.gstRatePercent, {
      serviceItemId: l.serviceItemId ? String(l.serviceItemId) : '',
      description: l.description,
      hsnSac: l.hsnSac ?? '',
      quantity: String(l.quantity),
      unit: l.unit ?? 'nos',
      rate: (l.ratePaise / 100).toFixed(2),
      discountPercent: l.discountPercent ? String(l.discountPercent) : '',
    }),
  )
