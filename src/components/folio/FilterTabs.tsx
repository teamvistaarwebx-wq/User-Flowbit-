import { SegmentLinks } from './ui'

export type FilterTab = { href: string; label: string; active: boolean; count?: number }

/**
 * Filter tabs whose active state the server decides (LinkTabs matches on URL params, which misfires when filters
 * carry extra params like dates). Drawn as the dashboard's segmented control ("All task / Done / Due").
 */
export function FilterTabs({ tabs, className, label = 'Filter' }: { tabs: FilterTab[]; className?: string; label?: string }) {
  return <SegmentLinks label={label} className={className} items={tabs} />
}
