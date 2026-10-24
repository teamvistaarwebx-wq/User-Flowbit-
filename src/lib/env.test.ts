import { describe, expect, it } from 'vitest'
import { randomBytes } from 'node:crypto'
import { appUrlIssue, isLocalMongoUri, isLocalUrl, isStrongSecret, resolveAppUrl, simulatedPaymentsAllowed } from './env'

describe('APP_URL checks', () => {
  it('recognises loopback URLs', () => {
    expect(isLocalUrl('http://127.0.0.1:4100')).toBe(true)
    expect(isLocalUrl('http://localhost:3000/x')).toBe(true)
    expect(isLocalUrl('http://app.localhost')).toBe(true)
    expect(isLocalUrl('https://app.flowbit.in')).toBe(false)
    expect(isLocalUrl('not a url')).toBe(false)
  })

  it('warns only in production, for missing, local or plain-http URLs', () => {
    expect(appUrlIssue(undefined, 'development')).toBeNull()
    expect(appUrlIssue(undefined, 'production')).toContain('not set')
    expect(appUrlIssue('http://localhost:4100', 'production')).toContain('local address')
    expect(appUrlIssue('http://app.flowbit.in', 'production')).toContain('not https')
    expect(appUrlIssue('https://app.flowbit.in', 'production')).toBeNull()
  })
})

describe('simulated payments', () => {
  it('are allowed only in local development', () => {
    expect(simulatedPaymentsAllowed({ NODE_ENV: 'development', APP_URL: 'http://127.0.0.1:4100' })).toBe(true)
    expect(simulatedPaymentsAllowed({ NODE_ENV: 'development' })).toBe(true)
    expect(simulatedPaymentsAllowed({ NODE_ENV: 'production', APP_URL: 'http://127.0.0.1:4100' })).toBe(false)
    expect(simulatedPaymentsAllowed({ NODE_ENV: 'development', VERCEL: '1', APP_URL: 'http://localhost:3000' })).toBe(false)
    expect(simulatedPaymentsAllowed({ NODE_ENV: 'development', APP_URL: 'https://app.flowbit.in' })).toBe(false)
  })
})

describe('local MongoDB URIs', () => {
  it('recognises this machine only', () => {
    expect(isLocalMongoUri('mongodb://127.0.0.1:27017/?replicaSet=rs0')).toBe(true)
    expect(isLocalMongoUri('mongodb://user:pw@localhost:27017,127.0.0.1:27018/flowbit')).toBe(true)
    expect(isLocalMongoUri('mongodb+srv://u:p@cluster0.abcd.mongodb.net/?retryWrites=true')).toBe(false)
    expect(isLocalMongoUri('mongodb://db.example.com:27017')).toBe(false)
  })
})

describe('APP_SECRET strength', () => {
  it('accepts every random hex or base64 secret, and refuses placeholders and patterns', () => {
    for (let i = 0; i < 500; i++) {
      expect(isStrongSecret(randomBytes(32).toString('hex'))).toBe(true)
      expect(isStrongSecret(randomBytes(48).toString('base64'))).toBe(true)
    }
    expect(isStrongSecret('change-me-to-a-long-random-string-of-48-chars')).toBe(false)
    expect(isStrongSecret('abcabcabcabcabcabcabcabcabcabcabcabc')).toBe(false)
    expect(isStrongSecret(randomBytes(8).toString('hex'))).toBe(false)
  })
})

describe('APP_URL on Vercel', () => {
  it('falls back to the production address only on Vercel and only when APP_URL is unset', () => {
    expect(resolveAppUrl({ APP_URL: 'https://app.flowbit.in', VERCEL: '1', VERCEL_PROJECT_PRODUCTION_URL: 'flowbit.vercel.app' })).toBe('https://app.flowbit.in')
    expect(resolveAppUrl({ VERCEL: '1', VERCEL_PROJECT_PRODUCTION_URL: 'flowbit.vercel.app' })).toBe('https://flowbit.vercel.app')
    expect(resolveAppUrl({ APP_URL: ' ', VERCEL: '1', VERCEL_PROJECT_PRODUCTION_URL: 'flowbit.vercel.app' })).toBe('https://flowbit.vercel.app')
    expect(resolveAppUrl({ VERCEL_PROJECT_PRODUCTION_URL: 'flowbit.vercel.app' })).toBe('')
    expect(resolveAppUrl({ VERCEL: '1' })).toBe('')
  })
})
