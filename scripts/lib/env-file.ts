import { existsSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(__dirname, '..', '..')

const DB_NAME = /^[A-Za-z0-9_-]{1,63}$/

/** The value of `--name=value` or `--name value` on the command line. */
export function argValue(name: string, args: readonly string[] = process.argv.slice(2)): string | undefined {
  const inline = args.find((a) => a.startsWith(`--${name}=`))
  if (inline) return inline.slice(name.length + 3)
  const at = args.indexOf(`--${name}`)
  return at >= 0 ? args[at + 1] : undefined
}

export const hasFlag = (name: string, args: readonly string[] = process.argv.slice(2)) => args.includes(`--${name}`)

/** Where a data script must run: an env file, a database name, or both. */
export type ScriptTarget = { envFile: string | null; db: string | null }

/**
 * Data scripts (migrate-*, storage:migrate, folio-long-series) never pick a
 * database on their own: forgetting `--env-file` used to run them against
 * the laptop's .env.local. Pure: reads the arguments, throws a usage message
 * when neither `--env-file=<path>` nor `--db=<name>` is given.
 */
export function parseScriptTarget(script: string, args: readonly string[]): ScriptTarget {
  const envFile = argValue('env-file', args)?.trim() || null
  const db = argValue('db', args)?.trim() || null
  if (db && !DB_NAME.test(db)) throw new Error(`--db "${db}" is not a database name (letters, digits, _ and - only).`)
  if (!envFile && !db) {
    throw new Error(
      `${script} needs an explicit target and will not fall back to .env.local.\n` +
        `  Production: --env-file=.env.setup.local (MONGODB_URI and MONGODB_DB of the database to change)\n` +
        `  This machine: --db=<database name> (connection string from the shell, else .env.local)`,
    )
  }
  return { envFile, db }
}

/**
 * Loads the target from parseScriptTarget into process.env and returns a
 * one-line description to print before any read or write. `--env-file`
 * loads only that file; `--db` alone takes MONGODB_URI from the shell, else
 * from .env.local (said out loud), and always sets MONGODB_DB to the name.
 */
export function loadScriptTarget(script: string, args: readonly string[] = process.argv.slice(2)): string {
  const target = parseScriptTarget(script, args)
  let source = 'shell'
  if (target.envFile) {
    const file = path.resolve(process.cwd(), target.envFile)
    if (!existsSync(file)) throw new Error(`--env-file ${target.envFile} does not exist.`)
    process.loadEnvFile(file)
    source = target.envFile
  } else if (!process.env.MONGODB_URI) {
    const local = path.join(ROOT, '.env.local')
    if (!existsSync(local)) throw new Error('--db needs MONGODB_URI in the shell (or a .env.local), or pass --env-file.')
    process.loadEnvFile(local)
    source = '.env.local (connection string only, chosen by --db)'
  }
  if (target.db) process.env.MONGODB_DB = target.db
  return `Env: ${source}; database ${process.env.MONGODB_DB || 'flowbit'}`
}

/**
 * Loads `--env-file=<path>` when given, else `fallback` (relative to the
 * project) when it exists. Variables already set in the shell win.
 * Returns the file that was loaded, or null.
 */
export function loadEnv(fallback: string | null): string | null {
  const given = argValue('env-file')
  const file = given ? path.resolve(process.cwd(), given) : fallback ? path.join(ROOT, fallback) : null
  if (given && !existsSync(file!)) throw new Error(`--env-file ${given} does not exist.`)
  if (!file || !existsSync(file)) return null
  process.loadEnvFile(file)
  return file
}

/** "mongodb+srv://cluster0.abcd.mongodb.net" (no user or password), for confirmations. */
export function describeMongo(uri: string): string {
  try {
    const url = new URL(uri)
    return `${url.protocol}//${url.host}`
  } catch {
    return '(unreadable MONGODB_URI)'
  }
}
