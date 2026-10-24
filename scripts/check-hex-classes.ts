/**
 * CI guard for arbitrary `[#hex]` Tailwind classes (R2 11.1). Fails when the
 * count rises above HEX_CLASS_BASELINE in src/lib/hex-classes.ts.
 * Run: npx tsx scripts/check-hex-classes.ts
 */
import { compareWithBaseline, worstFiles } from '../src/lib/hex-classes'
import { scanHexClasses } from './lib/hex-scan'

const log = (line: string) => process.stdout.write(`${line}\n`)

function main(): number {
  const hits = scanHexClasses(process.cwd())
  const result = compareWithBaseline(hits.length)
  log(`[check-hex-classes] ${result.message}`)
  if (!result.ok) {
    for (const { file, count } of worstFiles(hits)) log(`  ${count}\t${file}`)
    return 1
  }
  return 0
}

process.exit(main())
