import type { EmployeeStatus } from '@/modules/muster/people/lifecycle'

/**
 * The 20 HR letters, their inputs and when each is due (pure). `suggestedFor`
 * orders the picker; every letter stays pickable (intern-only ones only for
 * interns).
 */

export const LETTER_STATUSES = ['draft', 'issued', 'revoked'] as const
export type LetterStatus = (typeof LETTER_STATUSES)[number]

export type LetterCategory = 'internship' | 'onboarding' | 'employment' | 'compensation' | 'disciplinary' | 'exit' | 'custom'

export type LetterInput = {
  name: string
  label: string
  type: 'text' | 'textarea' | 'date' | 'number'
  required?: boolean
  hint?: string
  /** A rupee figure: a letter that asks for one states pay. */
  pay?: boolean
}

export type LetterDefinition = {
  code: string
  name: string
  category: LetterCategory
  purpose: string
  suggestedFor: EmployeeStatus[]
  internsOnly?: boolean
  inputs: LetterInput[]
}

const HR_COMMENTS: LetterInput = {
  name: 'hrComments',
  label: 'HR comments',
  type: 'textarea',
  hint: 'Appears in the letter where {{comments.hr}} is placed.',
}
const MANAGER_COMMENTS: LetterInput = {
  name: 'managerComments',
  label: 'Manager comments',
  type: 'textarea',
  hint: "The reporting manager's assessment.",
}
const PERFORMANCE: LetterInput = {
  name: 'performanceRemarks',
  label: 'Performance remarks',
  type: 'textarea',
}
const WORK_DONE: LetterInput = {
  name: 'workUndertaken',
  label: 'Work / project undertaken',
  type: 'textarea',
  required: true,
  hint: 'What they actually worked on. This is the part a future employer reads.',
}
const RECOMMENDATION: LetterInput = {
  name: 'recommendationComments',
  label: 'Recommendation',
  type: 'textarea',
  required: true,
}
const EFFECTIVE_DATE: LetterInput = {
  name: 'effectiveDate',
  label: 'Effective from',
  type: 'date',
  required: true,
}

export const LETTERS: LetterDefinition[] = [
  // --- internship -------------------------------------------------------
  {
    code: 'internship_offer',
    internsOnly: true,
    name: 'Internship Offer Letter',
    category: 'internship',
    purpose: 'Offers an internship, with dates, stipend and reporting line.',
    suggestedFor: ['candidate', 'offered', 'joining_pending'],
    inputs: [
      EFFECTIVE_DATE,
      { name: 'stipend', label: 'Monthly stipend (₹)', type: 'number', pay: true },
      { name: 'durationMonths', label: 'Duration (months)', type: 'number', required: true },
      HR_COMMENTS,
    ],
  },
  {
    code: 'internship_completion',
    internsOnly: true,
    name: 'Internship Completion Letter',
    category: 'internship',
    purpose: 'Confirms the internship was completed, with dates and duration.',
    suggestedFor: ['internship_completed', 'intern'],
    inputs: [WORK_DONE, PERFORMANCE, HR_COMMENTS],
  },
  {
    code: 'internship_certificate',
    internsOnly: true,
    name: 'Internship Certificate',
    category: 'internship',
    purpose: 'A certificate suitable for framing or attaching to an application.',
    suggestedFor: ['internship_completed', 'intern'],
    inputs: [WORK_DONE, HR_COMMENTS],
  },
  {
    code: 'internship_experience',
    internsOnly: true,
    name: 'Internship Experience Letter',
    category: 'internship',
    purpose: 'Describes the work and the conduct, for a future employer.',
    suggestedFor: ['internship_completed', 'intern'],
    inputs: [WORK_DONE, PERFORMANCE, MANAGER_COMMENTS, HR_COMMENTS],
  },
  {
    code: 'internship_recommendation',
    internsOnly: true,
    name: 'Internship Recommendation Letter',
    category: 'internship',
    purpose: 'A recommendation from the reporting manager.',
    suggestedFor: ['internship_completed', 'intern'],
    inputs: [WORK_DONE, RECOMMENDATION, MANAGER_COMMENTS],
  },
  {
    code: 'recommendation',
    name: 'Letter of Recommendation (LOR)',
    category: 'internship',
    purpose: 'A general recommendation, for applications and further study.',
    suggestedFor: ['internship_completed', 'exited', 'active', 'confirmed'],
    inputs: [WORK_DONE, RECOMMENDATION, MANAGER_COMMENTS],
  },

  // --- joining and employment -------------------------------------------
  {
    code: 'employee_offer',
    name: 'Employee Offer Letter',
    category: 'onboarding',
    purpose: 'Offers the role, with compensation and joining date.',
    suggestedFor: ['candidate', 'offered'],
    inputs: [EFFECTIVE_DATE, HR_COMMENTS],
  },
  {
    code: 'appointment',
    name: 'Appointment Letter',
    category: 'onboarding',
    purpose: 'Formal appointment on joining, with terms.',
    suggestedFor: ['joining_pending', 'probation', 'intern'],
    inputs: [EFFECTIVE_DATE, HR_COMMENTS],
  },
  {
    code: 'confirmation',
    name: 'Confirmation Letter',
    category: 'employment',
    purpose: 'Confirms someone in the role after probation.',
    suggestedFor: ['probation'],
    inputs: [EFFECTIVE_DATE, PERFORMANCE, MANAGER_COMMENTS],
  },
  {
    code: 'experience',
    name: 'Experience Letter',
    category: 'exit',
    purpose: 'States the role and the dates worked. The document most often asked for.',
    suggestedFor: ['exited', 'notice_period', 'resigned', 'internship_completed'],
    inputs: [WORK_DONE, HR_COMMENTS],
  },

  // --- compensation ------------------------------------------------------
  {
    code: 'salary_revision',
    name: 'Salary Revision Letter',
    category: 'compensation',
    purpose: 'Records a change in compensation, effective from a date.',
    suggestedFor: ['active', 'confirmed', 'probation'],
    inputs: [
      EFFECTIVE_DATE,
      { name: 'revisedCtc', label: 'Revised annual CTC (₹)', type: 'number', required: true, pay: true },
      HR_COMMENTS,
    ],
  },
  {
    code: 'promotion',
    name: 'Promotion Letter',
    category: 'compensation',
    purpose: 'Records a change in title and, usually, compensation.',
    suggestedFor: ['active', 'confirmed'],
    inputs: [
      EFFECTIVE_DATE,
      { name: 'newDesignation', label: 'New designation', type: 'text', required: true },
      { name: 'revisedCtc', label: 'Revised annual CTC (₹)', type: 'number', pay: true },
      MANAGER_COMMENTS,
    ],
  },

  // --- disciplinary ------------------------------------------------------
  {
    code: 'warning',
    name: 'Warning Letter',
    category: 'disciplinary',
    purpose: 'A formal warning, on record.',
    suggestedFor: ['active', 'confirmed', 'probation', 'intern'],
    inputs: [
      { name: 'incident', label: 'What happened', type: 'textarea', required: true },
      { name: 'expectation', label: 'What is expected now', type: 'textarea', required: true },
      HR_COMMENTS,
    ],
  },
  {
    code: 'show_cause',
    name: 'Show Cause Notice',
    category: 'disciplinary',
    purpose: 'Asks for an explanation before any action is taken.',
    suggestedFor: ['active', 'confirmed', 'probation'],
    inputs: [
      { name: 'incident', label: 'What happened', type: 'textarea', required: true },
      { name: 'respondBy', label: 'Respond by', type: 'date', required: true },
    ],
  },
  {
    code: 'termination',
    name: 'Termination Letter',
    category: 'exit',
    purpose: 'Ends employment, with reason and effective date.',
    suggestedFor: ['terminated', 'notice_period'],
    inputs: [
      EFFECTIVE_DATE,
      { name: 'groundsForTermination', label: 'Grounds', type: 'textarea', required: true },
      HR_COMMENTS,
    ],
  },

  // --- exit --------------------------------------------------------------
  {
    code: 'resignation_acceptance',
    name: 'Resignation Acceptance Letter',
    category: 'exit',
    purpose: 'Accepts a resignation and states the last working day.',
    suggestedFor: ['resigned', 'notice_period'],
    inputs: [
      { name: 'resignationDate', label: 'Resignation received on', type: 'date', required: true },
      { name: 'lastWorkingDay', label: 'Last working day', type: 'date', required: true },
      HR_COMMENTS,
    ],
  },
  {
    code: 'relieving',
    name: 'Relieving / Exit Letter',
    category: 'exit',
    purpose: 'Releases someone from their obligations on their last day.',
    suggestedFor: ['exited', 'notice_period', 'resigned'],
    inputs: [
      { name: 'lastWorkingDay', label: 'Last working day', type: 'date', required: true },
      HR_COMMENTS,
    ],
  },
  {
    code: 'full_and_final',
    name: 'Full and Final Settlement Letter',
    category: 'exit',
    purpose: 'States what was settled and when.',
    suggestedFor: ['exited', 'terminated', 'internship_completed'],
    inputs: [
      { name: 'settlementAmount', label: 'Settlement amount (₹)', type: 'number', required: true, pay: true },
      { name: 'settlementDate', label: 'Settled on', type: 'date', required: true },
      { name: 'settlementBreakdown', label: 'Breakdown', type: 'textarea' },
    ],
  },
  {
    code: 'no_dues',
    name: 'No Dues / Clearance Letter',
    category: 'exit',
    purpose: 'Confirms nothing is outstanding — assets, advances, dues.',
    suggestedFor: ['exited', 'internship_completed', 'terminated'],
    inputs: [
      { name: 'lastWorkingDay', label: 'Last working day', type: 'date', required: true },
      HR_COMMENTS,
    ],
  },

  // --- anything else -----------------------------------------------------
  {
    code: 'custom',
    name: 'Custom Letter',
    category: 'custom',
    purpose: 'A blank letter on the company letterhead. Write the body yourself.',
    suggestedFor: [],
    inputs: [{ name: 'subject', label: 'Subject', type: 'text', required: true }],
  },
]

export const LETTERS_BY_CODE = new Map(LETTERS.map((letter) => [letter.code, letter]))

export const CATEGORY_LABELS: Record<LetterCategory, string> = {
  internship: 'Internship',
  onboarding: 'Joining',
  employment: 'Employment',
  compensation: 'Compensation',
  disciplinary: 'Disciplinary',
  exit: 'Exit',
  custom: 'Other',
}

const isInternPerson = (status: string, employmentType?: string) => employmentType === 'intern' || status === 'intern' || status === 'internship_completed'

/** Letters worth offering first for this person. */
export function suggestedLetters(status: string, employmentType?: string): LetterDefinition[] {
  const intern = isInternPerson(status, employmentType)
  return LETTERS.filter((letter) => {
    if (letter.internsOnly && !intern) return false
    if ((letter.suggestedFor as string[]).includes(status)) return true
    return Boolean(letter.internsOnly && intern && ['internship_completion', 'internship_certificate', 'internship_experience'].includes(letter.code))
  })
}

/** Intern-only letters are hidden for everyone else. */
export const isLetterApplicable = (letter: LetterDefinition, status: string, employmentType?: string): boolean =>
  !letter.internsOnly || isInternPerson(status, employmentType)
