/** Plain-text summaries for chart `aria-label`s and their hidden data tables. */

type Format = (v: number) => string
type Series = { name: string; data: number[] }

/** Bars at or below this count get their value printed above them (no hover needed on a phone). */
export const MAX_PRINTED_BARS = 12

const listNames = (names: string[]) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`)

/** Index of the largest value (first one on a tie), or -1 for an empty list. */
const argMax = (values: number[]) => values.reduce((best, v, i) => (best === -1 || v > values[best] ? i : best), -1)

/** Column totals across series (missing points count as 0). */
export const columnTotals = (labels: string[], series: Series[]) => labels.map((_, i) => series.reduce((sum, s) => sum + (s.data[i] ?? 0), 0))

/** True when each column shows one number above it: a single series, or stacked totals. */
export const printsBarValues = (barCount: number, seriesCount: number, stacked = false) => barCount > 0 && barCount <= MAX_PRINTED_BARS && (stacked || seriesCount === 1)

/** e.g. "Bar chart of New clients for 6 months, Jan to Jun. Highest: Mar, 4." */
export function describeBars(labels: string[], series: Series[], format: Format, stacked = false): string {
  if (!labels.length || !series.length) return 'Bar chart with no data'
  const what = series.length === 1 ? series[0].name : `${listNames(series.map((s) => s.name))}${stacked ? ', stacked' : ''}`
  const span = labels.length === 1 ? labels[0] : `${labels[0]} to ${labels[labels.length - 1]}`
  const totals = columnTotals(labels, series)
  const top = argMax(totals)
  const highest = series.length === 1 ? 'Highest' : 'Highest total'
  return `Bar chart of ${what}, ${labels.length} ${labels.length === 1 ? 'bar' : 'bars'}, ${span}. ${highest}: ${labels[top]}, ${format(totals[top])}.`
}

/** e.g. "Trend over 8 points: from 3 to 9, low 2, high 9." */
export function describeTrend(values: number[], format: Format = String): string {
  if (!values.length) return 'No trend data'
  const low = Math.min(...values)
  const high = Math.max(...values)
  return `Trend over ${values.length} ${values.length === 1 ? 'point' : 'points'}: from ${format(values[0])} to ${format(values[values.length - 1])}, low ${format(low)}, high ${format(high)}.`
}
