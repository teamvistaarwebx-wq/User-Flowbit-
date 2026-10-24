/** Slack Block Kit pieces (pure). */

export const TASK_MODAL_CALLBACK = 'flowbit_task_modal'
export const TASK_SHORTCUT_CALLBACK = 'create_flowbit_task'

export type ModalMeta = Readonly<{ channelId: string; channelName: string; ts: string; permalink: string | null }>

export function taskModal(prefill: string, meta: ModalMeta) {
  const title = prefill.split('\n')[0].slice(0, 150)
  return {
    type: 'modal',
    callback_id: TASK_MODAL_CALLBACK,
    private_metadata: JSON.stringify(meta).slice(0, 3000),
    title: { type: 'plain_text', text: 'Create Flowbit task' },
    submit: { type: 'plain_text', text: 'Create' },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks: [
      { type: 'input', block_id: 'title', label: { type: 'plain_text', text: 'Title' }, element: { type: 'plain_text_input', action_id: 'v', initial_value: title || 'Follow up', max_length: 200 } },
      { type: 'input', block_id: 'description', optional: true, label: { type: 'plain_text', text: 'Description' }, element: { type: 'plain_text_input', action_id: 'v', multiline: true, initial_value: prefill.slice(0, 2900) } },
      { type: 'input', block_id: 'due', optional: true, label: { type: 'plain_text', text: 'Due (kal, Friday, 15 Oct…)' }, element: { type: 'plain_text_input', action_id: 'v', max_length: 60 } },
      { type: 'input', block_id: 'assignee', optional: true, label: { type: 'plain_text', text: 'Assign to' }, element: { type: 'users_select', action_id: 'v' } },
    ],
  }
}

type ViewState = { values?: Record<string, Record<string, { value?: string | null; selected_user?: string | null }>> }

export function modalValues(state: ViewState): { title: string; description: string; due: string; assigneeSlackId: string | null } {
  const v = state.values ?? {}
  return {
    title: (v.title?.v?.value ?? '').trim(),
    description: (v.description?.v?.value ?? '').trim(),
    due: (v.due?.v?.value ?? '').trim(),
    assigneeSlackId: v.assignee?.v?.selected_user ?? null,
  }
}

export const linkText = (url: string, text: string) => `<${url}|${text.replace(/[<>|]/g, '')}>`
