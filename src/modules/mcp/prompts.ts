import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

/** Ready-made commands (docs/specs/mcp.md A6). Each is a user message that walks the AI through the safe flow. */

const user = (text: string) => ({ messages: [{ role: 'user' as const, content: { type: 'text' as const, text } }] })

export const PROMPT_TEXT = {
  updateFromNotes: (notes: string, source?: string) =>
    `Update Flowbit from these notes${source ? ` (source: ${source})` : ''}.\n\n1. Read flowbit://guide/updating and flowbit://workspace/context.\n2. Use flowbit_find for every person, client, task and lead mentioned.\n3. Call flowbit_plan_changes once with all the changes and a source.\n4. Show me the preview (ok / needs confirmation / refused) and wait for my yes.\n5. Then call flowbit_apply_plan and give me the links.\n\nNotes:\n${notes}`,
  dailyStandup: (post: boolean) =>
    `Prepare my daily standup from Flowbit: what I finished yesterday (work_list_tasks status done, mine), what I am doing today (work_my_day) and what is blocked. ${post ? 'Then ask me before adding it as a comment anywhere.' : 'Just show it to me.'}`,
  clientUpdate: (client: string) =>
    `Prepare a short status note for the client "${client}": use flowbit_find to get the client, then work_list_tasks for its open and recently done tasks, and folio_receivables / folio_client_statement for money owed. Write it in plain, friendly English. Do not send anything.`,
  followupsToday: () =>
    `List my Orbit follow-ups due today and overdue (orbit_list_leads with followup_due today, then overdue). For each, draft a short email I could send. Do not log anything until I confirm; then use orbit_log_activity.`,
  collectionsReview: () =>
    `Review collections: call folio_receivables, list the overdue invoices oldest first, and suggest polite reminder wording for each (Indian business tone). I send them myself; never record payments.`,
}

export function registerPrompts(server: McpServer): void {
  server.registerPrompt('update-from-notes', { title: 'Update Flowbit from notes', description: 'Paste notes from Slack, email or a meeting: find → plan → preview → apply.', argsSchema: { notes: z.string().min(1).describe('The notes to turn into Flowbit changes'), source: z.string().optional().describe('e.g. "slack #design 8 Oct"') } }, ({ notes, source }) => user(PROMPT_TEXT.updateFromNotes(notes, source)))
  server.registerPrompt('daily-standup', { title: 'Daily standup', description: "Yesterday's done tasks and today's plan.", argsSchema: { post: z.string().optional().describe('"yes" to offer posting it') } }, ({ post }) => user(PROMPT_TEXT.dailyStandup(post === 'yes')))
  server.registerPrompt('client-update', { title: 'Client update', description: 'A status note for one client from its tasks and invoices.', argsSchema: { client: z.string().min(1) } }, ({ client }) => user(PROMPT_TEXT.clientUpdate(client)))
  server.registerPrompt('followups-today', { title: 'Follow-ups today', description: "Today's CRM follow-ups with an email draft for each." }, () => user(PROMPT_TEXT.followupsToday()))
  server.registerPrompt('collections-review', { title: 'Collections review', description: 'Overdue invoices and suggested reminder wording (you send them).' }, () => user(PROMPT_TEXT.collectionsReview()))
}
