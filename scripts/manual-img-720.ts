/**
 * 720 px wide copies of the manual screenshots, for phones (srcset in
 * src/modules/manual/parse.ts). Run after adding or replacing a screenshot:
 *   npx tsx scripts/manual-img-720.ts
 * Writes public/manual-img/720/<file>.jpg for every public/manual-img/<file>.jpg
 * that is missing or older than its source.
 */
import { mkdirSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const SOURCE_DIR = path.join(process.cwd(), 'public', 'manual-img')
const SMALL_WIDTH = 720
const OUT_DIR = path.join(SOURCE_DIR, String(SMALL_WIDTH))
const JPEG_QUALITY = 74

const isStale = (source: string, target: string): boolean => {
  try {
    return statSync(target).mtimeMs < statSync(source).mtimeMs
  } catch {
    return true
  }
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true })
  const files = readdirSync(SOURCE_DIR).filter((f) => f.endsWith('.jpg'))
  let written = 0
  for (const file of files) {
    const source = path.join(SOURCE_DIR, file)
    const target = path.join(OUT_DIR, file)
    if (!isStale(source, target)) continue
    await sharp(source).resize({ width: SMALL_WIDTH, withoutEnlargement: true }).jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toFile(target)
    written += 1
  }
  process.stdout.write(`${written} of ${files.length} screenshots resized to ${SMALL_WIDTH} px\n`)
}

main().catch((error: unknown) => {
  console.error('[manual-img-720] failed', error)
  process.exit(1)
})
