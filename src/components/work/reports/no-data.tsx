import { ChartColumn } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'

export function NoData({ title = 'No data for this period', description = 'Try a wider date range or reset the filters.' }: { title?: string; description?: string }) {
  return (
    <div className="card-solid">
      <EmptyState icon={<ChartColumn />} title={title} description={description} />
    </div>
  )
}
