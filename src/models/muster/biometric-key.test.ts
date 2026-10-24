import { describe, expect, it } from 'vitest'
import { biometricKeyOf, withBiometricKey } from './biometric-key'

describe('biometricKeyOf', () => {
  it('normalises leading zeros and case, and is null without an id', () => {
    // Arrange, Act, Assert
    expect(biometricKeyOf('0007')).toBe('7')
    expect(biometricKeyOf(' AB-1 ')).toBe('ab-1')
    expect(biometricKeyOf('')).toBeNull()
    expect(biometricKeyOf(null)).toBeNull()
  })
})

describe('withBiometricKey', () => {
  it('adds the key beside a biometricId in $set without changing the input', () => {
    // Arrange
    const update = { $set: { biometricId: '0042', fullName: 'Ravi' } }

    // Act
    const result = withBiometricKey(update)

    // Assert
    expect(result).toEqual({ $set: { biometricId: '0042', fullName: 'Ravi', biometricKey: '42' } })
    expect(update).toEqual({ $set: { biometricId: '0042', fullName: 'Ravi' } })
  })

  it('unsets the key when the id is cleared or unset', () => {
    // Arrange, Act
    const cleared = withBiometricKey({ $set: { biometricId: null } })
    const unset = withBiometricKey({ $unset: { biometricId: 1 } })

    // Assert
    expect(cleared).toEqual({ $set: { biometricId: null }, $unset: { biometricKey: 1 } })
    expect(unset).toEqual({ $unset: { biometricId: 1, biometricKey: 1 } })
  })

  it('leaves updates that do not touch biometricId alone', () => {
    // Arrange
    const update = { $set: { memberId: 'm1' } }

    // Act, Assert
    expect(withBiometricKey(update)).toBe(update)
  })
})
