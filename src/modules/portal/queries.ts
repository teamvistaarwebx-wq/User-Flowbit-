import 'server-only'
import type { Types } from 'mongoose'
import { Invoice } from '@/models/folio/Invoice'
import { Quote } from '@/models/folio/Quote'
import { PaymentLink } from '@/models/payments/PaymentLink'
import { Milestone } from '@/models/work/Milestone'
import { Project } from '@/models/work/Project'
import { Task } from '@/models/work/Task'
import { ensureDocLink, portalDocLinks } from '@/modules/doclinks/links'
import { invoicesWithCurrentLink } from '@/modules/payments/link-rules'
import { portalInvoiceFilter, visibleTaskFilter } from './access'
import type { PortalViewer } from './session'

/**
 * What a signed-in contact sees. Every query starts from the session's
 * workspace (scoped db) and client; nothing is looked up by an id from the
 * request without that filter.
 */

const DOC_LIMIT = 50

export type PortalProject = { id: string; code: string; name: string; status: string; health: string; progress: number; startDate: string | null; endDate: string | null; color: string; milestones: { id: string; title: string; dueDate: string; done: boolean }[] }
export type PortalTask = { id: string; key: string; title: string; status: string; dueDate: string | null; projectName: string | null; approval: { status: string; note: string | null; requestedAt: string | null; comment: string | null; decidedByName: string | null } | null; files: { id: string; name: string }[] }
export type PortalDoc = { id: string; kind: 'invoice' | 'quote'; number: string; date: string; totalPaise: number; balancePaise: number; status: string; url: string; payable: boolean }
export type PortalFile = { id: string; name: string; size: number; where: string }

/** The client's shared projects (not archived). */
export async function sharedProjects(v: Pick<PortalViewer, 'db' | 'client'>) {
  return v.db(Project).find({ clientId: v.client._id, portalShared: true, archivedAt: null }, { code: 1, name: 1, status: 1, health: 1, progress: 1, startDate: 1, endDate: 1, color: 1, files: 1 }).sort({ updatedAt: -1 }).limit(50).lean()
}

export async function visibleTasks(v: Pick<PortalViewer, 'db' | 'client'>, projectIds: readonly Types.ObjectId[]) {
  return v.db(Task).find(visibleTaskFilter(v.client._id, projectIds), { key: 1, title: 1, status: 1, dueDate: 1, projectId: 1, approval: 1, attachments: 1 }).sort({ updatedAt: -1 }).limit(200).lean()
}

export async function portalHome(v: PortalViewer) {
  const projects = await sharedProjects(v)
  const projectIds = projects.map((p) => p._id)
  const [milestones, tasks, invoices, quotes] = await Promise.all([
    projectIds.length ? v.db(Milestone).find({ projectId: { $in: projectIds } }, { projectId: 1, title: 1, dueDate: 1, status: 1 }).sort({ dueDate: 1 }).lean() : [],
    visibleTasks(v, projectIds),
    v.db(Invoice).find(portalInvoiceFilter(v.client._id), { number: 1, issueDate: 1, totalPaise: 1, balancePaise: 1, status: 1 }).sort({ issueDate: -1 }).limit(DOC_LIMIT).lean(),
    v.db(Quote).find({ clientId: v.client._id, status: { $in: ['sent', 'accepted', 'declined', 'converted'] } }, { number: 1, quoteDate: 1, totalPaise: 1, status: 1 }).sort({ quoteDate: -1 }).limit(DOC_LIMIT).lean(),
  ])
  const paymentLinks = invoices.length ? await v.db(PaymentLink).find({ invoiceId: { $in: invoices.map((i) => i._id) }, status: 'created' }, { invoiceId: 1, amountPaise: 1 }).lean() : []
  const payable = invoicesWithCurrentLink(
    invoices.map((i) => ({ id: String(i._id), status: i.status, balancePaise: i.balancePaise ?? 0 })),
    paymentLinks.map((l) => ({ invoiceId: String(l.invoiceId), amountPaise: l.amountPaise })),
  )
  const projectName = new Map(projects.map((p) => [String(p._id), p.name]))
  const [invoiceUrls, quoteUrls] = await Promise.all([
    portalDocLinks(v.orgId, 'invoice', v.client._id, invoices.map((i) => i._id)),
    portalDocLinks(v.orgId, 'quote', v.client._id, quotes.map((q) => q._id)),
  ])

  // A document whose link staff turned off has no URL here, so the portal leaves it out.
  const docs: PortalDoc[] = [
    ...invoices.flatMap((i) => {
      const url = invoiceUrls.get(String(i._id))
      return url ? [{ id: String(i._id), kind: 'invoice' as const, number: i.number ?? '', date: i.issueDate, totalPaise: i.totalPaise ?? 0, balancePaise: i.balancePaise ?? 0, status: i.status, url, payable: payable.has(String(i._id)) }] : []
    }),
    ...quotes.flatMap((q) => {
      const url = quoteUrls.get(String(q._id))
      return url ? [{ id: String(q._id), kind: 'quote' as const, number: q.number, date: q.quoteDate, totalPaise: q.totalPaise ?? 0, balancePaise: 0, status: q.status, url, payable: false }] : []
    }),
  ]
  const statementUrl = invoices.length ? (await ensureDocLink(v.orgId, { kind: 'statement', docId: v.client._id, clientId: v.client._id })).url : null

  const portalTasks: PortalTask[] = tasks.map((t) => ({
    id: String(t._id),
    key: t.key,
    title: t.title,
    status: t.status,
    dueDate: t.dueDate ?? null,
    projectName: t.projectId ? (projectName.get(String(t.projectId)) ?? null) : null,
    approval: t.approval ? { status: t.approval.status, note: t.approval.note ?? null, requestedAt: t.approval.requestedAt ? t.approval.requestedAt.toISOString() : null, comment: t.approval.comment ?? null, decidedByName: t.approval.decidedByName ?? null } : null,
    files: (t.attachments ?? []).flatMap((a) => (a.kind === 'file' && a.fileId ? [{ id: String(a.fileId), name: a.title }] : [])),
  }))
  const files: PortalFile[] = [
    ...projects.flatMap((p) => (p.files ?? []).map((f) => ({ id: String(f.fileId), name: f.name, size: f.size ?? 0, where: p.name }))),
    ...portalTasks.flatMap((t) => t.files.map((f) => ({ id: f.id, name: f.name, size: 0, where: t.title }))),
  ]
  return {
    projects: projects.map((p): PortalProject => ({
      id: String(p._id),
      code: p.code,
      name: p.name,
      status: p.status,
      health: p.health,
      progress: p.progress ?? 0,
      startDate: p.startDate ?? null,
      endDate: p.endDate ?? null,
      color: p.color,
      milestones: milestones.filter((m) => String(m.projectId) === String(p._id)).map((m) => ({ id: String(m._id), title: m.title, dueDate: m.dueDate, done: m.status === 'done' })),
    })),
    tasks: portalTasks,
    approvals: portalTasks.filter((t) => t.approval?.status === 'requested'),
    docs,
    statementUrl,
    files,
  }
}

/** True when the file belongs to a shared project or a visible task of this client (the download route's check). */
export async function portalCanReadFile(v: PortalViewer, fileId: string): Promise<boolean> {
  const projects = await sharedProjects(v)
  if (projects.some((p) => (p.files ?? []).some((f) => String(f.fileId) === fileId))) return true
  const tasks = await visibleTasks(v, projects.map((p) => p._id))
  return tasks.some((t) => (t.attachments ?? []).some((a) => a.kind === 'file' && String(a.fileId) === fileId))
}
