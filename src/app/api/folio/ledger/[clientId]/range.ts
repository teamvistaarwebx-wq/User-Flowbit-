const ISO = /^\d{4}-\d{2}-\d{2}$/

/** ?from&to as ISO dates (anything else is ignored). */
export function rangeFrom(params: URLSearchParams): { from: string | null; to: string | null } {
  const from = params.get('from')
  const to = params.get('to')
  return { from: from && ISO.test(from) ? from : null, to: to && ISO.test(to) ? to : null }
}
