import { OG_SIZE, ogImage } from '@/components/marketing/og-card'

export const alt = 'Flowbit: everything in flow, nothing in the way'
export const size = OG_SIZE
export const contentType = 'image/png'

export default function Image() {
  return ogImage({
    eyebrow: 'Work · HR & payroll · CRM · Billing',
    title: 'Everything in flow. Nothing in the way.',
    line: 'One workspace for Indian teams of up to 150.',
  })
}
