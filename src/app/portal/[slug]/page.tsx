import type { Metadata } from 'next'
import { CheckCircle2, Circle, Download, FileText, FolderKanban, ListChecks, ReceiptIndianRupee } from 'lucide-react'
import { BrandButton, PublicCard, PublicShell, Unavailable } from '@/components/doclinks/public-shell'
import { ApprovalCard, PortalSignOut } from '@/components/portal/approval-card'
import { formatDate } from '@/lib/dates'
import { formatINR } from '@/lib/money'
import { brandFor } from '@/modules/doclinks/load'
import { APPROVAL_LABEL } from '@/modules/portal/access'
import { portalHome } from '@/modules/portal/queries'
import { portalOrg, portalPath, requirePortalViewer } from '@/modules/portal/session'
import { STATUS_LABEL, type TaskStatus } from '@/modules/work/tasks/constants'
import { HEALTH_LABEL, PROJECT_STATUS_LABEL, type ProjectHealth, type ProjectStatus } from '@/modules/work/projects/constants'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Client portal', robots: { index: false, follow: false } }

const DOC_STATUS: Record<string, string> = { issued: 'Due', part_paid: 'Part paid', paid: 'Paid', sent: 'Sent', accepted: 'Accepted', declined: 'Declined', converted: 'Invoiced' }

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <PublicCard>
      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.04em] text-white [&_svg]:size-4">{icon}{title}</h2>
      {children}
    </PublicCard>
  )
}

/** A client's view of their work with the agency: approvals, projects, tasks, invoices and files. Read-only apart from approvals. */
export default async function PortalHomePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const found = await portalOrg(slug)
  if (!found || !found.portalOn) return <Unavailable title="This portal is not available" body="Ask the team that sent you here for a fresh link." />
  const viewer = await requirePortalViewer(slug)
  const data = await portalHome(viewer)
  return (
    <PublicShell brand={await brandFor(viewer.orgId, null)}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold text-white">{viewer.client.name}</h1>
        <p className="text-xs text-white/60">Signed in as {viewer.contact.name} · <PortalSignOut slug={slug} /></p>
      </div>

      {data.approvals.length ? (
        <Section icon={<CheckCircle2 />} title={`Waiting for your approval (${data.approvals.length})`}>
          <ul className="space-y-3">
            {data.approvals.map((t) => <ApprovalCard key={t.id} slug={slug} taskId={t.id} title={t.title} note={t.approval?.note ?? null} meta={[t.key, t.projectName, t.dueDate ? `due ${formatDate(t.dueDate)}` : null].filter(Boolean).join(' · ')} />)}
          </ul>
        </Section>
      ) : null}

      <Section icon={<FolderKanban />} title="Projects">
        {data.projects.length ? (
          <ul className="space-y-5">
            {data.projects.map((p) => (
              <li key={p.id}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-medium text-white">{p.name}</p>
                  <p className="text-xs text-white/60">{HEALTH_LABEL[p.health as ProjectHealth] ?? p.health} · {PROJECT_STATUS_LABEL[p.status as ProjectStatus] ?? p.status}{p.endDate ? ` · ends ${formatDate(p.endDate)}` : ''}</p>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={p.progress} aria-valuemin={0} aria-valuemax={100} aria-label={`${p.name} progress`}>
                  <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, p.progress))}%`, background: 'var(--doc-brand)' }} />
                </div>
                <p className="mt-1 text-xs text-white/60">{p.progress}% done</p>
                {p.milestones.length ? (
                  <ol className="mt-2 space-y-1">
                    {p.milestones.map((m) => (
                      <li key={m.id} className="flex items-center gap-2 text-sm text-white/80">
                        {m.done ? <CheckCircle2 className="size-4 shrink-0 text-[#2DCBAF]" aria-label="Done" /> : <Circle className="size-4 shrink-0 text-white/40" aria-label="Open" />}
                        <span className="min-w-0 flex-1">{m.title}</span>
                        <span className="text-xs text-white/50">{formatDate(m.dueDate)}</span>
                      </li>
                    ))}
                  </ol>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-white/60">No projects are shared with you yet.</p>
        )}
      </Section>

      {data.tasks.length ? (
        <Section icon={<ListChecks />} title="Tasks">
          <ul className="divide-y divide-white/10">
            {data.tasks.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <span className="min-w-0 flex-1 text-white">{t.title}<span className="block text-xs text-white/50">{[t.key, t.projectName, t.dueDate ? `due ${formatDate(t.dueDate)}` : null].filter(Boolean).join(' · ')}</span></span>
                <span className="text-xs text-white/70">{t.approval ? APPROVAL_LABEL[t.approval.status] : (STATUS_LABEL[t.status as TaskStatus] ?? t.status)}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section icon={<ReceiptIndianRupee />} title="Invoices and quotes">
        {data.docs.length ? (
          <ul className="divide-y divide-white/10">
            {data.docs.map((d) => (
              <li key={`${d.kind}-${d.id}`} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <a href={d.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 text-white hover:underline">
                  {d.kind === 'invoice' ? 'Invoice' : 'Quote'} {d.number}
                  <span className="block text-xs text-white/50">{formatDate(d.date)} · {formatINR(d.totalPaise)}{d.kind === 'invoice' && d.balancePaise > 0 ? ` · ${formatINR(d.balancePaise)} due` : ''}</span>
                </a>
                <span className="text-xs text-white/70">{DOC_STATUS[d.status] ?? d.status}</span>
                {d.payable ? <BrandButton href={d.url}>Pay now</BrandButton> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-white/60">No invoices or quotes yet.</p>
        )}
        {data.statementUrl ? <p className="mt-3 text-sm"><a href={data.statementUrl} target="_blank" rel="noopener noreferrer" className="text-white underline-offset-4 hover:underline">Open your statement</a></p> : null}
      </Section>

      <Section icon={<FileText />} title="Shared files">
        {data.files.length ? (
          <ul className="divide-y divide-white/10">
            {data.files.map((f) => (
              <li key={`${f.id}-${f.where}`} className="flex items-center gap-2 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate text-white">{f.name}<span className="block text-xs text-white/50">{f.where}</span></span>
                <a href={portalPath(slug, `/files/${f.id}`)} className="inline-flex items-center gap-1 text-xs text-white/80 hover:text-white"><Download className="size-3.5" /> Download</a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-white/60">No files shared yet.</p>
        )}
      </Section>
    </PublicShell>
  )
}
