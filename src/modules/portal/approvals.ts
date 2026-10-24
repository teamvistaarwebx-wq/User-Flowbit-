import 'server-only'
import type { Types } from 'mongoose'
import { NotFoundError, UserError } from '@/lib/errors'
import { notifyMembers } from '@/lib/notify'
import { Task } from '@/models/work/Task'
import { TaskActivity } from '@/models/work/TaskActivity'
import { decisionRefusal, taskVisibleTo, type ApprovalDecision } from './access'
import { sharedProjects } from './queries'
import type { PortalViewer } from './session'

/**
 * The client's answer to an approval request: Approve, or Request changes
 * with a comment. Written once (conditional on "requested"), logged on the
 * task's timeline as the contact, and sent to whoever asked and the assignees.
 */
export async function decideApproval(v: PortalViewer, input: { taskId: string; decision: ApprovalDecision; comment: string }) {
  const projects = await sharedProjects(v)
  const shared = new Set(projects.map((p) => String(p._id)))
  const task = await v.db(Task).findById(input.taskId).lean()
  if (!task || !taskVisibleTo(task, String(v.client._id), shared)) throw new NotFoundError('That item')
  const refusal = decisionRefusal(task.approval?.status, input.decision, input.comment)
  if (refusal) throw new UserError(refusal)
  const comment = input.comment.trim().slice(0, 2000)
  const now = new Date()
  const res = await v.db(Task).updateOne(
    { _id: task._id, 'approval.status': 'requested' },
    { $set: { 'approval.status': input.decision, 'approval.decidedAt': now, 'approval.decidedByContactId': v.contact._id, 'approval.decidedByName': v.contact.name, 'approval.comment': comment || undefined } },
  )
  if (!res.modifiedCount) throw new UserError('This is no longer waiting for your approval.')
  const requester = (task.approval?.requestedById ?? task.creatorId) as Types.ObjectId
  await v.db(TaskActivity).create({
    taskId: task._id,
    projectId: task.projectId,
    actorId: requester,
    type: input.decision === 'approved' ? 'client_approved' : 'client_changes_requested',
    meta: { portalContact: v.contact.name, portalContactId: String(v.contact._id), client: v.client.name, comment },
  })
  const who = `${v.contact.name} (${v.client.name})`
  const title = input.decision === 'approved' ? `${who} approved ${task.key} · ${task.title}` : `${who} asked for changes on ${task.key} · ${task.title}`
  await notifyMembers({ orgId: v.orgId }, [...new Set([String(requester), ...(task.assigneeIds ?? []).map(String)])], { title, body: comment || undefined, href: `/app/work/tasks/${task._id}`, kind: input.decision === 'approved' ? 'success' : 'warning', product: 'work', event: 'portal.approval_decided' })
  return { key: task.key, title: task.title }
}
