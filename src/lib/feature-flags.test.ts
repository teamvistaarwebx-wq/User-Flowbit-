import { describe, expect, it } from 'vitest'
import { mergeConsoleSettings } from '@/lib/console/settings-defaults'
import { DEFAULT_PLATFORM_FEATURES, envSwitchOn, isWhatsAppOn, mergePlatformFeatures } from './feature-flags'

describe('envSwitchOn', () => {
  it('is on only for on, true, 1 or yes in any case', () => {
    expect(['on', 'TRUE', ' 1 ', 'Yes'].map(envSwitchOn)).toEqual([true, true, true, true])
  })

  it('is off when unset, blank or anything else', () => {
    expect([undefined, null, '', 'off', 'false', '0', 'enabled'].map(envSwitchOn)).toEqual([false, false, false, false, false, false, false])
  })
})

describe('mergePlatformFeatures', () => {
  it('keeps the default for missing or non-boolean values', () => {
    expect(mergePlatformFeatures(null)).toEqual(DEFAULT_PLATFORM_FEATURES)
    expect(mergePlatformFeatures({ whatsapp: 'no' })).toEqual(DEFAULT_PLATFORM_FEATURES)
  })

  it('takes a stored boolean', () => {
    expect(mergePlatformFeatures({ whatsapp: false })).toEqual({ whatsapp: false })
  })

  it('is part of the merged Console settings', () => {
    expect(mergeConsoleSettings(null).features).toEqual(DEFAULT_PLATFORM_FEATURES)
    expect(mergeConsoleSettings({ features: { whatsapp: false } }).features.whatsapp).toBe(false)
  })
})

describe('isWhatsAppOn', () => {
  it('is off by default: no env switch', () => {
    expect(isWhatsAppOn({ env: undefined, console: DEFAULT_PLATFORM_FEATURES })).toBe(false)
  })

  it('needs the env switch and the Console setting', () => {
    expect(isWhatsAppOn({ env: 'on', console: { whatsapp: true } })).toBe(true)
    expect(isWhatsAppOn({ env: 'on', console: { whatsapp: false } })).toBe(false)
    expect(isWhatsAppOn({ env: 'off', console: { whatsapp: true } })).toBe(false)
  })
})
