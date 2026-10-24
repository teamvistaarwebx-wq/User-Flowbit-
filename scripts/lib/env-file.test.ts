import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadScriptTarget, parseScriptTarget } from './env-file'

const ROOT = path.resolve(__dirname, '..', '..')
const DATA_SCRIPTS = ['migrate-staff', 'migrate-account-types', 'migrate-post-types', 'migrate-storage', 'folio-long-series']
const SPAWN_TIMEOUT_MS = 60_000

describe('data script target', () => {
  const saved = { MONGODB_URI: process.env.MONGODB_URI, MONGODB_DB: process.env.MONGODB_DB }
  afterEach(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  it('refuses to run without --env-file or --db, and never mentions a silent fallback', () => {
    expect(() => parseScriptTarget('migrate-post-types', [])).toThrow(/needs an explicit target and will not fall back to \.env\.local/)
    expect(() => parseScriptTarget('migrate-post-types', ['--apply'])).toThrow(/--env-file=\.env\.setup\.local/)
    expect(() => parseScriptTarget('migrate-post-types', ['--env-file='])).toThrow(/explicit target/)
  })

  it('accepts --env-file or --db, in either argument form', () => {
    expect(parseScriptTarget('x', ['--env-file=.env.setup.local', '--apply'])).toEqual({ envFile: '.env.setup.local', db: null })
    expect(parseScriptTarget('x', ['--env-file', '.env.setup.local'])).toEqual({ envFile: '.env.setup.local', db: null })
    expect(parseScriptTarget('x', ['--db=flowbit'])).toEqual({ envFile: null, db: 'flowbit' })
    expect(parseScriptTarget('x', ['--env-file=a.env', '--db', 'flowbit_v2dev'])).toEqual({ envFile: 'a.env', db: 'flowbit_v2dev' })
  })

  it('refuses a --db value that is not a database name', () => {
    expect(() => parseScriptTarget('x', ['--db=flow bit'])).toThrow(/not a database name/)
    expect(() => parseScriptTarget('x', ['--db=a/b'])).toThrow(/not a database name/)
  })

  it('refuses an --env-file that does not exist', () => {
    expect(() => loadScriptTarget('x', ['--env-file=.env.does-not-exist'])).toThrow(/does not exist/)
  })

  it('with --db and a shell connection string, targets that database and reads no file', () => {
    process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/?replicaSet=rs0'
    process.env.MONGODB_DB = 'flowbit'
    expect(loadScriptTarget('x', ['--db=flowbit_scratch'])).toBe('Env: shell; database flowbit_scratch')
    expect(process.env.MONGODB_DB).toBe('flowbit_scratch')
  })

  it('every data script exits with the refusal before touching a database', () => {
    for (const script of DATA_SCRIPTS) {
      const run = spawnSync(process.execPath, ['--import', 'tsx', path.join(ROOT, 'scripts', `${script}.ts`), '--apply'], {
        cwd: ROOT,
        encoding: 'utf8',
        timeout: SPAWN_TIMEOUT_MS,
        env: { NODE_ENV: 'test', PATH: process.env.PATH ?? '', MONGODB_URI: 'mongodb://203.0.113.1:1/?serverSelectionTimeoutMS=1' },
      })
      expect(run.status, script).toBe(1)
      expect(run.stderr + run.stdout, script).toMatch(/needs an explicit target and will not fall back to \.env\.local/)
    }
  }, DATA_SCRIPTS.length * SPAWN_TIMEOUT_MS)
})
