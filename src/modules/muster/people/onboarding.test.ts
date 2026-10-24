import { describe, expect, it } from 'vitest'
import { DEFAULT_MANDATORY_DOCUMENTS, DEFAULT_ONBOARDING_THRESHOLD, readPolicy } from '../settings/defaults'
import { onboardingRefusal, onboardingStatus, startsWork } from './onboarding'

const rules = { mandatoryDocuments: DEFAULT_MANDATORY_DOCUMENTS, thresholdPercent: DEFAULT_ONBOARDING_THRESHOLD }

describe('onboardingStatus', () => {
  it('measures the mandatory documents on file', () => {
    const s = onboardingStatus(rules, ['Aadhaar Card', 'PAN card', 'Medical'])
    expect(s).toMatchObject({ percent: 33, done: 2, total: 6, ready: false })
    expect(s.missing).toEqual(['10th Marksheet', '12th Marksheet', 'Graduation Marksheet', 'Bank Passbook'])
  })

  it('is ready at the threshold and complete when nothing is mandatory', () => {
    expect(onboardingStatus(rules, ['Aadhaar Card', 'PAN card', '10th Marksheet', '12th Marksheet']).ready).toBe(true)
    expect(onboardingStatus({ mandatoryDocuments: [], thresholdPercent: 60 }, [])).toMatchObject({ percent: 100, ready: true })
  })
})

describe('onboardingRefusal', () => {
  const status = onboardingStatus(rules, ['Aadhaar Card'])

  it('stops a joiner below the threshold from starting work, naming what is missing', () => {
    const message = onboardingRefusal({ name: 'Riya Kapoor', from: 'joining_pending', to: 'active', status })
    expect(message).toContain('17% complete; 60% is needed')
    expect(message).toContain('Bank passbook or cancelled cheque')
    expect(onboardingRefusal({ name: 'Riya', from: null, to: 'probation', status })).not.toBeNull()
  })

  it('leaves other moves alone', () => {
    expect(onboardingRefusal({ name: 'Riya', from: 'candidate', to: 'offered', status })).toBeNull()
    expect(onboardingRefusal({ name: 'Riya', from: 'probation', to: 'confirmed', status })).toBeNull()
    expect(startsWork('internship_completed', 'active')).toBe(false)
  })
})

describe('policy onboarding defaults', () => {
  it('seeds six mandatory documents at 60%, and drops unknown types', () => {
    expect(readPolicy({}).onboarding).toEqual({ mandatoryDocuments: [...DEFAULT_MANDATORY_DOCUMENTS], thresholdPercent: 60 })
    expect(readPolicy({ onboarding: { mandatoryDocuments: ['PAN card', 'Passport'], thresholdPercent: 80 } }).onboarding).toEqual({ mandatoryDocuments: ['PAN card'], thresholdPercent: 80 })
  })
})
