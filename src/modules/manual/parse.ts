/**
 * Reading the manual's HTML fragments: topics for the contents and search,
 * and the links and image paths rewritten for the website. Pure. The HTML
 * comes from content/manual in this repo (trusted, reviewed text), never
 * from users.
 */

export type ManualTopic = Readonly<{ id: string; title: string; text: string }>

const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' }

/** Plain text from an HTML fragment: tags dropped, entities decoded, spaces collapsed. */
export function toPlainText(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m] ?? m)
    .replace(/\s+/g, ' ')
    .trim()
}

/** Every `<article class="topic" id="…">` with its `<h3>` title and plain text. */
export function parseTopics(html: string): ManualTopic[] {
  const out: ManualTopic[] = []
  for (const m of html.matchAll(/<article class="topic" id="([a-z0-9-]+)">([\s\S]*?)<\/article>/g)) {
    const title = toPlainText(/<h3>([\s\S]*?)<\/h3>/.exec(m[2])?.[1] ?? m[1])
    out.push({ id: m[1], title, text: toPlainText(m[2].replace(/<h3>[\s\S]*?<\/h3>/, '')) })
  }
  return out
}

export const IMAGE_BASE = '/manual-img/'
/** Phone-sized copies (scripts/manual-img-720.ts) beside the 1440 px originals. */
export const SMALL_IMAGE_BASE = '/manual-img/720/'
const IMAGE_SIZES = '(max-width: 768px) 100vw, 900px'

const imageAttrs = (file: string): string =>
  `src="${IMAGE_BASE}${file}" srcset="${SMALL_IMAGE_BASE}${file} 720w, ${IMAGE_BASE}${file} 1440w" sizes="${IMAGE_SIZES}"`

/**
 * Screenshots point at /manual-img/ with a 720 px srcset for phones, and `#topic` links that live in another
 * chapter point at that chapter's page.
 */
export function rewriteHtml(html: string, ownSlug: string, chapterOfTopic: ReadonlyMap<string, string>): string {
  return html
    .replace(/src="shots\/([a-z0-9-]+\.jpg)"/g, (_m, file: string) => imageAttrs(file))
    .replace(/href="#([a-z0-9-]+)"/g, (m, id: string) => {
      const slug = chapterOfTopic.get(id)
      return slug && slug !== ownSlug ? `href="/manual/${slug}#${id}"` : m
    })
}

/** Search: every word of the query must appear in the title or the text. Title hits rank first. */
export function searchTopics<T extends { title: string; text: string }>(items: readonly T[], query: string, limit = 20): T[] {
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 1)
  if (!words.length) return []
  const scored = items.flatMap((item) => {
    const title = item.title.toLowerCase()
    const text = item.text.toLowerCase()
    if (!words.every((w) => title.includes(w) || text.includes(w))) return []
    return [{ item, score: words.filter((w) => title.includes(w)).length }]
  })
  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map((s) => s.item)
}

/** A short excerpt around the first matching word. */
export function excerpt(text: string, query: string, size = 160): string {
  const word = query.toLowerCase().split(/\s+/).find((w) => w.length > 1 && text.toLowerCase().includes(w))
  const at = word ? text.toLowerCase().indexOf(word) : 0
  const start = Math.max(0, at - Math.floor(size / 3))
  const piece = text.slice(start, start + size).trim()
  return `${start > 0 ? '…' : ''}${piece}${start + size < text.length ? '…' : ''}`
}
