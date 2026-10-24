import path from 'node:path'
import { Types } from 'mongoose'
import { istInstant } from '@/lib/dates'
import { storage } from '@/lib/storage'
import type { SeedCtx } from '@/lib/seed-types'
import { StoredFile } from '@/models/StoredFile'
import { Employee } from '@/models/muster/Employee'
import { EmployeeDocument } from '@/models/muster/EmployeeDocument'
import { EmployeeRemark } from '@/models/muster/EmployeeRemark'
import { isSharedWithEmployee } from './people/remarks'
import { DEFAULT_MANDATORY_DOCUMENTS, docLabel } from './settings/defaults'

/**
 * Joining documents at different completion levels (Riya, joining on
 * 12 Oct, is below the 60% needed to start) and remarks of every type.
 * Files are one-page placeholder PDFs written through the storage driver.
 */

const ALL = [...DEFAULT_MANDATORY_DOCUMENTS]
/** Mandatory documents on file per person (by name); everyone else has all six plus a photograph. */
const PARTIAL: Record<string, string[]> = {
  'Riya Kapoor': ['Aadhaar Card', 'PAN card'],
  'Tanvi Joshi': ['Aadhaar Card', '10th Marksheet', '12th Marksheet'],
  'Siddharth Rao': ['Aadhaar Card', 'PAN card', '10th Marksheet', '12th Marksheet'],
  'Kavya Reddy': ['Aadhaar Card', 'PAN card', '10th Marksheet', '12th Marksheet', 'Bank Passbook'],
  'Karan Malhotra': ['Aadhaar Card', 'PAN card', '10th Marksheet', 'Graduation Marksheet', 'Bank Passbook'],
}

/** A valid one-page PDF that says what it stands in for. */
function placeholderPdf(text: string): Buffer {
  const safe = text.replace(/[()\\]/g, ' ')
  const stream = `BT /F1 14 Tf 72 760 Td (${safe}) Tj ET`
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let body = '%PDF-1.4\n'
  const offsets = objects.map((obj, i) => {
    const offset = body.length
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`
    return offset
  })
  const xref = body.length
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(body, 'latin1')
}

async function seedDocuments(ctx: SeedCtx, people: { _id: Types.ObjectId; fullName: string; joinDate: string }[]) {
  const hr = ctx.users.hr_admin
  let count = 0
  for (const p of people) {
    const types = PARTIAL[p.fullName] ?? [...ALL, 'Photograph']
    for (const docType of types) {
      const id = new Types.ObjectId()
      const name = `${docType.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${p.fullName.toLowerCase().replace(/\s+/g, '-')}.pdf`
      const relative = path.posix.join(String(ctx.orgId), 'seed', `${id}-${name}`)
      const data = placeholderPdf(`${docLabel(docType)} - ${p.fullName} (sample file)`)
      await storage().put(relative, data, 'application/pdf')
      const at = istInstant(p.joinDate < '2026-09-01' ? p.joinDate : '2026-09-28', '11:30')
      await ctx.db(StoredFile).create({ _id: id, name, mime: 'application/pdf', size: data.length, path: relative, kind: 'employee_document', entity: 'Employee', entityId: String(p._id), uploadedBy: hr._id })
      await ctx.db(EmployeeDocument).create({ employeeId: p._id, docType, fileId: id, fileName: name, mimeType: 'application/pdf', sizeBytes: data.length, uploadedBy: hr._id, uploadedByName: hr.name, createdAt: at, updatedAt: at })
      count += 1
    }
  }
  return count
}

type RemarkPlan = { who: string; kind: 'performance' | 'concern' | 'one_on_one' | 'general'; on: string; by: 'hr_admin' | 'manager' | 'admin'; body: string }

const REMARKS: RemarkPlan[] = [
  { who: 'Vikram Joshi', kind: 'one_on_one', on: '2026-09-25', by: 'manager', body: 'Talked through the dashboard rebuild. Vikram wants more ownership of the component library; agreed he leads it from October. Next check-in in two weeks.' },
  { who: 'Vikram Joshi', kind: 'general', on: '2026-10-01', by: 'hr_admin', body: 'Completed the POSH awareness session. Certificate filed with HR.' },
  { who: 'Karan Malhotra', kind: 'concern', on: '2026-09-23', by: 'admin', body: 'Missed two client calls in a week without telling the account lead. Spoke to him; he says it was a calendar sync issue. Watching for a repeat.' },
  { who: 'Sneha Banerjee', kind: 'performance', on: '2026-09-30', by: 'hr_admin', body: 'Festive campaign creatives went out two days early and the client approved them without revisions. Strong candidate for the October spot award.' },
  { who: 'Siddharth Rao', kind: 'one_on_one', on: '2026-09-29', by: 'manager', body: 'Six weeks in. Settling well into the QA process; wants to learn Playwright. Pairing him with Ishaan on the regression suite.' },
  { who: 'Harsh Vardhan', kind: 'general', on: '2026-09-18', by: 'hr_admin', body: 'Represented the team at the Nimbus Fintech onsite; client sent a thank-you note.' },
  { who: 'Rahul Chauhan', kind: 'performance', on: '2026-09-22', by: 'manager', body: 'Handover plan agreed before his last day on 20 Oct: payments module docs and two knowledge-transfer sessions with Harsh.' },
]

async function seedRemarks(ctx: SeedCtx, people: { _id: Types.ObjectId; fullName: string }[]) {
  const rows = REMARKS.flatMap((r) => {
    const p = people.find((x) => x.fullName === r.who)
    if (!p) return []
    const author = ctx.users[r.by]
    const at = istInstant(r.on, '17:00')
    return [{ employeeId: p._id, kind: r.kind, occurredOn: r.on, body: r.body, authorId: author._id, authorName: author.name, visibleToEmployee: isSharedWithEmployee(r.kind), createdAt: at, updatedAt: at }]
  })
  if (rows.length) await ctx.db(EmployeeRemark).insertMany(rows)
  return rows.length
}

export async function seedOnboarding(ctx: SeedCtx): Promise<void> {
  const people = await ctx.db(Employee).find({ deletedAt: null }, { fullName: 1, joinDate: 1 }).lean()
  const documents = await seedDocuments(ctx, people)
  const remarks = await seedRemarks(ctx, people)
  ctx.log(`muster: ${documents} joining documents (Riya Kapoor below 60%), ${remarks} remarks`)
}
