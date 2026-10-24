'use client'

import { useState } from 'react'
import { Segmented } from '@/components/ui/tabs'
import { GST_PERCENT, READ_ONLY_DAYS, yearlyPricingCopy, type BillingCycle, type PlanKey } from '@/lib/plans'
import { gstCopy, YEARLY_DISCOUNT_PERCENT, yearlyOfferCopy } from '@/modules/marketing/pricing'
import { PlanCards } from './plan-cards'
import { PricingCalculator } from './pricing-calculator'
import { COMPANY_LEGAL_NAME } from '@/lib/company'
import { START_FREE_NOTE } from '@/modules/marketing/start-free'

/** Monthly/yearly toggle driving the plan cards and (optionally) the seat calculator. */
export function PricingSection({ only, calculator = true }: { only?: PlanKey[]; calculator?: boolean }) {
  const [cycle, setCycle] = useState<BillingCycle>('monthly')
  return (
    <div>
      <div className="mb-8 flex flex-col items-center gap-3">
        <Segmented
          options={[
            { value: 'monthly', label: 'Monthly' },
            { value: 'yearly', label: `Yearly · ${yearlyOfferCopy()}` },
          ]}
          value={cycle}
          onChange={setCycle}
        />
        <p className="text-center text-[13px] text-[#979797]">
          {START_FREE_NOTE} · No card needed · Prices exclude {GST_PERCENT}% GST
        </p>
      </div>
      <PlanCards cycle={cycle} only={only} />
      {calculator ? (
        <div className="mt-10">
          <PricingCalculator cycle={cycle} />
        </div>
      ) : null}
      <ul className="mx-auto mt-8 grid max-w-3xl gap-1.5 text-center text-xs text-[#979797]">
        <li>{yearlyPricingCopy(YEARLY_DISCOUNT_PERCENT)}</li>
        <li>After the trial or the free months, the workspace stays read-only for {READ_ONLY_DAYS} days while you choose a plan. Export works throughout.</li>
        <li>Pay by card, UPI or netbanking through Razorpay, or by bank transfer against a bill. {gstCopy(COMPANY_LEGAL_NAME)}</li>
      </ul>
    </div>
  )
}
