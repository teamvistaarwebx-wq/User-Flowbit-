/** Salary component vocabulary (pure, client-safe). */

export const COMPONENT_TYPES = ['earning', 'deduction', 'employer_contribution'] as const
export type ComponentType = (typeof COMPONENT_TYPES)[number]

export const CALCULATION_TYPES = ['fixed', 'percent_of_basic', 'percent_of_gross', 'percent_of_ctc', 'computed'] as const
export type CalculationType = (typeof CALCULATION_TYPES)[number]

export const COMPONENT_TYPE_LABELS: Record<ComponentType, string> = {
  earning: 'Earning',
  deduction: 'Deduction',
  employer_contribution: 'Employer contribution',
}

export const CALCULATION_LABELS: Record<CalculationType, string> = {
  fixed: 'Fixed amount',
  percent_of_basic: '% of basic',
  percent_of_gross: '% of gross',
  percent_of_ctc: '% of CTC',
  computed: 'Computed by payroll',
}

/** Codes the engine writes itself: they cannot be renamed, retyped or retired. */
export const PROTECTED_COMPONENT_CODES = ['BASIC', 'PF_EE', 'PF_ER', 'ESI_EE', 'ESI_ER', 'PT', 'LWF_EE', 'LWF_ER', 'REIMBURSEMENT'] as const
export const isProtectedCode = (code: string): boolean => (PROTECTED_COMPONENT_CODES as readonly string[]).includes(code)

export type StandardComponent = {
  code: string
  name: string
  componentType: ComponentType
  calculationType: CalculationType
  defaultValue: number
  countsForPf?: boolean
  countsForWages?: boolean
  countsForEsi?: boolean
  prorateOnLop?: boolean
  isRecurring?: boolean
  isTaxable?: boolean
  isSystem?: boolean
  displayOrder: number
}

/** The standard set ("Load the standard set" and the seed). `defaultValue` is a % for percent types, paise for fixed. */
export const STANDARD_COMPONENTS: StandardComponent[] = [
  { code: 'BASIC', name: 'Basic Salary', componentType: 'earning', calculationType: 'percent_of_gross', defaultValue: 50, countsForPf: true, countsForWages: true, countsForEsi: true, isSystem: true, displayOrder: 10 },
  { code: 'HRA', name: 'House Rent Allowance', componentType: 'earning', calculationType: 'percent_of_basic', defaultValue: 40, countsForEsi: true, displayOrder: 20 },
  { code: 'CONVEYANCE', name: 'Conveyance Allowance', componentType: 'earning', calculationType: 'fixed', defaultValue: 0, countsForEsi: true, displayOrder: 30 },
  { code: 'SPECIAL', name: 'Special Allowance', componentType: 'earning', calculationType: 'fixed', defaultValue: 0, countsForEsi: true, displayOrder: 40 },
  { code: 'OTHER_ALW', name: 'Other Allowance', componentType: 'earning', calculationType: 'fixed', defaultValue: 0, countsForEsi: true, displayOrder: 50 },
  { code: 'VARIABLE', name: 'Variable Pay', componentType: 'earning', calculationType: 'fixed', defaultValue: 0, countsForEsi: true, prorateOnLop: false, isRecurring: false, displayOrder: 60 },
  { code: 'INCENTIVE', name: 'Incentive', componentType: 'earning', calculationType: 'fixed', defaultValue: 0, prorateOnLop: false, isRecurring: false, displayOrder: 70 },
  { code: 'BONUS', name: 'Bonus', componentType: 'earning', calculationType: 'fixed', defaultValue: 0, prorateOnLop: false, isRecurring: false, displayOrder: 80 },
  { code: 'ARREARS', name: 'Arrears', componentType: 'earning', calculationType: 'fixed', defaultValue: 0, prorateOnLop: false, isRecurring: false, displayOrder: 90 },
  { code: 'PF_EE', name: 'Provident Fund', componentType: 'deduction', calculationType: 'computed', defaultValue: 0, isSystem: true, displayOrder: 610 },
  { code: 'ESI_EE', name: 'ESI Contribution', componentType: 'deduction', calculationType: 'computed', defaultValue: 0, isSystem: true, displayOrder: 620 },
  { code: 'PT', name: 'Professional Tax', componentType: 'deduction', calculationType: 'computed', defaultValue: 0, isSystem: true, displayOrder: 630 },
  { code: 'TDS', name: 'TDS', componentType: 'deduction', calculationType: 'fixed', defaultValue: 0, displayOrder: 650 },
  { code: 'ADVANCE', name: 'Salary Advance Recovery', componentType: 'deduction', calculationType: 'fixed', defaultValue: 0, displayOrder: 660 },
  { code: 'LOAN', name: 'Loan Recovery', componentType: 'deduction', calculationType: 'fixed', defaultValue: 0, displayOrder: 670 },
  { code: 'OTHER_DED', name: 'Other Deduction', componentType: 'deduction', calculationType: 'fixed', defaultValue: 0, displayOrder: 680 },
  { code: 'PF_ER', name: 'Employer PF', componentType: 'employer_contribution', calculationType: 'computed', defaultValue: 0, isSystem: true, displayOrder: 810 },
  { code: 'ESI_ER', name: 'Employer ESI', componentType: 'employer_contribution', calculationType: 'computed', defaultValue: 0, isSystem: true, displayOrder: 820 },
]

/** A percentage above 100 is almost always a fixed amount typed in the wrong box. */
export const percentageLooksWrong = (calculationType: CalculationType, value: number): boolean =>
  calculationType.startsWith('percent_') && value > 100
