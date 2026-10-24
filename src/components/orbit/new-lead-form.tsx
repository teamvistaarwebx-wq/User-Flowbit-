'use client'

import { useRouter } from 'next/navigation'
import { LeadForm, type LeadFormProps } from './lead-form'

/** The lead form on its own page: Cancel goes back. */
export function NewLeadForm(props: Omit<LeadFormProps, 'onCancel' | 'onDone'>) {
  const router = useRouter()
  return <LeadForm {...props} onCancel={() => router.back()} />
}
