import { pdfResponse } from '@/lib/pdf/base'
import { resolveDocLink } from '@/modules/doclinks/links'
import { renderPublicPdf } from '@/modules/doclinks/pdf'

export const runtime = 'nodejs'
export const maxDuration = 300

const NOT_FOUND = () => new Response('This link is not available.', { status: 404, headers: { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } })

/** The PDF behind a public document link: same token rules as the page (revoked, expired and unknown all answer 404). */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const resolved = await resolveDocLink(token)
  if (resolved.state !== 'active') return NOT_FOUND()
  try {
    const pdf = await renderPublicPdf(resolved.link)
    if (!pdf) return NOT_FOUND()
    const response = pdfResponse(pdf.buffer, pdf.filename)
    response.headers.set('cache-control', 'private, no-store')
    response.headers.set('x-robots-tag', 'noindex')
    return response
  } catch (error) {
    console.error('[doclinks] public PDF failed', resolved.link.kind, String(resolved.link._id), error)
    return new Response('The PDF could not be generated. Try again in a moment.', { status: 500 })
  }
}
