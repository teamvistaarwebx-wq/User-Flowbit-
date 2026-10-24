import 'server-only'
import { Meeting } from '@/models/work/Meeting'
import { isValidObjectId } from 'mongoose'
import { isBlocked, type Ctx } from '@/lib/ctx'
import { SEAL_KIND, SIGNATURE_KIND } from '@/lib/company-profile'
import { FolioExpense } from '@/models/folio/Expense'
import { Claim } from '@/models/muster/Claim'
import { EmployeeDocument } from '@/models/muster/EmployeeDocument'
import { LeaveRequest } from '@/models/muster/LeaveRequest'
import { PolicyDocument } from '@/models/muster/Policy'
import { Letter } from '@/models/muster/Letter'
import { Payslip } from '@/models/muster/Payslip'
import { Project } from '@/models/work/Project'
import { Post } from '@/models/work/Post'
import { PostReply } from '@/models/work/PostReply'
import { Task } from '@/models/work/Task'
import { ownEmployeeId, visibleEmployeeIds } from '@/modules/muster/people/scope'
import { canAccessProject } from '@/modules/work/projects/access'
import { loadPost } from '@/modules/work/posts/access'
import { canAccessTask } from '@/modules/work/tasks/access'
import { getViewer } from '@/modules/work/tasks/viewer'
import { loadBoard } from '@/modules/work/whiteboards/access'

type FileLike = { _id: unknown; kind: string; entity?: string | null; entityId?: string | null }

/** Shown to every member of the workspace: branding, profile photos, and project and client logos (they mark tasks). */
const WORKSPACE_KINDS = new Set(['avatar', 'logo', 'folio_logo', 'project_logo', 'client_logo'])
const BRANDING_KINDS = new Set(['avatar', 'logo'])

/** Own record, or the permission plus the person in the viewer's employee scope. */
async function ownOrVisible(ctx: Ctx, employeeId: unknown, allowed: boolean): Promise<boolean> {
  const id = String(employeeId)
  if (id === ownEmployeeId(ctx)) return true
  if (!allowed) return false
  const visible = await visibleEmployeeIds(ctx)
  return visible === null || visible.includes(id)
}

const entityOf = (file: FileLike) => (file.entityId && isValidObjectId(file.entityId) ? file.entityId : null)

/**
 * Whether the viewer may open a stored file through /api/files/<id>. Each kind
 * follows the rule of the record it belongs to (the same rules as the guarded
 * Muster routes), so a guessed file id never bypasses them. Unknown kinds: no.
 */
export async function canOpenFile(ctx: Ctx, file: FileLike): Promise<boolean> {
  // A blocked workspace keeps only what the subscription page shows (logo and profile photos).
  if (isBlocked(ctx)) return BRANDING_KINDS.has(file.kind)
  if (WORKSPACE_KINDS.has(file.kind)) return true
  const fileId = file._id
  const entityId = entityOf(file)
  switch (file.kind) {
    // Flowbit billing: payment screenshots and TDS certificates (modules/billing).
    case 'payment_proof':
    case 'tds_certificate':
      return ctx.can('billing.manage')
    case 'task_attachment': {
      const task = entityId ? await ctx.db(Task).findById(entityId).lean() : null
      return Boolean(task && canAccessTask(await getViewer(ctx), task))
    }
    case 'comment_image': {
      // An image in a task comment: whoever can see the task.
      const task = entityId ? await ctx.db(Task).findById(entityId).lean() : null
      return Boolean(task && canAccessTask(await getViewer(ctx), task))
    }
    case 'post_image': {
      // An image in a post or reply: whoever can see the post it belongs to.
      const owner = (await ctx.db(Post).findOne({ 'images.fileId': fileId, deletedAt: null }, { _id: 1 }).lean()) ?? (await ctx.db(PostReply).findOne({ 'images.fileId': fileId, deletedAt: null }, { postId: 1 }).lean().then((r) => (r ? { _id: r.postId } : null)))
      return owner ? loadPost(ctx, String(owner._id)).then(() => true, () => false) : false
    }
    case 'project_file': {
      const project = entityId ? await ctx.db(Project).findById(entityId).lean() : null
      return Boolean(project && canAccessProject(String(ctx.memberId), ctx.can('projects.write'), project))
    }
    case 'meeting_recording': {
      // A meeting recording (Meetings AI): the organiser and attendees, or a Work manager.
      const meeting = entityId ? await ctx.db(Meeting).findById(entityId, { organizerId: 1, attendees: 1 }).lean() : null
      const me = String(ctx.memberId)
      return Boolean(meeting && (ctx.can('tasks.manage') || String(meeting.organizerId) === me || meeting.attendees.some((a) => String(a.memberId) === me)))
    }
    case 'whiteboard':
      return entityId ? loadBoard(ctx, entityId).then(() => true, () => false) : false
    // Salary tax proofs (modules/muster/tax): the employee, and payroll staff who see them.
    case 'tax_proof': {
      if (!ctx.has('muster') || !entityId) return false
      return ownOrVisible(ctx, entityId, ctx.can('payroll.read'))
    }
    case 'employee_document': {
      if (!ctx.has('muster')) return false
      const doc = await ctx.db(EmployeeDocument).findOne({ fileId, deletedAt: null }, { employeeId: 1 }).lean()
      return Boolean(doc && (await ownOrVisible(ctx, doc.employeeId, ctx.can('people.read_sensitive'))))
    }
    case 'receipt': {
      if (!ctx.has('muster')) return false
      const claim = await ctx.db(Claim).findOne({ 'attachments.fileId': fileId }, { employeeId: 1 }).lean()
      return Boolean(claim && (await ownOrVisible(ctx, claim.employeeId, ctx.can('claims.read'))))
    }
    case 'leave_proof': {
      if (!ctx.has('muster')) return false
      const request = await ctx.db(LeaveRequest).findOne({ attachmentFileId: fileId }, { employeeId: 1 }).lean()
      return Boolean(request && (await ownOrVisible(ctx, request.employeeId, ctx.canAny('leave.read', 'leave.approve'))))
    }
    case 'letter': {
      if (!ctx.has('muster')) return false
      const letter = await ctx.db(Letter).findOne({ fileId }, { employeeId: 1, status: 1, statesPay: 1 }).lean()
      if (!letter) return false
      if (String(letter.employeeId) === ownEmployeeId(ctx)) return letter.status !== 'draft'
      return ownOrVisible(ctx, letter.employeeId, ctx.can('letters.read') && (!letter.statesPay || ctx.can('payroll.read')))
    }
    case 'policy': {
      // Published policies are for everyone in Muster; an archived one stays with HR admins only.
      if (!ctx.has('muster')) return false
      const policy = await ctx.db(PolicyDocument).findOne({ fileId }, { archivedAt: 1 }).lean()
      return Boolean(policy && (!policy.archivedAt || ctx.can('hr.settings')))
    }
    case 'expense_receipt': {
      // A bill attached to a Folio expense: anyone who can open Folio's expenses.
      if (!ctx.has('folio') || !ctx.can('expenses.read')) return false
      return Boolean(await ctx.db(FolioExpense).exists({ receiptFileId: fileId }))
    }
    case 'payslip': {
      if (!ctx.has('muster')) return false
      const slip = await ctx.db(Payslip).findOne({ fileId }, { employeeId: 1, isPublished: 1 }).lean()
      if (!slip) return false
      if (String(slip.employeeId) === ownEmployeeId(ctx)) return Boolean(slip.isPublished)
      // The stored PDF prints PAN and UAN, so someone else's needs sensitive access too.
      return ownOrVisible(ctx, slip.employeeId, ctx.can('payroll.read') && ctx.can('people.read_sensitive'))
    }
    case SIGNATURE_KIND:
    case SEAL_KIND:
    case 'folio_signature':
      // Company and Folio entity signatures and seals are only ever drawn into server-rendered PDFs, never served as files (R3 L-21c).
      return false
    default:
      return false
  }
}
