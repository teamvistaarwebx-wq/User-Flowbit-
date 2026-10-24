# Flowbit MCP and connectors: design proposal

**Status:** built 9 Oct 2026 (v2.1 step 6). Draft 8 Oct 2026. "Built:" notes below say what was made and where; the open questions are answered at the end.

## Goal

A user gathers information from Slack, email, meeting notes, WhatsApp exports and other places. They hand it to Claude, ChatGPT or another AI assistant and say "Update my Flowbit". The AI should then:

1. find the right people, clients, projects, tasks and leads in Flowbit;
2. create or update tasks, CRM leads and deals, follow-ups, and draft invoices and quotes;
3. show the person a clear preview of every change, and save only after they confirm.

There are two parts:

| Part | Direction | Purpose |
|---|---|---|
| **A. Flowbit MCP server** | AI → Flowbit | Claude or ChatGPT reads and writes Flowbit |
| **B. Flowbit connectors** | Flowbit ← other apps | Flowbit pulls from Slack, Gmail, Google Calendar, Tally and others (later) |

---

## A. Flowbit MCP server

> **Built (9 Oct 2026):** everything in A1–A6 and the Part B connectors below, in `src/modules/mcp`, `src/modules/connectors`, `src/modules/webhooks`, `src/app/mcp/route.ts`, `src/app/oauth/*`, `src/app/.well-known/*` and `src/app/(auth)/(split)/oauth/authorize`. Endpoint `${APP_URL}/mcp`. Tests: `src/modules/mcp/**/*.test.ts` (OAuth, scope ∩ role per tool, never-allowed list, find, plan groups, apply/idempotency/undo, Hinglish dates, limits, and an in-process protocol smoke test with the SDK client).

### A1. Connection and security

- **Endpoint:** `https://useflowbit.com/mcp` (remote MCP, streamable HTTP). Claude custom connectors and ChatGPT connectors/apps both connect to a remote MCP over a URL. Re-check each platform's current requirements against its docs at build time.
- **Sign-in:** OAuth 2.1 with PKCE, as the MCP spec requires. The user clicks "Connect Flowbit" in Claude, Flowbit's login and consent screen opens, they pick a workspace and approve scopes. No API keys are copied anywhere.
- **Every token belongs to one user and one workspace.** The AI sees and does only what that user's role allows. Existing permissions (`resolvePermissions`) and `entitlements()` apply unchanged, so an employee's AI cannot read salaries.
- **Scopes (shown as checkboxes on the consent screen):**

  | Scope | Allows |
  |---|---|
  | `work.read` | Read tasks, projects and teams |
  | `work.write` | Create and update tasks and projects |
  | `orbit.read` | Read leads, deals and activities |
  | `orbit.write` | Create and update leads, deals and follow-ups |
  | `folio.read` | Read invoices, receivables and clients |
  | `folio.draft` | Create **draft** invoices and quotes only |
  | `people.read` | Read the directory: names, teams, leave status. No salary. |

- **Never available through MCP (fixed rules):**
  - attendance changes;
  - payroll and salary;
  - issuing, voiding or deleting an invoice;
  - recording payments;
  - deleting any record (archiving is allowed);
  - changing roles or settings;
  - billing.
- **Settings → Connected apps** in the workspace:
  - lists which AI apps are connected and who connected them;
  - shows each app's last use and its scopes;
  - offers a Revoke button.

  The admin can switch MCP off for the whole workspace.
- **Plans:** MCP needs a paid plan or the Suite. It is not part of Free.
- **Limits:** rate limits per token, at most 50 changes in one apply call, and a daily write cap per workspace.

**Built:**
- Transport: official `@modelcontextprotocol/sdk` 1.32.1, `WebStandardStreamableHTTPServerTransport` in stateless JSON mode (one server per request, Vercel-friendly). POST only; GET and DELETE answer 405 (no server-initiated stream). A missing or bad token gets 401 with `WWW-Authenticate: Bearer resource_metadata="${APP_URL}/.well-known/oauth-protected-resource/mcp"`.
- Discovery: `/.well-known/oauth-protected-resource` (and `/mcp` suffix, RFC 9728) and `/.well-known/oauth-authorization-server` (RFC 8414).
- OAuth 2.1 (`modules/mcp/oauth/core.ts`, pure over a store): dynamic client registration at `/oauth/register` (20 a day per IP; https redirect URIs, http only for localhost, no fragments or wildcards), `/oauth/authorize` consent screen on the Flowbit session (pick one workspace, untick scopes; scopes = requested ∩ role), authorization code + PKCE S256 only (5-minute single-use codes; a replayed code revokes what it produced), exact redirect URI matching, `/oauth/token` with 1-hour access tokens and 30-day rotating refresh tokens (a reused old refresh token revokes the connection), `/oauth/revoke` (RFC 7009). Client secrets, codes and tokens are stored only as SHA-256 (`OAuthClient`, `OAuthCode`, `OAuthGrant`). The `resource` parameter (RFC 8707) is accepted and must be `${APP_URL}/mcp`.
- Every token = one person + one workspace (`OAuthGrant`). Each request rebuilds the ctx with `buildCtx` (current role, `resolvePermissions`, `entitlements()`), so a role change applies at once; each tool checks scope ∩ role again. The person shows as "Sanskaar via Claude" in audit rows, notifications and timelines.
- Plan gate (owner default): paid plans, the trial, and Flowbit's internal/test/comped workspaces; never Free. Blocked workspaces are refused; read-only ones can still read. An admin switch (Settings → Connected apps, `McpSettings`) turns AI apps off for the workspace.
- Never-allowed list: `modules/mcp/never.ts` refuses attendance, payroll/salary, issuing/voiding/sending invoices, payments/receipts, deletes, roles/members, settings and billing by name with a clear message; no tool exists for any of them. Every structured result passes `redact()`, which drops salary, CTC, PAN, Aadhaar, UAN, ESIC, bank, IFSC, account numbers and secrets at any depth; the read queries never load those fields in the first place.
- Limits (`modules/mcp/limits.ts`): 120 requests a minute per connection, 50 changes per apply, 500 AI writes a day per workspace (IST day, all or nothing per batch).
- Settings → Integrations → **Connected apps** (`/app/settings/integrations/ai`): the connection URL with Claude and ChatGPT steps, connected apps (who, scopes, connected, last used) with Revoke (own; admins any), History of AI batches with Undo, and the admin switch.

### A2. How a big update works: "plan → confirm → apply"

When an AI has to make many changes from Slack or email, it must not write one at a time. That leads to duplicates, wrong matches and no undo. So Flowbit offers three steps:

1. **Find** (`flowbit_find`): match names to Flowbit records. "Vikram" becomes member #123, "Kalpa Studio" becomes client #45, "the homepage task" becomes task #678. Each result comes back with a confidence score.
2. **Plan** (`flowbit_plan_changes`): the AI sends its full list of changes. Flowbit **saves nothing yet**. It checks each change and returns a preview:
   - ✅ OK: 12 new tasks, 5 updates;
   - ⚠️ Needs confirmation: "2 tasks look like duplicates of existing ones", "client 'Kalpa' matches 2 clients";
   - ❌ Refused: "no permission to update deals", "attendance changes are not allowed".

   The plan gets a `plan_id` and expires in 30 minutes.
3. **Apply** (`flowbit_apply_plan`): only after the user says "yes, apply", the AI sends the `plan_id`. Flowbit:
   - saves everything as **one batch**, reusing the ImportBatch model from v2 step 5;
   - writes an audit row for each change: "Sanskaar via Claude";
   - returns links to every created or updated record.

**Undo:** the batch can be undone in one click from Settings → Connected apps → History, within 7 days.

**Source links:** each change can carry a `source` field, for example `slack:#design/1696…`, `email:<message-id>` or `meeting:2026-10-08`.
- The source shows on the task's timeline ("created from Slack #design").
- Re-sending the same source does not create a duplicate (`idempotency_key` = source + kind).

This is the same pattern as the importers: preview → confirm → batch → undo. Users already know it.

**Built:** `flowbit_plan_changes` (`modules/mcp/plan/planner.ts`, pure with injected lookups) resolves names with the fuzzy matcher (`find/match.ts`: exact email/phone, words, prefixes, typos; confidence 0–1, ambiguous when two are within 0.08), reads dates with the Hinglish quick-add parser in IST (`mcp/dates.ts`), checks scope ∩ role and the never-allowed list, flags likely duplicates (open task ≥ 0.9 similar, open lead with the same company) and repeats of the same source, and returns `ok` / `needs_confirmation` / `refused` with notes such as "Vikram → Vikram Joshi (member)" and a `plan_id` (`McpPlan`, 30 minutes, only the same connection can apply). Later changes may use a lead added earlier in the same plan. `flowbit_apply_plan` runs ok items and the needs-confirmation items listed in `confirm`, through the same module functions as the app, and stores one `ImportBatch` (kind `mcp`, source `mcp`, with created ids, before-copies of changed records and one line per change). Idempotency key = source (kind + ref/url) + change; stored in `McpIdempotency`, so sending the same Slack message again changes nothing. The source is stored on the task (`Task.origin`) and the timeline reads "created this task from Slack #design via Claude". Undo (`flowbit_undo_batch`, or Settings → Connected apps → History) works for 7 days: it removes what the batch created (invoices and quotes only while still drafts) and puts back what it changed. Single write tools run the same checks and apply at once when sure; when unsure they answer `needs_confirmation` and save nothing until called again with `confirm: true`.

### A3. Tools

Tool names are short and clear. Every tool:
- has an input schema;
- returns structured output, including record links;
- carries hints that mark it read-only or a write.

**Common**

| Tool | Does |
|---|---|
| `flowbit_whoami` | Returns the user, workspace, role and allowed scopes |
| `flowbit_find` | Fuzzy search across members, clients, projects, tasks, leads and deals by name, email or phone. Returns candidates with confidence. |
| `flowbit_plan_changes` | Takes a list of changes (see A4), returns a preview and a `plan_id`. Saves nothing. |
| `flowbit_apply_plan` | Applies a confirmed plan as one batch, with undo and links |
| `flowbit_undo_batch` | Undoes a batch the AI created |

**Work (tasks)**

| Tool | Does |
|---|---|
| `work_list_tasks` | Filters: assignee, project, client, status, due date, priority, overdue |
| `work_get_task` | One task with subtasks, checklist, the last 20 comments, blocker and time logged |
| `work_create_task` | One task: title, description, assignee, project/space, client, due date, priority, labels, subtasks, `source` |
| `work_update_task` | Change status, assignee, due date or priority; mark blocked with a reason |
| `work_add_comment` | Add a comment, with @mentions |
| `work_list_projects` | Projects with health, progress and lead |
| `work_my_day` | My tasks for today, overdue items and today's meetings: the same data as the brief |

Single create and update calls run directly, so "add one task" stays fast. Bulk work always goes through plan → apply.

**Orbit (CRM)**

| Tool | Does |
|---|---|
| `orbit_list_leads` | Filters: stage, owner, source, follow-up due |
| `orbit_get_lead` | Lead with its activity history |
| `orbit_upsert_lead` | Create or update a lead, matched on email or phone so no duplicate is made |
| `orbit_log_activity` | Log a call, email, meeting or WhatsApp note: "Spoke with Ramesh on 8 Oct, wants a quote" |
| `orbit_schedule_followup` | Set a follow-up date and owner |
| `orbit_move_deal` | Move a deal's stage, set won or lost with a reason |
| `orbit_pipeline_summary` | Pipeline value by stage, deals closing this week |

**Folio (billing): draft only**

| Tool | Does |
|---|---|
| `folio_receivables` | Who owes how much, the aging buckets, and the top overdue clients |
| `folio_get_invoice` | One invoice with its status and payments |
| `folio_draft_invoice` | Create a **draft** invoice: client, items, rate, GST is worked out by Flowbit. The user reviews and issues it in the app. |
| `folio_draft_quote` | Create a draft quote |
| `folio_client_statement` | A client's ledger summary |

Issuing invoices, recording payments and voiding are not available, by design. Money and the GST invoice number series need a human in the app.

**Built:** all 26 tools above, registered in `modules/mcp/server.ts` with zod input schemas, structured output (`structuredContent` plus the same JSON as text) with absolute record links, and `readOnlyHint` / `destructiveHint` / `idempotentHint` annotations. `work_add_comment` turns `@FirstName` into a mention.

**People (read only)**

| Tool | Does |
|---|---|
| `people_directory` | Name, team, manager and email. No salary, PAN or bank details. |
| `people_who_is_out` | Who is on leave today or this week, so the AI does not assign tasks to them |

### A4. Change format for `flowbit_plan_changes`

```json
{
  "source": { "kind": "slack", "ref": "#design 8 Oct", "url": "https://..." },
  "changes": [
    { "op": "create_task", "title": "Homepage banner revisions", "assignee": "Vikram", "client": "Kalpa Studio", "due": "2026-10-10", "priority": "high", "note": "From Slack: client asked for 2 options" },
    { "op": "update_task", "match": "Print vendor quotes", "status": "blocked", "blocked_reason": "Waiting for vendor rates" },
    { "op": "log_activity", "lead": "ramesh@kalpa.in", "type": "call", "summary": "Wants quote for 3 months retainer" },
    { "op": "schedule_followup", "lead": "ramesh@kalpa.in", "on": "2026-10-11" },
    { "op": "draft_quote", "client": "Kalpa Studio", "items": [{ "name": "Social retainer", "qty": 3, "rate": 45000 }] }
  ]
}
```

- Names can be plain text. Flowbit matches them and shows the match in the preview, for example "Vikram → Vikram Joshi (member)".
- Dates can be given as "kal" or "Friday". Flowbit converts them in IST and shows the result.

**Built:** ops `create_task`, `update_task`, `add_comment`, `upsert_lead`, `log_activity`, `schedule_followup`, `move_deal`, `draft_invoice`, `draft_quote` (`plan/schema.ts`). Each change may carry its own `source`.

### A5. Resources: background the AI reads first

- `flowbit://workspace/context`: workspace name, products switched on, task statuses and priorities, project and space names, Orbit pipeline stages, lead sources, Folio firms and tax settings. **This stops the AI guessing wrong values.**
- `flowbit://me/today`: my day, the same data as the brief.
- `flowbit://guide/updating`: a short guide for the AI: "always find before create; use plan → apply for more than 3 changes; never invent clients".

**Built:** the three resources (`modules/mcp/resources.ts`) and server instructions pointing at the guide.

### A6. Prompts: ready-made commands in Claude

| Prompt | Does |
|---|---|
| `update-from-notes` | "Paste notes from Slack, email or a meeting and I'll update Flowbit": find → plan → show preview → apply |
| `daily-standup` | Pick up yesterday's done tasks and today's plan, and post them to Flowbit or show them |
| `client-update` | Prepare a status note for one client from its tasks and invoices |
| `followups-today` | Today's CRM follow-ups, with an email draft for each |
| `collections-review` | Overdue invoices and suggested reminder wording (the user sends them) |

**Built:** the five prompts (`modules/mcp/prompts.ts`).

### A7. Build order

| Step | What | Effort |
|---|---|---|
| 1 | OAuth 2.1 (PKCE, dynamic client registration), consent screen, Connected apps page, scopes, audit "via <app>" | M |
| 2 | Read tools: whoami, find, work, orbit, folio and people reads, plus resources | M |
| 3 | Single write tools: create/update task, comment, upsert lead, activity, follow-up | S |
| 4 | plan → apply → undo, with source links and idempotency | M |
| 5 | Folio drafts, prompts, rate limits, admin switch | S |
| 6 | Test with Claude (custom connector) and ChatGPT (connector/app), then list it in their directories | S |

Implementation note:
- The tools call the existing `src/modules/*` functions with the same `ctx`, so business rules are not written twice.
- Use the official TypeScript MCP SDK. Mount it as a Next route.

---

## B. Flowbit connectors (data flowing in, later)

| Connector | Does | Notes |
|---|---|---|
| **Slack** | Turn a message into a task (message action), task updates to a channel, a `/flowbit` slash command | Slack app; no CASA |
| **Gmail** | Email to task: forward to `tasks+<workspace>@useflowbit.com` | No Gmail scope needed; a forwarding address is enough |
| **Google Calendar / Meet** | Meetings sync both ways, Meet links created automatically | "Sensitive" scope; no CASA |
| **Tally** | Invoices, receipts and expenses exported as XML | File export, no API |
| **Interakt (WhatsApp)** | Already built; hidden for now | Turns back on after the partner deal |
| **Razorpay** | Already built | |
| **IndiaMART / web form** | Already built | Test with a live key |
| **Zapier / Make / webhooks** | Outbound events such as task.created and invoice.paid, plus an inbound webhook | Covers small needs without custom work |

Settings → **Integrations** shows these cards together, with **Connected apps (AI)** on the same page.

**Built (9 Oct 2026):**
- **Slack** (`modules/connectors/slack`, `docs/SLACK-APP-MANIFEST.yml`): OAuth install per workspace (bot token sealed with `APP_ENCRYPTION_KEY`), every request verified with the signing secret (5-minute window), message shortcut "Create Flowbit task" → modal (title, description, due in Hinglish, assignee), `/flowbit task <text>` with the Hinglish quick-add parser, `/flowbit my day`, optional updates to a public channel. Slack users act as themselves, matched to members by email ("<name> via Slack"). Settings → Integrations → Slack.
- **Email to task** (`modules/connectors/email`): `tasks+<workspace-slug>-<token>@INBOUND_EMAIL_DOMAIN`, token = HMAC of the member (shown in Profile). `/api/inbound/email` accepts Resend inbound (Svix signature; body and attachments from Resend's receiving API) or a generic JSON post signed with `X-Flowbit-Signature`. Senders must be active members (by email). Subject → title, body → description (quoted replies cut), attachments added within the upload limit, the same message never twice.
- **Outbound webhooks** (`modules/webhooks`): Settings → Integrations → Webhooks (URL, secret sealed, events `task.created`, `task.completed`, `lead.created`, `deal.won`, `invoice.issued`, `invoice.paid`, send test, pause, remove, delivery log). Deliveries are HMAC-SHA256 signed (`X-Flowbit-Signature: t=…,v1=…`), tried after the event and retried from the messages cron (1 m, 5 m, 30 m, 2 h, 6 h). SSRF guard: http(s) only, no credentials, no private/loopback/link-local/CGNAT/reserved addresses (IPv4 and IPv6, mapped and NAT64 forms), checked at save and on the socket's DNS lookup; redirects are not followed.
- **Inbound webhook:** the existing lead webhook (`/api/webhooks/leads/[key]`) also creates a Work task when the body has `"type": "task"` (`title`, `description`, `assignee_email`, `due`, `priority`, `id` for idempotency).

---

## Open questions (answered by the owner, 9 Oct 2026)

1. **MCP access:** all paid plans plus the trial; not Free. **Built.**
2. **Folio:** draft only. **Built.**
3. **People:** read only, the directory and leave. Salary and attendance are never exposed. **Built.**
4. **Which first:** both Claude and ChatGPT; the same server serves both. Directory listing and testing with each platform are owner actions (docs/STATUS.md).
