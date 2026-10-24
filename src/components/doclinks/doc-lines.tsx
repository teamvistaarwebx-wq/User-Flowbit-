import { formatINR } from '@/lib/money'
import type { PublicLine, PublicTotal } from '@/modules/doclinks/view-types'

/** Line items and totals: a table on wide screens, stacked rows on a phone. */
export function DocLines({ lines, totals }: { lines: readonly PublicLine[]; totals: readonly PublicTotal[] }) {
  return (
    <div className="space-y-4">
      <ul className="divide-y divide-white/[0.08] border-y border-white/[0.08]">
        {lines.map((line, i) => (
          <li key={i} className="flex items-start justify-between gap-4 py-3 text-sm">
            <span className="min-w-0">
              <span className="block text-white">{line.description}</span>
              {line.qty ? <span className="block text-xs text-white/60">{line.qty} × {formatINR(line.ratePaise)}</span> : null}
            </span>
            <span className="shrink-0 tabular-nums text-white">{formatINR(line.amountPaise)}</span>
          </li>
        ))}
      </ul>
      <dl className="ml-auto max-w-xs space-y-1.5 text-sm">
        {totals.map((t) => (
          <div key={t.label} className={t.strong ? 'flex justify-between border-t border-white/[0.12] pt-2 text-base font-semibold text-white' : 'flex justify-between text-white/70'}>
            <dt>{t.label}</dt>
            <dd className="tabular-nums">{t.amountPaise < 0 ? `− ${formatINR(-t.amountPaise)}` : formatINR(t.amountPaise)}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
