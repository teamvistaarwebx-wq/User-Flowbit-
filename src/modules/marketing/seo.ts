import type { Metadata } from 'next'

/**
 * Per-page metadata for the public site: title, description, canonical URL,
 * Open Graph and Twitter. Nested objects replace the layout's, so every page
 * sets the full Open Graph block here. Images come from opengraph-image files.
 */
export function pageMetadata({ title, description, path, absoluteTitle }: { title: string; description: string; path: string; absoluteTitle?: boolean }): Metadata {
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical: path },
    openGraph: { type: 'website', siteName: 'Flowbit', locale: 'en_IN', title, description, url: path },
    twitter: { card: 'summary_large_image', title, description },
  }
}
