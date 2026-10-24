import type { IconName, ProductKey } from '@/lib/catalog'
import type { PlanKey } from '@/lib/plans'

export type FeatureBlock = {
  icon: IconName
  title: string
  body: string
  points?: string[]
}

/** A deep-dive section on a product page, paired with a mock screen. */
export type Spotlight = {
  label: string
  icon: IconName
  title: string
  body: string
  points: string[]
  /** Which mock screen to render beside it (see components/marketing/mocks). */
  mock: MockKey
}

export type MockKey =
  | 'work-board' | 'work-project' | 'work-timesheet'
  | 'muster-attendance' | 'muster-payroll' | 'muster-letters'
  | 'orbit-pipeline' | 'orbit-lead' | 'orbit-reports'
  | 'folio-invoice' | 'folio-aging' | 'folio-receipt'

export type ProductContent = {
  key: ProductKey
  /** Short category line above the hero title ("Work management"). */
  eyebrow: string
  /** The product promise ("Tasks, projects and the week, in one place."). */
  oneLiner: string
  sub: string
  heroMock: MockKey
  features: FeatureBlock[]
  spotlights: Spotlight[]
  steps: { title: string; body: string }[]
  worksWith: { title: string; body: string; href: string; product: ProductKey | 'core' }[]
  notYet: string[]
  plans: PlanKey[]
  pricingNote: string
  seo: { title: string; description: string }
}
