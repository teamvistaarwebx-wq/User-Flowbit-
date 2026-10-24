import { describe, expect, it } from 'vitest'
import { isValidVpa, qrMatrix, qrPath, upiAmount, upiIntent } from './upi'

describe('UPI intent', () => {
  it('builds the NPCI link with amount, payee and invoice number', () => {
    const link = upiIntent({ vpa: 'Vistaar@HDFCBank', payee: 'Vistaar Webx', amountPaise: 118000, note: 'VWX/2026-27/0007' })
    expect(link).toBe('upi://pay?pa=vistaar%40hdfcbank&pn=Vistaar%20Webx&am=1180.00&cu=INR&tn=VWX%2F2026-27%2F0007')
  })

  it('leaves the amount out when there is none, so the payer types it', () => {
    expect(upiIntent({ vpa: 'shop@upi', payee: 'Shop' })).toBe('upi://pay?pa=shop%40upi&pn=Shop&cu=INR')
    expect(upiIntent({ vpa: 'shop@upi', payee: 'Shop', amountPaise: 0 })).not.toContain('am=')
  })

  it('refuses an invalid UPI ID', () => {
    expect(upiIntent({ vpa: 'not-a-vpa', payee: 'X' })).toBeNull()
    expect(upiIntent({ vpa: '@upi', payee: 'X' })).toBeNull()
    expect(isValidVpa('name.surname-1@okicici')).toBe(true)
    expect(isValidVpa('a b@upi')).toBe(false)
  })

  it('strips characters UPI apps reject from the name and note', () => {
    const link = upiIntent({ vpa: 'a1@upi', payee: 'A&B <Traders>', note: 'Inv #12?' }) ?? ''
    expect(decodeURIComponent(link)).toContain('pn=A&B Traders')
    expect(decodeURIComponent(link)).toContain('tn=Inv 12')
  })

  it('formats rupees with two decimals', () => {
    expect(upiAmount(5)).toBe('0.05')
    expect(upiAmount(1234567)).toBe('12345.67')
  })

  it('encodes a square QR and an SVG path of its dark modules', () => {
    const matrix = qrMatrix('upi://pay?pa=shop%40upi&pn=Shop&cu=INR')
    expect(matrix.length).toBeGreaterThanOrEqual(21)
    expect(matrix.every((row) => row.length === matrix.length)).toBe(true)
    const path = qrPath(matrix)
    expect(path.startsWith('M0 0h1v1h-1z')).toBe(true)
  })
})
