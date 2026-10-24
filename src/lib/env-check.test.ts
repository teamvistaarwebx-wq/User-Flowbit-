import { describe, expect, it } from 'vitest'
import { randomBytes } from 'node:crypto'
import { assertProductionEnv, estimatedBits, isDeployed, productionEnvProblems, productionEnvWarnings } from './env-check'

const GOOD = {
  NODE_ENV: 'production',
  VERCEL: '1',
  MONGODB_URI: 'mongodb+srv://flowbit:pw@cluster0.abcd.mongodb.net/?retryWrites=true&w=majority',
  APP_SECRET: 'Q2x5v8Rk1Zp0Lm4Nc7Bt9Ys3Wd6Fh2Jg5Ke8Ua1Ix4Oq7Ev0Ri3Tn6Yb9Hc2Mz5Pl8S',
  APP_URL: 'https://app.flowbit.in',
  STORAGE_DRIVER: 's3',
  S3_ENDPOINT: 'https://acc.r2.cloudflarestorage.com',
  S3_REGION: 'auto',
  S3_BUCKET: 'flowbit-files',
  S3_ACCESS_KEY_ID: 'key',
  S3_SECRET_ACCESS_KEY: 'secret',
  CRON_SECRET: 'f3b1c2d4e5f60718293a4b5c6d7e8f90',
  RESEND_API_KEY: 're_test_key',
  RESEND_WEBHOOK_SECRET: 'whsec_dGVzdA==',
  MAIL_FROM: 'Flowbit <no-reply@mail.vistaar.in>',
  APP_ENCRYPTION_KEY: 'q7n0Jv1wq1N8m1n5T3f4Zb2s9X6c8V0a1B2c3D4e5F0=',
}

describe('production env check', () => {
  it('treats Vercel and public production URLs as deployed, but not npm run start on this machine', () => {
    expect(isDeployed(GOOD)).toBe(true)
    expect(isDeployed({ NODE_ENV: 'production', APP_URL: 'https://app.flowbit.in' })).toBe(true)
    expect(isDeployed({ NODE_ENV: 'production', APP_URL: 'http://127.0.0.1:4100' })).toBe(false)
    expect(isDeployed({ NODE_ENV: 'development', VERCEL: '1' })).toBe(false)
  })

  it('passes a complete Vercel environment', () => {
    expect(productionEnvProblems(GOOD)).toEqual([])
    expect(() => assertProductionEnv(GOOD)).not.toThrow()
  })

  it('names every missing or unsafe variable', () => {
    const problems = productionEnvProblems({ NODE_ENV: 'production', VERCEL: '1', MONGODB_URI: 'mongodb://127.0.0.1:27017/?replicaSet=rs0', APP_SECRET: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', APP_URL: 'http://app.flowbit.in' })
    expect(problems.join('\n')).toMatch(/MONGODB_URI points at this machine/)
    expect(problems.join('\n')).toMatch(/APP_SECRET is missing or too weak/)
    expect(problems.join('\n')).toMatch(/must start with https/)
    expect(problems.join('\n')).toMatch(/STORAGE_DRIVER must be s3 on Vercel/)
    expect(problems.join('\n')).toMatch(/CRON_SECRET/)
  })

  it('requires the S3 variables with STORAGE_DRIVER=s3', () => {
    expect(productionEnvProblems({ ...GOOD, S3_BUCKET: '', S3_SECRET_ACCESS_KEY: '' })).toEqual(['STORAGE_DRIVER=s3 needs S3_BUCKET, S3_SECRET_ACCESS_KEY.'])
  })

  it('refuses a local APP_URL on Vercel', () => {
    expect(productionEnvProblems({ ...GOOD, APP_URL: 'http://localhost:3000' })[0]).toMatch(/local address/)
    expect(() => assertProductionEnv({ ...GOOD, APP_URL: '' })).toThrow(/Flowbit cannot start[\s\S]*APP_URL is not set/)
  })

  it('estimates entropy: a random base64 secret passes, a repeated pattern does not', () => {
    expect(estimatedBits(GOOD.APP_SECRET)).toBeGreaterThan(128)
    expect(estimatedBits('abcabcabcabcabcabcabcabcabcabcabcabc')).toBeLessThan(128)
  })

  it('accepts a hex APP_SECRET, the same rule serverEnv() applies', () => {
    for (let i = 0; i < 200; i++) expect(productionEnvProblems({ ...GOOD, APP_SECRET: randomBytes(32).toString('hex') })).toEqual([])
  })

  it('uses the Vercel production address when APP_URL is unset, so the first deploy works', () => {
    expect(productionEnvProblems({ ...GOOD, APP_URL: '', VERCEL_PROJECT_PRODUCTION_URL: 'flowbit-abc.vercel.app' })).toEqual([])
  })

  it('requires S3_ENDPOINT for R2 (S3_REGION=auto)', () => {
    expect(productionEnvProblems({ ...GOOD, S3_ENDPOINT: '' })).toEqual([expect.stringMatching(/S3_REGION=auto .* needs S3_ENDPOINT/)])
    expect(productionEnvProblems({ ...GOOD, S3_ENDPOINT: '', S3_REGION: 'ap-south-1' })).toEqual([])
  })

  it('refuses an upload cap above what Vercel accepts, and allows it unset', () => {
    expect(productionEnvProblems({ ...GOOD, MAX_UPLOAD_MB: '10' })[0]).toMatch(/MAX_UPLOAD_MB is 10/)
    expect(productionEnvProblems({ ...GOOD, MAX_UPLOAD_MB: '4' })).toEqual([])
    expect(productionEnvProblems({ ...GOOD, MAX_UPLOAD_MB: undefined })).toEqual([])
  })

  it('warns when email cannot go out', () => {
    expect(productionEnvWarnings(GOOD)).toEqual([])
    const warnings = productionEnvWarnings({ ...GOOD, RESEND_API_KEY: '', MAIL_FROM: undefined }).join('\n')
    expect(warnings).toMatch(/RESEND_API_KEY is not set/)
    expect(warnings).toMatch(/MAIL_FROM is not set to your own verified domain/)
    expect(productionEnvWarnings({ ...GOOD, MAIL_FROM: 'Flowbit <no-reply@useflowbit.com>' })).toHaveLength(1)
    expect(productionEnvWarnings({ ...GOOD, RESEND_WEBHOOK_SECRET: '' }).join('\n')).toMatch(/RESEND_WEBHOOK_SECRET is not set/)
  })

  it('warns when MAIL_FROM is still the env.ts default domain (useflowbit.com), not the retired flowbit.app', () => {
    expect(productionEnvWarnings({ ...GOOD, MAIL_FROM: 'Flowbit <no-reply@useflowbit.com>' })).toEqual([expect.stringMatching(/MAIL_FROM is not set to your own verified domain/)])
    expect(productionEnvWarnings({ ...GOOD, MAIL_FROM: 'Flowbit <no-reply@mail.vistaar.in>' })).toEqual([])
  })

  it('refuses to start without APP_ENCRYPTION_KEY, like the other required variables', () => {
    expect(productionEnvProblems({ ...GOOD, APP_ENCRYPTION_KEY: '' })).toEqual([expect.stringMatching(/APP_ENCRYPTION_KEY is not set/)])
    expect(productionEnvProblems({ ...GOOD, APP_ENCRYPTION_KEY: undefined })).toEqual([expect.stringMatching(/APP_ENCRYPTION_KEY is not set/)])
    expect(() => assertProductionEnv({ ...GOOD, APP_ENCRYPTION_KEY: '' })).toThrow(/Flowbit cannot start[\s\S]*APP_ENCRYPTION_KEY/)
    expect(productionEnvWarnings({ ...GOOD, APP_ENCRYPTION_KEY: '' }).join('\n')).not.toMatch(/APP_ENCRYPTION_KEY/)
  })

  it('refuses an APP_ENCRYPTION_KEY that is not 32 bytes, and accepts base64 or hex', () => {
    expect(productionEnvProblems({ ...GOOD, APP_ENCRYPTION_KEY: 'too-short' })).toEqual([expect.stringMatching(/not a 32-byte key/)])
    expect(productionEnvProblems({ ...GOOD, APP_ENCRYPTION_KEY: randomBytes(32).toString('base64') })).toEqual([])
    expect(productionEnvProblems({ ...GOOD, APP_ENCRYPTION_KEY: randomBytes(32).toString('hex') })).toEqual([])
  })

  it('does not require APP_ENCRYPTION_KEY for npm run start on this machine', () => {
    expect(() => assertProductionEnv({ NODE_ENV: 'production', APP_URL: 'http://127.0.0.1:4100' })).not.toThrow()
  })
})
