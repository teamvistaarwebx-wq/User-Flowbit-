/** Shape of a legal page's content; rendered by components/marketing/legal-doc. */
export type LegalContent = {
  title: string
  updated: string
  intro: string
  sections: { id: string; heading: string; paragraphs?: string[]; list?: string[] }[]
}

/** Company details the legal text quotes (from lib/env flowbitSupplier). */
export type LegalContext = { legalName: string; supportEmail: string }
