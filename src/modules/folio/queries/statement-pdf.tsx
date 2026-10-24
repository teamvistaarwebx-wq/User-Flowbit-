import 'server-only'
import { defaultSignatoryOf } from '@/lib/company-profile'
import { renderPdf, type PdfOrg, type PdfSignature } from '@/lib/pdf/base'
import { orgPdfCompany, pdfSignature } from '@/lib/pdf/org-branding'
import { slugify } from '@/lib/utils'
import { FolioEntity } from '@/models/folio/Entity'
import { folioIssuer } from '@/components/folio/pdf/assets'
import { StatementPdf } from '@/components/folio/pdf/StatementPdf'
import { issuerOf } from '@/modules/folio/invoices/snapshots'
import { brandLine, type FolioScope } from './common'
import { clientStatement, type ClientStatement } from './ledger'

export const statementFilename = (clientName: string, ext: 'pdf' | 'csv') => `statement-${slugify(clientName) || 'client'}.${ext}`

/** The org-scoped db: a member ctx, or the public link's scope. */
export type StatementCtx = FolioScope

type Head = { workspace: PdfOrg; issuer: PdfOrg; signature: PdfSignature }

/** The billing entity's letterhead and signatory when the client has one (blanks from the company profile), else the company's own. */
async function statementHead(ctx: StatementCtx, entityId: string | null): Promise<Head> {
  const company = await orgPdfCompany(ctx.orgId)
  const entity = entityId ? await ctx.db(FolioEntity).findById(entityId).lean() : null
  if (entity) {
    const { issuer, signature } = await folioIssuer(ctx.orgId, issuerOf(entity), { showGstin: entity.kind === 'gst', brandLine: true })
    return { workspace: company.letterhead, issuer, signature }
  }
  const signature = await pdfSignature(ctx.orgId, company.profile.legalName, defaultSignatoryOf(company.profile))
  return { workspace: company.letterhead, issuer: company.letterhead, signature }
}

/** Renders the statement PDF for one client, or null when the client is not in this org. */
export async function renderStatementPdf(ctx: StatementCtx, clientId: string, range: { from?: string | null; to?: string | null }): Promise<{ buffer: Buffer; filename: string; data: ClientStatement } | null> {
  const data = await clientStatement(ctx, clientId, range)
  if (!data) return null
  const head = await statementHead(ctx, data.issuer?.id ?? null)
  const buffer = await renderPdf(
    <StatementPdf
      workspace={head.workspace}
      issuer={head.issuer}
      signature={head.signature}
      brandLine={data.issuer ? brandLine(data.issuer) : head.workspace.name}
      client={{ name: data.client.name, legalName: data.client.legalName, addressLines: data.client.addressLines, gstin: data.client.gstin }}
      statement={data.statement}
    />,
  )
  return { buffer, filename: statementFilename(data.client.name, 'pdf'), data }
}
