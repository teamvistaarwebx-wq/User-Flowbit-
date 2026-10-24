import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { CalendarDays, FileCheck, FileText, Hash, IndianRupee, Lock, Mail } from 'lucide-react'
import { requireMember } from '@/lib/ctx'
import { formatDate, formatDateTime } from '@/lib/dates'
import { StatusPill } from '@/components/ui/badge'
import { Card, CardHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { Callout } from '@/components/muster/payroll/callout'
import { Facts } from '@/components/muster/ui/facts'
import { IssuedActions } from '@/components/muster/letters/issued-actions'
import { LetterEditor } from '@/components/muster/letters/letter-editor'
import { Employee } from '@/models/muster/Employee'
import { CATEGORY_LABELS, type LetterCategory } from '@/modules/muster/letters/catalogue'
import { getLetter, inputsOf, templateWording, variablesFor } from '@/modules/muster/letters/queries'
import { defaultLetterEmail } from '@/modules/muster/letters/render'
import { CUSTOM_SIGNER } from '@/modules/muster/letters/signatory'
import { companyProfileOf } from '@/lib/company-profile'
import { mayDecideOwn, ownEmployeeId, visibleEmployeeIds } from '@/modules/muster/people/scope'

/** Server actions on this page can render PDFs, send email or process many rows. */
export const maxDuration = 300

export const metadata: Metadata = { title: 'Letter' }

export default async function LetterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requireMember({ product: 'muster', perm: 'letters.read' })
  const letter = await getLetter(ctx, id)
  const visible = await visibleEmployeeIds(ctx)
  if (!letter || (visible !== null && !visible.includes(String(letter.employeeId)))) notFound()
  if (letter.status === 'draft' && String(letter.employeeId) === ownEmployeeId(ctx) && !mayDecideOwn(ctx)) notFound()
  const back = { href: '/app/hr/letters', label: 'Letters' }
  if (letter.statesPay && !ctx.can('payroll.read')) {
    return (
      <>
        <PageHeader title="Pay letter" back={back} />
        <Card variant="solid"><EmptyState icon={<Lock />} title="This letter states pay" description="Opening it needs payroll access. Ask someone in HR or Finance with payroll access." /></Card>
      </>
    )
  }
  const employee = await ctx.db(Employee).findById(letter.employeeId, { workEmail: 1, memberId: 1 }).lean()
  const canWrite = ctx.can('letters.write')
  const editing = letter.status === 'draft' && canWrite
  const signers = companyProfileOf(ctx.org).signatories.map((s) => ({ id: s.id, name: s.name, designation: s.designation, hasSignature: Boolean(s.signatureFileId) }))
  const [wording, base] = editing
    ? await Promise.all([
        templateWording(ctx, letter.templateCode),
        variablesFor(ctx, { employeeId: String(letter.employeeId), templateCode: letter.templateCode, inputs: {}, reference: letter.referenceNumber, issueDate: letter.issueDate, signatoryName: letter.signatoryName, signatoryDesignation: letter.signatoryDesignation }),
      ])
    : [null, null]
  const drafted = defaultLetterEmail({ templateName: letter.templateName, category: letter.category, reference: letter.referenceNumber, issueDate: letter.issueDate, employeeName: letter.employeeName, orgName: ctx.org.name, signatoryName: letter.signatoryName, signatoryDesignation: letter.signatoryDesignation, hasLogin: Boolean(employee?.memberId) })
  const email = { subject: letter.emailSubject || drafted.subject, body: letter.emailBody || drafted.body }

  return (
    <>
      <PageHeader
        title={`${letter.templateName} · ${letter.employeeName}`}
        description={`${letter.referenceNumber} · ${CATEGORY_LABELS[letter.category as LetterCategory] ?? letter.category}`}
        back={back}
        actions={<><StatusPill status={letter.status} size="md" />{letter.status !== 'draft' ? <IssuedActions id={id} status={letter.status} canWrite={canWrite} to={employee?.workEmail ?? null} email={email} hasLogin={Boolean(employee?.memberId)} /> : null}</>}
      />
      {letter.status === 'revoked' ? <Callout className="mb-3" tone="danger" title={`Revoked on ${formatDateTime(letter.revokedAt)}`}>{letter.revokeReason}</Callout> : null}
      {letter.emailError && letter.status !== 'draft' ? <Callout className="mb-3" tone="warning" title="The last email did not go through">{letter.emailError}</Callout> : null}
      {editing && wording ? (
        <Card variant="solid">
          <LetterEditor
            key={String(letter.updatedAt)}
            id={id}
            templateCode={letter.templateCode}
            template={{ subject: wording.subject, body: wording.body }}
            base={base ?? {}}
            reference={letter.referenceNumber}
            wordingEdited={Boolean(letter.wordingEdited)}
            values={inputsOf(letter.inputs)}
            issueDate={letter.issueDate}
            signatoryName={letter.signatoryName}
            signatoryDesignation={letter.signatoryDesignation}
            signatoryChoice={letter.signatoryId && signers.some((s) => s.id === String(letter.signatoryId)) ? String(letter.signatoryId) : CUSTOM_SIGNER}
            signers={signers}
            subject={letter.subject}
            body={letter.body}
            name={letter.employeeName}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-12 gap-3">
          <Card variant="solid" className="col-span-12 lg:col-span-8">
            <CardHeader icon={<FileText />} title={letter.subject} />
            <div className="max-w-[68ch] space-y-3 text-sm leading-relaxed text-white/85">
              {letter.body.split(/\n\s*\n/).map((p, i) => <p key={i} className="whitespace-pre-line">{p.trim()}</p>)}
            </div>
            <p className="mt-6 text-sm text-white">{letter.signatoryName}</p>
            <p className="text-xs text-fg-2">{letter.signatoryDesignation}</p>
          </Card>
          <Card className="col-span-12 self-start rounded-[14px] lg:col-span-4">
            <CardHeader label="Record" icon={<FileText />} />
            <Facts
              items={[
                { icon: <Hash />, label: 'Reference', value: <span className="font-mono text-[13px]">{letter.referenceNumber}</span> },
                { icon: <CalendarDays />, label: 'Issue date', value: formatDate(letter.issueDate) },
                { icon: <FileCheck />, label: 'Issued', value: letter.issuedAt ? formatDateTime(letter.issuedAt) : 'Not issued yet' },
                { icon: <Mail />, label: 'Emailed', value: letter.emailedAt ? formatDateTime(letter.emailedAt) : 'Not yet' },
                { icon: <IndianRupee />, label: 'States pay', value: letter.statesPay ? 'Yes' : 'No' },
              ]}
            />
          </Card>
        </div>
      )}
    </>
  )
}
