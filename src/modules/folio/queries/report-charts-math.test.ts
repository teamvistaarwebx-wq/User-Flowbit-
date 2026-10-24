import { describe, expect, it } from 'vitest'
import { bucketFor, daysOverdue } from '@/modules/folio/engine/aging'
import { agingDueRange, agingSlices, gstSummary, monthlyPairs, monthsBetween } from './report-charts-math'

const TODAY = '2026-10-09'
const row = (dueDate: string, balancePaise: number) => ({ dueDate, balancePaise, bucket: bucketFor(daysOverdue(dueDate, TODAY)) })

describe('aging buckets', () => {
  it('sums balances and counts open invoices per bucket, in order', () => {
    const slices = agingSlices([row('2026-10-20', 100), row('2026-10-01', 200), row('2026-09-01', 300), row('2026-08-01', 400), row('2026-06-01', 500), row('2026-06-02', 0)], TODAY)
    expect(slices.map((s) => [s.bucket, s.paise, s.count])).toEqual([
      ['current', 100, 1],
      ['1_30', 200, 1],
      ['31_60', 300, 1],
      ['61_90', 400, 1],
      ['90_plus', 500, 1],
    ])
  })
  it('maps every bucket to a due-date range that puts the edges in the right bucket', () => {
    for (const [due, bucket] of [['2026-10-09', 'current'], ['2026-10-08', '1_30'], ['2026-09-09', '1_30'], ['2026-09-08', '31_60'], ['2026-08-10', '31_60'], ['2026-08-09', '61_90'], ['2026-07-11', '61_90'], ['2026-07-10', '90_plus']] as const) {
      expect(bucketFor(daysOverdue(due, TODAY))).toBe(bucket)
      const { from, to } = agingDueRange(bucket, TODAY)
      expect(!from || due >= from).toBe(true)
      expect(!to || due <= to).toBe(true)
    }
  })
})

describe('monthly series', () => {
  it('lists months inclusive and fills empty months with zero', () => {
    expect(monthsBetween('2026-04-15', '2026-07-01')).toEqual(['2026-04', '2026-05', '2026-06', '2026-07'])
    expect(monthlyPairs(['2026-08', '2026-09'], [{ _id: '2026-09', n: 500 }], [{ _id: '2026-08', n: 100 }])).toEqual([
      { month: '2026-08', invoicedPaise: 0, collectedPaise: 100 },
      { month: '2026-09', invoicedPaise: 500, collectedPaise: 0 },
    ])
  })
})

describe('GST summary', () => {
  it('groups output tax by rate and month, net of credit notes', () => {
    const invoices = [
      { month: '2026-09', rate: 18, taxablePaise: 100_000, cgstPaise: 9_000, sgstPaise: 9_000, igstPaise: 0 },
      { month: '2026-09', rate: 5, taxablePaise: 20_000, cgstPaise: 0, sgstPaise: 0, igstPaise: 1_000 },
      { month: '2026-10', rate: 18, taxablePaise: 50_000, cgstPaise: 0, sgstPaise: 0, igstPaise: 9_000 },
    ]
    const credits = [{ month: '2026-10', rate: 18, taxablePaise: 10_000, cgstPaise: 900, sgstPaise: 900, igstPaise: 0 }]
    const s = gstSummary(invoices, credits, ['2026-09', '2026-10'])
    expect(s.byRate).toEqual([
      { rate: 5, taxablePaise: 20_000, cgstPaise: 0, sgstPaise: 0, igstPaise: 1_000, taxPaise: 1_000 },
      { rate: 18, taxablePaise: 140_000, cgstPaise: 8_100, sgstPaise: 8_100, igstPaise: 9_000, taxPaise: 25_200 },
    ])
    expect(s.byMonth).toEqual([
      { month: '2026-09', cgstPaise: 9_000, sgstPaise: 9_000, igstPaise: 1_000, taxPaise: 19_000 },
      { month: '2026-10', cgstPaise: -900, sgstPaise: -900, igstPaise: 9_000, taxPaise: 7_200 },
    ])
    expect(s.totals).toEqual({ taxablePaise: 160_000, cgstPaise: 8_100, sgstPaise: 8_100, igstPaise: 10_000, taxPaise: 26_200 })
  })
  it('keeps reverse-charge tax out of output tax and totals it apart (R1 6.1)', () => {
    const invoices = [
      { month: '2026-10', rate: 18, taxablePaise: 100_000, cgstPaise: 9_000, sgstPaise: 9_000, igstPaise: 0 },
      { month: '2026-10', rate: 18, taxablePaise: 50_000, cgstPaise: 4_500, sgstPaise: 4_500, igstPaise: 0, reverseCharge: true },
    ]
    const credits = [{ month: '2026-10', rate: 18, taxablePaise: 10_000, cgstPaise: 900, sgstPaise: 900, igstPaise: 0, reverseCharge: true }]
    const s = gstSummary(invoices, credits, ['2026-10'])
    expect(s.totals).toEqual({ taxablePaise: 100_000, cgstPaise: 9_000, sgstPaise: 9_000, igstPaise: 0, taxPaise: 18_000 })
    expect(s.byMonth[0].taxPaise).toBe(18_000)
    expect(s.reverseCharge).toEqual({ taxablePaise: 40_000, taxPaise: 7_200 })
  })
  it('is empty with nothing issued', () => {
    expect(gstSummary([], [], ['2026-10']).totals.taxPaise).toBe(0)
  })
})
