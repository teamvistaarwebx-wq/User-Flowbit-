import { buildHref, type SearchParams } from '@/lib/list'
import type { FirmOption } from '@/modules/folio/engine/firm'
import { FilterTabs } from './FilterTabs'

/**
 * "Combined · Vistaar WebX · Vistaar Solutions": the firm filter, kept in
 * ?firm= so links carry it. Hidden when the workspace bills from one firm.
 * `clear` names params that stop making sense under another firm (an entity select).
 */
export function FirmSwitch({ base, params, firms, firm, clear = [] }: { base: string; params: SearchParams; firms: FirmOption[]; firm: FirmOption | null; clear?: string[] }) {
  if (firms.length < 2) return null
  const reset = Object.fromEntries(['page', ...clear].map((k) => [k, undefined]))
  return (
    <FilterTabs
      label="Firm"
      className="shrink-0"
      tabs={[
        { href: buildHref(base, params, { ...reset, firm: undefined }), label: 'Combined', active: !firm },
        ...firms.map((f) => ({ href: buildHref(base, params, { ...reset, firm: f.code }), label: f.name, active: firm?.id === f.id })),
      ]}
    />
  )
}
