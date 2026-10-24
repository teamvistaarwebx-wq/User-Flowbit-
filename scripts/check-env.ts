/**
 * Runs before `next build` (package.json "build"). On a Vercel production
 * build it fails the build when the environment would stop Flowbit from
 * starting, so the previous deployment keeps serving instead of a broken one
 * going live. Preview builds only warn. Elsewhere (this laptop, a plain
 * server) it does nothing: `next start` checks the environment itself
 * (src/instrumentation.ts) and .env files are not loaded here.
 */
import { productionEnvProblems, productionEnvWarnings } from '../src/lib/env-check'

const log = (line: string) => process.stdout.write(`${line}\n`)

function main(): number {
  if (process.env.VERCEL !== '1') {
    log('[check-env] Not a Vercel build; the server checks its environment when it starts.')
    return 0
  }
  const isProduction = process.env.VERCEL_ENV === 'production'
  const problems = productionEnvProblems(process.env)
  for (const warning of productionEnvWarnings(process.env)) log(`[check-env] Warning: ${warning}`)
  if (!problems.length) {
    log('[check-env] Environment variables look right.')
    return 0
  }
  const list = problems.map((p) => `  - ${p}`).join('\n')
  if (!isProduction) {
    log(`[check-env] This ${process.env.VERCEL_ENV ?? 'preview'} deployment will refuse to start until these are fixed:\n${list}`)
    return 0
  }
  console.error(`[check-env] Build stopped: fix these environment variables (Vercel → Settings → Environment Variables), then redeploy. The current production deployment keeps running.\n${list}`)
  return 1
}

process.exit(main())
