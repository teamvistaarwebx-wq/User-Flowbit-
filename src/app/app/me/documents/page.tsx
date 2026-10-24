import type { Metadata } from 'next'
import { BookOpen, ClipboardCheck, Download, FolderOpen } from 'lucide-react'
import { breadcrumbFor } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { formatDate } from '@/lib/dates'
import { fileUrl } from '@/lib/files'
import { cn } from '@/lib/utils'
import { TONE_TEXT } from '@/components/ui/badge'
import { buttonClass } from '@/components/ui/button-styles'
import { Card, CardHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { Progress } from '@/components/ui/progress'
import { ListCard, ListRow, ListRows } from '@/components/muster/ui/list-card'
import { NotLinked } from '@/components/muster/me/not-linked'
import { DocumentUpload } from '@/components/muster/people/document-upload'
import { EmployeeDocument } from '@/models/muster/EmployeeDocument'
import { PolicyDocument } from '@/models/muster/Policy'
import { myEmployee } from '@/modules/muster/me/queries'
import { LIFECYCLE, type EmployeeStatus } from '@/modules/muster/people/lifecycle'
import { onboardingStatus } from '@/modules/muster/people/onboarding'
import { docLabel } from '@/modules/muster/settings/defaults'
import { getPolicy } from '@/modules/muster/settings/queries'

export const metadata: Metadata = { title: 'My documents' }
const BASE = '/app/me/documents'
const size = (bytes?: number | null) => (bytes ? (bytes > 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1000))} KB`) : '')

export default async function MyDocumentsPage() {
  const ctx = await requireMember({ product: 'muster' })
  const employee = await myEmployee(ctx)
  if (!employee) return <NotLinked />
  const [documents, policies, policy] = await Promise.all([
    ctx.db(EmployeeDocument).find({ employeeId: employee._id, deletedAt: null }).sort({ createdAt: -1 }).lean(),
    ctx.db(PolicyDocument).find({ archivedAt: null }).sort({ category: 1, title: 1 }).lean(),
    getPolicy(ctx),
  ])
  const onboarding = onboardingStatus(policy.onboarding, documents.map((d) => d.docType))
  const preJoining = LIFECYCLE[employee.status as EmployeeStatus]?.stage === 'pre_joining'

  return (
    <>
      <PageHeader title="My documents" description="Your joining documents, and the company policies everyone can read." breadcrumb={breadcrumbFor(BASE)} actions={<DocumentUpload label="Upload a document" suggested={onboarding.missing[0]} />} />
      <div className="grid grid-cols-12 gap-3">
        <Card className="col-span-12 self-start rounded-[14px] lit-edge-bright lg:col-span-5">
          <CardHeader icon={<ClipboardCheck />} title={`Onboarding ${onboarding.percent}% complete`} description={preJoining && !onboarding.ready ? `HR needs ${onboarding.threshold}% of these before your first day can be confirmed.` : undefined} />
          <Progress size="lg" value={onboarding.percent} label={`${onboarding.done} of ${onboarding.total} documents`} />
          {onboarding.missing.length ? (
            <ul className="mt-4">
              {onboarding.missing.map((d) => (
                <li key={d} className="flex items-center justify-between gap-3 border-b border-white/[0.1] py-2.5 last:border-0">
                  <span className="text-sm text-white">{docLabel(d)}</span>
                  <DocumentUpload label="Upload" variant="secondary" suggested={d} />
                </li>
              ))}
            </ul>
          ) : (
            <p className={cn('mt-4 text-sm', TONE_TEXT.success)}>Every document HR asks for is on file. Thank you.</p>
          )}
        </Card>
        <ListCard className="col-span-12 lg:col-span-7" label="On my record" icon={<FolderOpen />} description={`${documents.length} ${documents.length === 1 ? 'file' : 'files'}`}>
          {documents.length ? (
            <ListRows>
              {documents.map((d) => (
                <ListRow key={String(d._id)} className="flex-nowrap justify-between">
                  <div className="min-w-0">
                    <p className="text-sm text-white">{docLabel(d.docType)}</p>
                    <p className="truncate text-xs text-fg-2">{d.fileName} · {size(d.sizeBytes)} · added {formatDate(d.createdAt)}{d.uploadedByName ? ` by ${d.uploadedByName}` : ''}</p>
                  </div>
                  <a href={`/api/muster/people/documents/${d._id}?download=1`} className={buttonClass('secondary', 'sm')}>
                    <Download className="size-3.5" /> Download
                  </a>
                </ListRow>
              ))}
            </ListRows>
          ) : (
            <EmptyState compact icon={<FolderOpen />} title="Nothing on file yet" description="Upload your joining documents here, or send them to HR to file for you." />
          )}
        </ListCard>
        <ListCard className="col-span-12" label="Company policies" icon={<BookOpen />} description="Published by HR for everyone">
          {policies.length ? (
            <ListRows className="grid sm:grid-cols-2">
              {policies.map((p) => (
                <ListRow key={String(p._id)} className="flex-nowrap justify-between">
                  <div className="min-w-0">
                    <p className="text-sm text-white">{p.title}</p>
                    <p className="truncate text-xs text-fg-2">{[p.category, p.description].filter(Boolean).join(' · ') || `Published ${formatDate(p.createdAt)}`}</p>
                  </div>
                  <a href={fileUrl(p.fileId)} target="_blank" rel="noreferrer" className={buttonClass('secondary', 'sm')}>
                    <Download className="size-3.5" /> Open
                  </a>
                </ListRow>
              ))}
            </ListRows>
          ) : (
            <EmptyState compact icon={<BookOpen />} title="No policies published yet" description="HR publishes the handbook and leave policy in HR settings." />
          )}
        </ListCard>
      </div>
    </>
  )
}
