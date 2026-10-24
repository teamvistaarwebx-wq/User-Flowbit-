import { NEVER_RULES } from './never'
import { MCP_LIMITS } from './limits'
import { PLAN_OPS } from './plan/schema'

/** flowbit://guide/updating and the server instructions: how an AI should update Flowbit. Pure text. */

export const GUIDE_UPDATING = `# Updating Flowbit safely

1. Read flowbit://workspace/context first: it lists the real statuses, priorities, projects, pipeline stages, lead sources and Folio firms. Never guess values.
2. Always find before you create. Use flowbit_find for people, clients, projects, tasks, leads and deals. A match below 80% confidence must be shown to the person.
3. For more than 3 changes, or anything from Slack, email or meeting notes, use plan → apply:
   - flowbit_plan_changes with a source ({ kind: "slack", ref: "#design 8 Oct" }) and the list of changes (ops: ${PLAN_OPS.join(', ')}).
   - Show the person the preview: ok, needs confirmation, refused. Do not apply on your own.
   - Only after they say yes: flowbit_apply_plan with the plan_id (and confirm: [indexes] for the needs-confirmation items they approved). Plans expire after 30 minutes.
4. Never invent clients, leads or people. If a name does not match, say so and ask.
5. Dates may be words: "kal", "parso", "Friday", "next week", "15 Oct". Flowbit reads them in IST and shows the date it chose.
6. Send the same source again and Flowbit skips what it already did (no duplicates).
7. Every change shows in Flowbit as "<person> via <this app>" and can be undone for 7 days (flowbit_undo_batch, or Settings → Connected apps → History).
8. Limits: at most ${MCP_LIMITS.maxChangesPerApply} changes per apply, ${MCP_LIMITS.requestsPerMinute} requests a minute, ${MCP_LIMITS.dailyWritesPerWorkspace} changes a day per workspace.

## Never possible through AI apps
${NEVER_RULES.map((r) => `- ${r.label}`).join('\n')}
Folio is draft only: invoices and quotes are created as drafts; a person issues them in Flowbit. People data is read only (directory and leave); salary, PAN and bank details are never returned.
`

export const SERVER_INSTRUCTIONS = `Flowbit is a work, CRM, HR and billing suite for Indian agencies. Read flowbit://guide/updating before changing anything. Find before create; use flowbit_plan_changes then flowbit_apply_plan (after the person confirms) for more than 3 changes. Never invent clients.`
