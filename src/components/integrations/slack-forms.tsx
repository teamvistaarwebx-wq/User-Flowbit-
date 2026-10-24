'use client'

import { ActionForm, FormField, SubmitButton, useAction } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { disconnectSlack, setSlackChannel } from '@/modules/connectors/slack/actions'
import { WEBHOOK_EVENTS, WEBHOOK_EVENT_LABEL } from '@/modules/webhooks/events'

export function SlackChannelForm({ channel, events }: { channel: string | null; events: string[] }) {
  return (
    <ActionForm action={setSlackChannel} className="space-y-3">
      <FormField name="channel" label="Post updates to channel" help="A public channel. Leave empty to turn updates off.">
        <Input name="channel" defaultValue={channel ? `#${channel}` : ''} placeholder="#flowbit-updates" />
      </FormField>
      <div className="grid gap-2 sm:grid-cols-2">
        {WEBHOOK_EVENTS.map((e) => <Checkbox key={e} name="events[]" value={e} defaultChecked={events.includes(e)} label={WEBHOOK_EVENT_LABEL[e]} />)}
      </div>
      <SubmitButton>Save</SubmitButton>
    </ActionForm>
  )
}

export function SlackDisconnect() {
  const [run, pending] = useAction(disconnectSlack)
  return <Button variant="secondary" size="sm" loading={pending} onClick={() => run({})}>Disconnect Slack</Button>
}
