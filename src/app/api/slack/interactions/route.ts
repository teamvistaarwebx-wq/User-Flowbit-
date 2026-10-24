import { after } from 'next/server'
import { verifiedSlackBody } from '@/modules/connectors/slack/request'
import { installFor, openTaskModal, submitTaskModal, TASK_MODAL_CALLBACK, TASK_SHORTCUT_CALLBACK } from '@/modules/connectors/slack/service'

export const runtime = 'nodejs'
export const maxDuration = 30

type Interaction = {
  type?: string
  callback_id?: string
  trigger_id?: string
  team?: { id?: string }
  user?: { id?: string; team_id?: string }
  channel?: { id?: string; name?: string }
  message?: { text?: string; ts?: string }
  view?: { callback_id?: string; private_metadata?: string; state?: unknown; team_id?: string }
}

/** Message shortcut "Create Flowbit task" (opens the modal) and the modal's submit. */
export async function POST(request: Request) {
  const raw = await verifiedSlackBody(request)
  if (raw === null) return new Response('Invalid signature', { status: 401 })
  let payload: Interaction
  try {
    payload = JSON.parse(new URLSearchParams(raw).get('payload') ?? '{}') as Interaction
  } catch {
    return new Response('Bad payload', { status: 400 })
  }
  const install = await installFor(payload.team?.id ?? payload.user?.team_id ?? payload.view?.team_id ?? '')
  if (!install) return new Response(null, { status: 200 })
  if (payload.type === 'message_action' && payload.callback_id === TASK_SHORTCUT_CALLBACK && payload.trigger_id) {
    await openTaskModal(install, { trigger_id: payload.trigger_id, message: payload.message, channel: payload.channel })
    return new Response(null, { status: 200 })
  }
  if (payload.type === 'view_submission' && payload.view?.callback_id === TASK_MODAL_CALLBACK) {
    const userId = payload.user?.id ?? ''
    const view = payload.view
    // Quick checks answer inline; the task itself is created after the response (Slack allows 3 seconds).
    const title = ((view.state as { values?: Record<string, Record<string, { value?: string }>> })?.values?.title?.v?.value ?? '').trim()
    if (!title) return Response.json({ response_action: 'errors', errors: { title: 'Add a title' } })
    after(async () => {
      const result = await submitTaskModal(install, userId, view)
      if (result.errors) console.warn('[slack] task not created', result.errors)
    })
    return Response.json({ response_action: 'clear' })
  }
  return new Response(null, { status: 200 })
}
