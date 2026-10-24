# Orbit (CRM) + shared Clients: porting inventory

Written from the reference BD CRM at
`/Users/sanskaarsingh/Downloads/Code & Tools/Invoice builder Code/vistaar-crm` (FLOW.md, README.md, `app/src/**`, and the 7 Supabase migrations).
Read `docs/SPEC.md` first; it wins over this file wherever they differ. Builder agents should not need to open the reference code. Everything important is restated here in plain words. Source paths are given so you can check a detail if you need to.

Contents
1. What the reference is, and what we keep or drop
2. Reference behaviour in detail (schema, stage machine, permissions, formulas, pages, CSV)
3. Bugs, gaps and open decisions found in the reference (and what Orbit does about each)
4. Orbit design decisions (reference → Flowbit mapping)
5. Permissions and visibility
6. Data model (Mongo)
7. Domain logic (pure modules, with tests)
8. Server actions catalogue
9. Pages by route (SPEC section 6): Orbit + shared Clients
10. Shared Orbit components
11. Visual and copy notes (dark theme)
12. Seed data
13. Agent split, file ownership, what we need from other agents
14. Unit test checklist

---

## 1. The reference in one page

**What it is.** An internal business-development CRM for one BD intern ("BD Executive") and their reviewer (BD Head) at Vistaar Webx. It has a single entity: the **lead**, which runs through the whole funnel from sourced to won. It exists to make two KPIs impossible to argue about:

- **Cold %** = meetings booked ÷ leads contacted (realistic target 3 to 5%)
- **Warm %** = meetings booked ÷ leads who replied (target 15%)

The stage a lead sits in defines which denominator it belongs to, and stages cannot be claimed without evidence (a logged outreach, a logged reply). Every report derives from three tables: `leads`, `activities` (append-only), `stage_events` (append-only, written by trigger).

**Stack.** Vite + React 19 + Tailwind 4 + react-router 7, talking straight to Supabase (Postgres, RLS, triggers, RPC functions). No server code. Light theme ("Swiss ink" black/white/red). Port the logic, not the UI.

**Files (all under `app/src/`):**

| File | Lines | What it holds | Port? |
|---|---|---|---|
| `lib/types.ts` | 169 | Enums (stages, sectors, sources, activity types, channels, roles) and row shapes | Yes, as constants + Mongoose enums |
| `lib/constants.ts` | 172 | Stage order, labels, the "rule" copy per stage, ranks, sector/source/activity/channel labels, `CLOSE_REASONS`, stage colour ramp | Yes (labels, rules copy, reasons). Colours: replace with dark-theme ramp (section 11) |
| `lib/api.ts` | 390 | All Supabase calls: lead CRUD, `changeStage`, activities, stage events, the 6 reporting RPCs, KPI targets, `canCloseDeals`/`seesEveryone` | Yes, as server actions/queries |
| `lib/csv.ts` | 298 | CSV export columns, RFC-4180 parser, smart header resolver `resolveHeaders` (`COLUMN_SPECS`), `csvToLeads` | Yes: port `COLUMN_SPECS` + `resolveHeaders` verbatim; use papaparse for parsing |
| `lib/icons.ts` | 89 | lucide icon per stage/sector/source/activity/channel | Yes (icon choices) |
| `components/BrandIcons.tsx` | 69 | Hand-drawn Instagram/LinkedIn/WhatsApp SVGs (lucide dropped brand glyphs) | Yes, copy into `components/orbit/BrandIcons.tsx` |
| `components/QuickAddLead.tsx` | 330 | The 30-second lead form | Yes (becomes `/app/orbit/leads/new` + quick-add dialog) |
| `pages/Today.tsx` | 282 | Daily counters vs targets, Overdue / Due today / No next step queues, stale callout | Yes → `/app/orbit` dashboard |
| `pages/Pipeline.tsx` | 457 | Kanban by stage, drag to move (native HTML5 DnD), exit-reason modal, filters | Yes → leads board view (use `@dnd-kit`) |
| `pages/Leads.tsx` | 405 | Table, filters, CSV import preview + export | Yes → leads table view |
| `pages/LeadDetail.tsx` | 821 | Stage rail with guarded "Move to next", disqualify/lost/reopen, activity timeline, stage history, details form, milestone timestamps, log-activity modal, admin delete | Yes → `/app/orbit/leads/[id]` |
| `pages/Reports.tsx` | 642 | Cold/Warm cards with rings, cohort funnel, 14-day outreach bars, stage velocity, source and sector tables | Yes → `/app/orbit/reports` |
| `pages/Admin.tsx` | 254 | Team roles, KPI targets editor | Roles → Flowbit Settings → Roles (core). Targets → `/app/orbit/settings` |
| `pages/Login.tsx` | 332 | Supabase email/password; first sign-up becomes admin | Drop (core auth) |
| `context/AuthContext.tsx`, `lib/supabase.ts`, `lib/preview.ts`, `lib/hooks.ts` | | Supabase session, dev preview fixtures, `useDebounced(300ms)` | Drop (keep the debounce idea for search inputs) |
| `index.css`, `components/ui.tsx`, `components/Layout.tsx` | | Light-theme design system | Drop (Flowbit has its own) |

**SQL.** The 7 migrations are NOT in the repo. The only copy is in a Claude session log: `~/.claude/projects/-Users-sanskaarsingh-Downloads-Code---Tools-Invoice-builder-Code/0692a797-e5b7-48a9-b5e8-8fb2722d2317.jsonl` (tool calls `apply_migration`). The Supabase project `vistaar-bd-crm` (`eajaijqddktscbvrcfyx`) is currently paused. Everything that matters from that SQL is restated in section 2.

---

## 2. Reference behaviour in detail

### 2.1 Tables (Postgres, migration 1 `create_enums_and_core_tables`)

`profiles`: `id` (= auth user), `full_name`, `email`, `role user_role` ('intern' | 'reviewer' | 'admin', default 'intern'), `is_active`, `created_at`. A trigger creates the profile on sign-up; **the first profile ever becomes admin**, everyone else intern.

`leads`:

| Column | Type | Notes |
|---|---|---|
| company_name | text not null | the only required input |
| contact_name, designation, email, phone, linkedin_url, instagram_handle, website | text default '' | no format validation anywhere |
| sector | enum not null default 'd2c' | d2c, real_estate, dev_ngo, other |
| source | enum not null default 'instagram' | instagram, linkedin, devnetjobs, referral, inbound, event, other |
| stage | enum not null default 'new' | 9 stages, below |
| owner_id | uuid not null → profiles (on delete restrict) | "the intern" |
| reviewer_id | uuid → profiles (on delete set null) | "one owner, one reviewer, no second boss" |
| icp_score | smallint check 1..5 | quick fit rating |
| est_deal_value | numeric(12,2) | INR, optional |
| next_action | text default '' | free text "Send intro DM" |
| next_action_date | date | drives the Today queues |
| close_reason | text | set on lost/disqualified |
| notes | text default '' | |
| first_contacted_at, first_engaged_at, meeting_booked_at, closed_at | timestamptz | **derived, server-only** funnel timestamps |
| created_at, updated_at | timestamptz | updated_at bumped by trigger on every update |

Indexes: owner, stage, sector, source, next_action_date, created_at desc.

`activities` (append-only): `lead_id` (cascade), `type` (dm_sent, email_sent, call_made, follow_up, reply_received, meeting_held, note), `channel` (instagram, linkedin, email, phone, whatsapp, other; default other), `notes`, `occurred_at` (default now; **client may pass any value**), `created_by` → profiles, `created_at`. No UPDATE policy exists, so activities are immutable; admins may delete.

`stage_events` (append-only, written only by trigger): `lead_id`, `from_stage` (null on creation), `to_stage`, `reason` (copy of close_reason at the time), `changed_by` (auth.uid()), `changed_at`.

`app_settings` key/value jsonb: `kpi_targets` = `{ cold_conversion_min: 3.0, cold_conversion_max: 5.0, warm_conversion: 15.0, weekly_new_leads: 50, weekly_outreach: 150, monthly_meetings: 8 }`, and `stale_lead_days` = 7 (never read by the app; 7 is hard-coded in the UI).

### 2.2 Labels and copy (port these words)

Stage order and labels (`lib/constants.ts`): New, Contacted, Engaged, Meeting Booked, Meeting Done, Proposal Sent, Won; exits Lost, Disqualified. Rank: new 0, contacted 1, engaged 2, meeting_booked 3, meeting_done 4, proposal_sent 5, won 6, lost/disqualified 99.

Stage rule copy (shown as tooltips, empty-column text and blocked messages):

| Stage | Rule text |
|---|---|
| new | Sourced and added. No outreach yet. |
| contacted | At least one outreach logged (DM, email or call). |
| engaged | They replied. Any human response counts, positive or not. |
| meeting_booked | Invite accepted, date on record. |
| meeting_done | Meeting happened and notes are logged. |
| proposal_sent | Quotation or proposal delivered. |
| won | Closed and signed. |
| lost | Closed without a deal. Needs a reason. |
| disqualified | Not ICP, no budget or wrong fit. Needs a reason. |

Sectors: D2C (primary motion, flagged "Primary"), Real Estate, Development / NGO, Other. Sources: Instagram, LinkedIn, DevNetJobs, Referral, Inbound, Event, Other.
Activity labels: DM sent, Email sent, Call made, Follow-up, Reply received, Meeting held, Note. **Outreach types** = dm_sent, email_sent, call_made, follow_up.
Channels: Instagram, LinkedIn, Email, Phone, WhatsApp, Other.
Roles: intern = "BD Executive", reviewer = "Reviewer / BD Head", admin = "Admin".

Close reasons (fixed list; "free text here destroys the loss analysis"):
1. No budget
2. No response after 5 follow-ups
3. Not ICP / wrong segment
4. Already has an agency
5. Timing - revisit next quarter
6. Price too high
7. Went with a competitor
8. Wrong contact / gatekeeper
9. Company inactive or closed
10. Other

Icons (`lib/icons.ts`, lucide): stages new CircleDashed, contacted Send, engaged MessageSquareReply, meeting_booked CalendarPlus, meeting_done CalendarCheck, proposal_sent FileText, won Trophy, lost XCircle, disqualified Ban. Sectors d2c ShoppingBag, real_estate Building2, dev_ngo Handshake, other Sparkles. Sources instagram/linkedin brand glyphs, devnetjobs Globe, referral UserPlus, inbound Inbox, event CalendarDays, other AtSign. Activities dm MessageCircle, email Mail, call Phone, follow_up RefreshCw, reply MessageSquareReply, meeting Video, note StickyNote. Channels whatsapp brand glyph, phone Phone, email Mail, other AtSign.

Useful microcopy to reuse (reference wording, lightly trimmed):
- Quick add subtitle: "Under 30 seconds. Everything else is editable later."
- Quick add callout: "Every lead starts at **New**. It becomes Contacted once you log an outreach, and Engaged once they actually reply."
- Reviewer field hint: "One owner, one reviewer. No second boss."
- Reply activity callout: "Logging a reply unlocks the **Engaged** stage. Engaged is the denominator for the warm target, so only log this when a human actually responded."
- Exit dialog title: "Why is this lost?" / "Why is this disqualified?"; callout "A reason code is mandatory. Free text alone makes loss analysis impossible later, so pick the closest bucket first."; detail placeholder "Said budget opens again in Q3, told me to ping in April."
- Pipeline callout: "Drag a card to move it. A lead cannot become Contacted without a logged outreach, or Engaged without a logged reply. A clock icon means nothing has happened on that lead for 7+ days."
- Today empty states: "Nothing overdue. Clean slate. Everything scheduled is still in the future." / "Nothing scheduled. No follow-ups fall due today." / "Every open lead has a next step. Well run. This is the habit that keeps a pipeline alive."
- No-next-step section hint: "Open leads with no scheduled follow-up. These are the ones that quietly die."
- Stale callout: "{n} leads haven't been touched in over a week and have no follow-up date. Either schedule a next action or disqualify them. A pipeline full of ghosts makes the conversion numbers meaningless."
- Reports conversion hint: "One rate cannot describe both cold outreach and warm conversations. Cold % is measured against everyone contacted. Warm % against everyone who actually replied."
- Small-sample callout (contacted < 30): "Only {n} leads contacted so far. Below roughly 30, these percentages swing wildly on a single meeting. Read them as direction, not as performance."
- Funnel hint: "Counts every lead that ever reached a stage, not what is sitting there now."
- Volume hint: "Conversion rates mean nothing without volume behind them. Flat days here explain flat months there."
- Source hint: "Volume is not performance. The channel that produces the most leads is often not the one that produces meetings."
- Sector hint: "D2C is the primary motion. If another sector is absorbing effort without producing meetings, this is the evidence to drop it."
- Targets hint: "Editable on purpose. Targets set once and never revised are how a role gets designed to fail."

### 2.3 The stage machine (migrations 2 and 7, `enforce_stage_transition`)

Runs before any UPDATE that touches `stage`, as SECURITY DEFINER. If the stage did not change it does nothing. Otherwise, in this order (actor role read from the caller's profile; unknown = intern):

1. **Exit needs a reason**: moving to lost or disqualified with an empty `close_reason` → "A lead cannot be marked {stage} without a close reason."
2. **Closed leads are reviewer-only**: if the old stage is won, lost or disqualified and the actor is an intern → "This lead is closed. Ask your reviewer to reopen it."
3. **Deal stages are reviewer-only**: moving to proposal_sent, won or lost as an intern → "Only a reviewer or admin can move a lead to {stage}." (Interns CAN disqualify.)
4. **No skipping** (both old and new rank < 99, applies to everyone including reviewers): new rank > old rank + 1 → "Stage cannot skip from {old} to {new}. Move it one step at a time."
5. **No going back for interns**: new rank < old rank and intern → "A lead cannot be moved backwards. Ask your reviewer."
6. **Contacted needs evidence**: at least one activity of an outreach type on this lead → else "Log an outreach activity (DM, email or call) before marking this lead Contacted."
7. **Engaged needs evidence**: at least one `reply_received` activity → else "Engaged means they replied. Log a "Reply received" activity first."
8. **Derived timestamps are recomputed from the OLD row, never from the payload**:
   - start from the old values of first_contacted_at, first_engaged_at, meeting_booked_at;
   - to contacted: first_contacted_at = old value or now;
   - to engaged: first_contacted_at = old or now, AND first_engaged_at = old or now;
   - to meeting_booked: meeting_booked_at = old or now;
   - to won/lost/disqualified: closed_at = old or now; any other target: closed_at = null and, if the old stage was won/lost/disqualified (a reopen), close_reason = null.
9. A second trigger (`guard_derived_columns`) pins all four derived timestamps to their old values whenever the update does not change `stage`, so a plain PATCH cannot forge the funnel.

Other triggers: inserts must start at stage 'new' ("A new lead must start at stage "new"."); `stage_events` gets a row on insert (from null → new) and on every stage change (with reason = close_reason); updated_at = now() on every update.

Moves that are therefore legal:
- Intern: forward one step at a time from new up to meeting_done; any open stage → disqualified (with reason). Nothing else.
- Reviewer/admin: forward one step (no skipping, even for them); backward any distance; open → lost/disqualified (reason); closed (won/lost/disqualified) → any stage (reopen; no skip check because old rank is 99); won → lost is also allowed.
- Reaching meeting_booked or meeting_done needs no evidence at all.

Client side (`LeadDetail.tsx`): "Move to {next}" button where next = the following pipeline stage; disabled with a lock and a "Blocked:" callout when: next is contacted and no outreach logged ("Log a DM, email or call first."); next is engaged and no reply ("Log a "Reply received" activity first."); next is proposal_sent/won and the user is not a reviewer ("Only a reviewer can move a lead past Meeting Done."). Disqualify button for everyone while open; Mark lost for reviewers; Reopen (moves to **new**) for reviewers when lost/disqualified. The exit dialog stores `"{reason} — {detail}"` as one string in close_reason.

### 2.4 Permissions (migration 3, RLS)

- profiles: everyone signed in can read all (for owner/reviewer pickers); a user can edit their own row but not their role; admin can do anything.
- leads: read/update if owner, or reviewer on the lead, or role reviewer/admin. Insert if owner_id = self, or reviewer/admin (so interns can only create leads for themselves). Delete: admin only (cascades activities and stage events).
- activities: read if you can read the lead; insert only with created_by = self on a lead you can read; never update; admin delete.
- stage_events: read if you can read the lead; no client writes at all.
- app_settings: everyone reads; admin writes.
- UI mirrors: `canCloseDeals(role)` and `seesEveryone(role)` are both "reviewer or admin". Owner and reviewer selects are shown only to reviewers/admins; reviewer options exclude interns. Admin tab only for admin; you cannot change your own role.

### 2.5 Report formulas (migration 4, RPC functions; exact)

All percentages: `round(numerator * 100 / denominator, 1)`; **null when the denominator is 0** (shown as "—"). Date filters compare `leads.created_at` (cohort by creation date). Owner filter = `leads.owner_id` unless noted. RLS applies, so interns only ever see their own leads.

`funnel_stats(from, to, owner, sector)` over leads created in range:
- total = count(*)
- contacted = count(first_contacted_at not null)
- engaged = count(first_engaged_at not null)
- meetings_booked = count(meeting_booked_at not null)
- meetings_done = count(stage rank between 4 and 6) (current stage, not cohort)
- proposals = count(stage rank between 5 and 6) (current stage)
- won / lost / disqualified = count(stage = …) (current stage)
- cold_conversion = meetings_booked ÷ contacted; warm_conversion = meetings_booked ÷ engaged; reply_rate = engaged ÷ contacted
- UI "Open" tile = total − won − lost − disqualified.

`source_performance(from, to, owner)`: per source: total, contacted, engaged, meetings (= meeting_booked_at not null), cold = meetings ÷ contacted, warm = meetings ÷ engaged. Ordered by meetings desc, then total desc.

`sector_performance(from, to, owner)`: per sector: total, contacted, engaged, meetings, won (stage = won), warm = meetings ÷ engaged. Ordered by total desc.

`stage_velocity(owner)` (no date filter): for every stage event, span = time until the next stage event of the same lead (window `lead()` ordered by changed_at), in days. Group by the event's to_stage: avg_days = round(avg(span), 1), sample = number of spans. Events with no later event are excluded. Ordered by enum order.

`activity_volume(days = 14, owner)`: one row per calendar day for the last `days` days ending today (server date, UTC): outreach = count of outreach-type activities, replies = count reply_received, meetings = count meeting_held. **Owner filter here is `activities.created_by`** (who logged it), not the lead owner.

`today_summary(owner)`: leads_added_today (created today, by owner), outreach_today and replies_today (activities occurred today, by created_by), meetings_booked_today (stage events to meeting_booked today, by lead owner), due_today (next_action_date = today and stage rank < 5), overdue (next_action_date < today and rank < 5), stale (updated_at older than 7 days and rank < 5). The Today page fetches this but **only displays the first four counters**; it recomputes the queues itself (see 2.6).

KPI usage in the UI:
- Daily targets on Today: leads target = round(weekly_new_leads / 5), outreach target = round(weekly_outreach / 5). Stat shows "Target N met" or "{N − value} to go today".
- Cold card is "on track" when cold ≥ cold_conversion_min; warm card when warm ≥ warm_conversion. Ring fill = min(value ÷ target, 1), where the cold ring's target is cold_conversion_min.
- Source table highlights cold ≥ cold min and warm ≥ warm target.
- `monthly_meetings` is editable but never displayed.

### 2.6 Pages (what each screen does)

**Today** (`pages/Today.tsx`, default landing). Header: weekday label + big date. Scope switch "My pipeline / Whole team" for reviewers. Four counters: Leads added (vs daily target), Outreach sent (vs daily target), Replies in ("Unlocks the Engaged stage"), Meetings booked (accent when > 0: "Good day." else "The only number that closes"). Queues from open leads (not won/lost/disqualified) owned by the scope: **Overdue** (next_action_date < today, sorted oldest first, note "Nd late"), **Due today**, **No next step set** (no next_action_date; first 12, "See all" link when more than 12; note "untouched Nd" when updated ≥ 7 days ago), stale callout (updated ≥ 7 days AND no next date), "Pipeline is empty" when no open leads. Rows link to the lead and show sector icon, company, next action text, stage badge.

**Pipeline** (`pages/Pipeline.tsx`). Header "{n} leads". Filters: search company (debounced 320 ms; server search matches company, contact, email), sector, source, owner (reviewers: My leads / Whole team / each person; interns forced to own). Nine columns (7 pipeline + Lost + Disqualified), header with stage icon, label, count. Card: company, contact · designation, sector and source with icons, "Nd ago" or **"stale Nd"** (clock icon, accent) when updated_at ≥ 7 days, owner initials. Empty column shows the stage rule text. Drag a card to a column: optimistic move, server call, toast "{company} moved to {stage}" or the guard's error, then reload. Dropping on Lost/Disqualified opens the reason modal first.

**Leads** (`pages/Leads.tsx`). Header "{n} records". Filters: search (company, contact or email), stage (all 9), sector, source, owner. Table columns: Company (link), Contact (+ designation), Sector, Source, Stage, Owner, Next action, Due (accent + bold when overdue; format "02 Oct"). Import CSV (preview modal, first 50 rows, "rows skipped (no company name)", all created at New and assigned to the importer, inserted one by one, final toast "Imported N leads, M failed"). Export CSV of the current filtered list as `vistaar-leads-YYYY-MM-DD.csv` with a UTF-8 BOM. Results capped at 1000 rows, ordered by updated_at desc. Empty: "No leads match. Loosen the filters, or import a CSV of sourced leads to get started." + Import button.

**Lead detail** (`pages/LeadDetail.tsx`). Back link, company name, badges (stage, sector, source, "ICP n/5"), "Log activity" primary. Stage card: rail of the 7 pipeline stages (done / current / future styling, tooltip = rule), Move-to-next button with guards, Disqualify, Mark lost (reviewer), Reopen (reviewer, to New), close-reason callout. Left column: **Activity** list (icon, label · channel, timestamp "02 Oct, 03:30 pm", notes, author) with empty state "Nothing logged yet. This lead cannot leave New until an outreach is recorded here." and "Log the first outreach"; **Stage history** list ("Created at New", "Contacted → Engaged", timestamp). Right column: Details form (next action, next action date, contact, designation, email, phone, Instagram, LinkedIn, website, sector, source, ICP "Not rated"/1–5, est. deal value INR, owner + reviewer for reviewers, notes, Save changes); Timeline card (Created, First contacted, First reply, Meeting booked, Closed); admin "Delete lead" (browser confirm "Delete {company} and its entire history?"). Log activity modal: What happened (type), Channel, Notes ("What did you say, what did they say back"), reply callout; occurred_at = now. Closed-lead footer: "This lead is closed. Reopen it above if that was wrong." / "Ask your reviewer to reopen it if that was wrong."

**Reports** (`pages/Reports.tsx`). Range 7d / 30d (default) / 90d / All; owner select for reviewers. Sections: Conversion (two ring cards showing value, "numerator ÷ denominator", target pill), small-sample callout, Funnel bars (Leads added, Contacted with % of total, Engaged with reply rate, Meeting booked, Meeting done, Proposal sent, Won; bar width = value ÷ total, minimum 2.5% when > 0) + Lost / Disqualified / Open tiles, 14-day outreach bars (outreach with replies stacked on top), Stage velocity table, Source table, Sector table ("Primary" pill on D2C).

**Admin** (`pages/Admin.tsx`). Team table (name, email, role select, joined), KPI targets form (cold min %, cold max % step 0.5, warm %, new leads/week, outreach/week, meetings/month).

### 2.7 CSV

Export columns (`leadsToCsv`): Company, Contact, Designation, Email, Phone, LinkedIn, Instagram, Website, Sector (label), Source (label), Stage (label), Owner (name), ICP Score, Est Value, Next Action, Next Action Date, Close Reason, Created (en-IN date). Escape cells containing `"`, `,` or newline by quoting and doubling quotes. Prefix the file with a BOM so Excel reads UTF-8.

Import header resolution (`resolveHeaders`, port this exactly): normalise each header (trim, lower-case, replace runs of `_ - .` with a space, collapse spaces). Each field claims at most one column, and a claimed column is never reused. **Pass 1** exact matches, in this field order; **pass 2** substring ("fuzzy") matches for fields still unresolved, same order. Order matters: company before contact (so "Company Name" is not taken as the contact), linkedin/instagram before website (so "LinkedIn URL" is not taken by the "url" alias).

| Field | Exact aliases | Fuzzy (substring) aliases |
|---|---|---|
| company | company, company name, brand, brand name, account, organisation, organization, org, business, business name, firm | company, brand name, organisation, organization, business name |
| linkedin | linkedin, linkedin url, linkedin profile, linkedin link, li url | linkedin |
| instagram | instagram, instagram handle, instagram url, ig, ig handle, insta, handle | instagram, insta |
| email | email, email address, e mail, mail, email id | email |
| phone | phone, phone number, mobile, mobile number, contact number, number, whatsapp, tel | phone, mobile, whatsapp |
| designation | designation, title, job title, role, position | designation, job title |
| contact | contact, contact name, name, person, full name, poc, contact person, founder | contact name, contact person, poc |
| website | website, website url, url, site, web, domain, web address | website, domain |
| sector | sector, industry, vertical, category, niche | sector, industry, vertical |
| source | source, lead source, channel, found via | source, channel |
| notes | notes, note, remark, remarks, comment, comments, description | notes, remark, comment |

Rows without a company value are skipped and counted. Sector values (lower-cased, not otherwise normalised) map `d2c`, `real estate`, `realestate`, `development / ngo`, `ngo`, `dev_ngo`, `other`; anything else becomes **d2c**. Source values map the seven keys; anything else becomes `other`. Every imported lead is created at New.

---

## 3. Bugs, gaps and open decisions in the reference

| # | Finding | What Orbit does |
|---|---|---|
| 1 | Close reason saved as one string `"Reason — detail"`, so grouping by reason code is impossible | Store `closeReason: { code, note }` separately |
| 2 | Funnel `meetings_done`, `proposals`, `won` count the **current** stage, contradicting the "ever reached" claim: a lead that reached Meeting Done and was then lost vanishes from Meeting Done | Server-stamped `meetingDoneAt`, `convertedAt`; every funnel step is cohort-based ("ever reached") |
| 3 | All "today" logic is UTC: Postgres `current_date` and JS `toISOString().slice(0,10)`. Wrong from 00:00 to 05:30 IST | Every day boundary uses Asia/Kolkata (`todayIST()`, `$dateToString` with `timezone: 'Asia/Kolkata'`) |
| 4 | Today page ignores the server's due/overdue/stale counts and recomputes with different rules (client includes proposal_sent; server excludes rank ≥ 5). "Stale" uses `updated_at`, so editing a typo resets staleness and hides ghost leads | One definition (section 7.3). Staleness uses `lastActivityAt` (creation, logged activity, stage change), not edits |
| 5 | FLOW says Meeting Booked needs "date on record" and Meeting Done needs "notes logged", but neither is stored or enforced; there is no meeting date field at all | Meeting Booked requires a meeting date (creates a planned meeting activity); Meeting Done requires a logged meeting with notes |
| 6 | Won leads still show Disqualify / Mark lost (rank 6 < 99) and cannot be reopened from the UI; the database lets a reviewer move won → lost | Leads no longer reach Won (deals do). Closed leads show only Reopen (reviewer) |
| 7 | Owner filter means two different things: volume and today's outreach/replies filter by who logged the activity; funnel/source/sector by lead owner | Keep both but name them: "Effort" numbers by who logged; "Pipeline" numbers by lead owner. Say so in tooltips |
| 8 | CSV: unknown sector silently becomes D2C (inflates the primary sector); FLOW's label "Development & NGO" is not recognised; owner is always the importer, no reviewer; rows inserted one at a time | Unknown → `other` and counted in the preview; match against settings labels and keys; owner/reviewer pickable (reviewer powers); `insertMany` in batches |
| 9 | `monthly_meetings` target and `stale_lead_days` setting exist but are never used; `p_to` is never passed; FLOW's pipeline "age" filter and the leads "bulk edit" were never built | Monthly meetings shown on dashboard; staleDays is a real setting; custom date range; "Stale only" filter; bulk assign/disqualify |
| 10 | Activity `occurred_at` is client-writable on insert (outreach can be backdated freely) while stage timestamps are protected | `occurredAt` may be backdated at most 7 days, never in the future; `createdAt` always kept |
| 11 | Stage velocity ignores the date range and includes spans that start at exit stages (reopen spans counted as "Lost" velocity) | Only spans starting at open lead stages; span start must fall in the report range |
| 12 | Volume chart stacks replies on outreach but scales both to max outreach, so a bar can overflow its box | Scale to max(outreach + replies) |
| 13 | README open item: sequential stages force inbound leads to be falsely marked Contacted (encourages fake outreach logs) | Sources have a `warm` flag (default on for Inbound, Referral, Event). A warm-source lead may go New → Engaged directly (still needs a logged reply); contactedAt is stamped together with engagedAt, exactly as the reference does when reaching Engaged |
| 14 | README open item: report filter uses created_at and there is no maturity window, so recently contacted leads drag Cold % down while volume ramps | Keep cohort-by-creation (simple and consistent), but show a note under the Cold card: "{n} of these leads were contacted in the last 14 days and may still convert" |
| 15 | The guard blocks reviewers from skipping stages too (code comment says interns only) | Keep: nobody skips (except rule 13) |
| 16 | Results capped at 1000 rows with no pagination | Paginate (25 per page) and export through a route handler |
| 17 | Supabase project is paused and the SQL lives only in a session log | Nothing to do; section 2 is the record |

---

## 4. Orbit design decisions

The reference has one entity running from sourced to won. Flowbit's SPEC has **Lead** (prospecting) and **Deal** (money), shared **Clients**, and configurable deal stages. Mapping:

| Reference | Orbit |
|---|---|
| lead stages new → meeting_done | Lead stages, same keys, same guards (fixed, not configurable, because Cold % and Warm % are defined by them) |
| proposal_sent, won | Move to the **Deal**. A lead at Meeting Done is **converted**: creates or links a Client and creates a Deal. Lead stage becomes `converted` (closed, success) |
| lost, disqualified | Stay as lead exits (lost needs reviewer powers, disqualified does not). After conversion, losing happens on the deal |
| est_deal_value numeric | `valuePaise` integer (lib/money) on lead and deal |
| next_action + next_action_date | **Planned activities** (follow-ups, calls, meetings) with a due date; the lead/deal keeps a denormalised `nextFollowUp` for lists and queues |
| contact fields on the lead | Stay on the lead while prospecting. On conversion they become a `Client.contacts` entry (primary). Orbit contacts = `Client.contacts` (no separate Contact collection) |
| activities | `Activity` with `status: done | planned | cancelled`, linked to lead, deal and/or client |
| stage_events | `StageEvent` for leads and deals (`entity` field) |
| app_settings kpi_targets, stale days | `OrbitSettings` (one document per org): deal stages, sources, sectors, reasons, targets, staleDays, default reviewer |
| roles intern/reviewer/admin | Flowbit permissions (section 5). Built-in `sales` gets everything; a custom role "BD executive" reproduces the intern limits |
| Today page | `/app/orbit` dashboard (+ SPEC's pipeline value, won this month) |
| Pipeline page | `/app/orbit/leads?view=board` |
| Leads page | `/app/orbit/leads` (table, default) |
| Reports | `/app/orbit/reports` (+ by owner, won/lost reasons, deal pipeline) |
| Admin targets | `/app/orbit/settings?tab=targets` |

Stage ranks in Orbit: new 0, contacted 1, engaged 2, meeting_booked 3, meeting_done 4, converted 5, lost 99, disqualified 99. Open lead stages = rank 0–4. Closed = converted, lost, disqualified.

Deal stages (configurable in settings; defaults): `discovery` "Discovery" 20%, `proposal` "Proposal sent" 40%, `negotiation` "Negotiation" 70%. Terminal and fixed: `won` (100%), `lost` (0%).

---

## 5. Permissions and visibility

Proposed permission keys (the foundation's `lib/permissions.ts` is authoritative; if it already defines Orbit keys under other names, use those and keep these meanings):

| Key | Meaning |
|---|---|
| `orbit.read` | Open Orbit pages. See leads/deals where you are owner (or reviewer, for leads). Reports and dashboard scoped to you |
| `orbit.viewAll` | See every lead, deal and activity in the workspace; "Whole team" / per-person scope selectors |
| `orbit.write` | Create leads and deals; edit leads/deals you own or review; log and schedule activities; move a lead forward up to Meeting Done; disqualify; convert; move your deals between open stages; import CSV |
| `orbit.close` | Reviewer powers: mark leads Lost, move leads backwards, reopen closed leads, mark deals Won/Lost, reopen deals, reassign owner/reviewer, edit any lead or deal |
| `orbit.admin` | Orbit settings (deal stages, sources, sectors, reasons, targets, general); delete leads, deals and logged activities |
| `clients.read` | Clients list and detail |
| `clients.write` | Create/edit clients and their contacts, change client status, delete unlinked clients |

Role mapping (request to foundation):

| Role | Orbit | Clients |
|---|---|---|
| owner, admin | all five | read, write |
| sales ("Orbit full") | all five | read, write |
| manager ("Orbit read") | read, viewAll | read |
| finance | (none) | read, write (Folio invoices need clients) |
| hr_admin, hr_exec | (none) | (none) |
| member | (none) | read (client names on projects) |
| custom "BD executive" (seeded) | read, write | read |

Rules (implement once in `modules/orbit/scope.ts`; use everywhere, server side):
- `leadScope(ctx)`: `ctx.can('orbit.viewAll') ? {} : { $or: [{ ownerId: me }, { reviewerId: me }] }` where `me = ctx.member._id`.
- `dealScope(ctx)`: `ctx.can('orbit.viewAll') ? {} : { ownerId: me }`.
- `activityScope(ctx)`: viewAll → `{}`; else activities whose `assigneeId = me` or `createdBy = me`, or whose lead/deal is in your scope (query: first get in-scope lead and deal ids for the request, or filter the page's entity explicitly).
- `canEditLead(ctx, lead)`: `ctx.can('orbit.close') || (ctx.can('orbit.write') && (lead.ownerId == me || lead.reviewerId == me))`.
- `canEditDeal(ctx, deal)`: `ctx.can('orbit.close') || (ctx.can('orbit.write') && deal.ownerId == me)`.
- Detail pages call `notFound()` when the record is outside scope (do not reveal it exists; reference copy: "It may have been deleted, or it belongs to someone else on the team").
- Owner and reviewer pickers: owner = active members with `orbit.write`; reviewer = active members with `orbit.close`. Without `orbit.close` the owner is forced to yourself and the reviewer to the default reviewer.
- Clients pages require `ctx.has('work') || ctx.has('orbit') || ctx.has('folio')` plus `clients.read`. Tabs for products the workspace doesn't have are hidden.

---

## 6. Data model (Mongo, Mongoose 9)

All models apply the `tenant` plugin (adds `orgId` + timestamps). Member references are `ObjectId` refs to `Member`. Day-level dates are `'YYYY-MM-DD'` strings; instants are `Date`. Money is integer paise.

### 6.1 `models/orbit/Lead.ts`

| Field | Type | Rules |
|---|---|---|
| orgId | ObjectId | tenant plugin |
| companyName | string, required | trimmed, 1–120 |
| contactName | string, default '' | ≤ 80 |
| designation | string, default '' | ≤ 80 |
| email | string, default '' | lower-cased, valid email when present |
| phone | string, default '' | 7–15 digits; `+`, spaces, `-` allowed |
| linkedinUrl | string, default '' | normalised to `https://…`, must contain `linkedin.com` |
| instagramHandle | string, default '' | stored without `@` and without URL prefix, `/^[A-Za-z0-9._]{1,30}$/`; displayed as `@handle` |
| website | string, default '' | normalised to `https://…` |
| sector | string, required | key from `OrbitSettings.sectors` |
| source | string, required | key from `OrbitSettings.sources` |
| stage | enum, required, default 'new' | `new | contacted | engaged | meeting_booked | meeting_done | converted | lost | disqualified` |
| ownerId | ObjectId Member, required | |
| reviewerId | ObjectId Member \| null | |
| icpScore | number \| null | int 1–5 |
| valuePaise | number \| null | int ≥ 0, ≤ 10^12 |
| notes | string, default '' | ≤ 2000 |
| closeReason | `{ code: string, note: string }` \| null | set on lost/disqualified, cleared on reopen |
| meetingAt | Date \| null | the booked meeting time (set when moving to meeting_booked) |
| contactedAt | Date \| null | **server-only**, first time contacted |
| engagedAt | Date \| null | server-only |
| meetingBookedAt | Date \| null | server-only (first time reached) |
| meetingDoneAt | Date \| null | server-only |
| convertedAt | Date \| null | server-only |
| closedAt | Date \| null | server-only; set on converted/lost/disqualified; null when open |
| stageChangedAt | Date | server-only; time of last stage change (age in stage) |
| lastActivityAt | Date | server-only; creation, any done activity, any stage change |
| nextFollowUp | `{ activityId: ObjectId, title: string, type: string, dueDate: string, dueTime?: string }` \| null | server-only, see 7.4 |
| clientId | ObjectId Client \| null | set on conversion |
| dealId | ObjectId Deal \| null | set on conversion |
| createdBy | ObjectId Member | |
| createdAt, updatedAt | Date | tenant plugin |

Indexes: `{ orgId: 1, stage: 1, updatedAt: -1 }`, `{ orgId: 1, ownerId: 1, stage: 1 }`, `{ orgId: 1, reviewerId: 1 }`, `{ orgId: 1, 'nextFollowUp.dueDate': 1 }`, `{ orgId: 1, createdAt: -1 }`, `{ orgId: 1, lastActivityAt: 1 }`.

Server actions never accept the server-only fields from input (strip them in the zod schema by not declaring them).

### 6.2 `models/orbit/Deal.ts` (SPEC contract fields first)

| Field | Type | Rules |
|---|---|---|
| orgId | ObjectId | |
| title | string, required | 2–140 |
| clientId | ObjectId Client \| undefined | optional in schema (SPEC contract); the New deal form requires it |
| leadId | ObjectId Lead \| undefined | set when created by conversion |
| valuePaise | number, required | int ≥ 0 |
| stage | string, required | a deal stage key from settings, or `won` / `lost` |
| probability | number, required | int 0–100; defaults to the stage's probability; won 100, lost 0 |
| ownerId | ObjectId Member, required | |
| expectedCloseDate | string 'YYYY-MM-DD' \| undefined | |
| status | enum 'open' \| 'won' \| 'lost', required | derived from stage, stored for queries |
| contactId | ObjectId \| undefined | `_id` of an entry in the client's `contacts` |
| source | string \| undefined | settings source key (copied from lead on conversion) |
| sector | string \| undefined | settings sector key (copied from lead) |
| lostReason | `{ code, note }` \| null | required when lost |
| wonReason | string \| null | optional key from settings.wonReasons |
| closedAt | Date \| null | server-only |
| stageChangedAt | Date | server-only |
| lastActivityAt | Date | server-only |
| nextFollowUp | same shape as Lead | server-only |
| notes | string, default '' | ≤ 2000 |
| createdBy | ObjectId Member | |

Indexes: `{ orgId: 1, status: 1, stage: 1 }`, `{ orgId: 1, ownerId: 1, status: 1 }`, `{ orgId: 1, clientId: 1 }`, `{ orgId: 1, leadId: 1 }`, `{ orgId: 1, closedAt: -1 }`, `{ orgId: 1, expectedCloseDate: 1 }`.

Folio links: do not store Folio ids on the deal. Folio should store `dealId?` on its Quote and Invoice; the deal page reads them (section 13).

### 6.3 `models/orbit/Activity.ts`

| Field | Type | Rules |
|---|---|---|
| orgId | ObjectId | |
| leadId | ObjectId \| null | at least one of leadId, dealId, clientId |
| dealId | ObjectId \| null | |
| clientId | ObjectId \| null | always set for deal activities; set on lead activities at conversion |
| contactId | ObjectId \| null | a `Client.contacts` entry |
| type | enum | `dm | email | call | follow_up | reply | meeting | note` |
| status | enum | `done | planned | cancelled` |
| channel | enum | `instagram | linkedin | email | phone | whatsapp | video | in_person | other` |
| title | string, default '' | required when planned (≤ 140); optional when done |
| notes | string, default '' | ≤ 4000; required for a done `meeting` ("Add what was discussed"), optional otherwise |
| occurredAt | Date \| null | required when done; ≤ now, ≥ now − 7 days |
| dueDate | string 'YYYY-MM-DD' \| null | required when planned |
| dueTime | string 'HH:mm' \| null | optional |
| meetingLink | string \| null | optional URL, meetings only |
| assigneeId | ObjectId Member | who should do it (planned) or who did it (done); default the lead/deal owner, or the logger for done |
| createdBy | ObjectId Member | who logged it |
| completedAt | Date \| null | when a planned activity was marked done |
| cancelledAt | Date \| null | |
| cancelReason | string \| null | ≤ 200 |

Rules: `reply` and `note` can only be `done` (never planned). A done activity is immutable (no edit; delete only with `orbit.admin`). A planned activity can be edited, rescheduled, completed (becomes done, keeps its `_id`) or cancelled.
Done-activity labels: DM sent, Email sent, Call made, Follow-up sent, Reply received, Meeting held, Note. Planned labels: DM, Email, Call, Follow-up, Meeting.
**Outreach** = done and type in `dm, email, call, follow_up`. **Reply** = done and type `reply`. **Meeting held** = done and type `meeting`.
Reference type mapping: dm_sent→dm, email_sent→email, call_made→call, follow_up→follow_up, reply_received→reply, meeting_held→meeting, note→note.

Indexes: `{ orgId: 1, leadId: 1, occurredAt: -1 }`, `{ orgId: 1, dealId: 1, occurredAt: -1 }`, `{ orgId: 1, clientId: 1, occurredAt: -1 }`, `{ orgId: 1, contactId: 1 }`, `{ orgId: 1, status: 1, dueDate: 1, assigneeId: 1 }`, `{ orgId: 1, status: 1, type: 1, occurredAt: -1 }`, `{ orgId: 1, createdBy: 1, occurredAt: -1 }`.

### 6.4 `models/orbit/StageEvent.ts` (append-only)

| Field | Type |
|---|---|
| orgId | ObjectId |
| entity | enum 'lead' \| 'deal' |
| entityId | ObjectId |
| fromStage | string \| null (null = created) |
| toStage | string |
| reasonCode | string \| null |
| reasonNote | string \| null |
| changedBy | ObjectId Member \| null (null for seed/system) |
| changedAt | Date (default now) |

Indexes: `{ orgId: 1, entity: 1, entityId: 1, changedAt: 1 }`, `{ orgId: 1, entity: 1, toStage: 1, changedAt: -1 }`. Only Orbit's stage actions write it, inside the same transaction as the stage change. No update or delete action exists (rows go only when their lead/deal is deleted by an admin).

### 6.5 `models/orbit/OrbitSettings.ts` (one per org, unique index on orgId)

```
dealStages:  [{ key, label, probability (0-100 int), color (preset name), order }]   default: discovery 20, proposal 40, negotiation 70
sources:     [{ key, label, warm: boolean, active: boolean, order }]
             default: instagram, linkedin, email_outreach "Email outreach", referral (warm), inbound (warm), event (warm), website "Website", other
sectors:     [{ key, label, primary: boolean, active: boolean, order }]
             default: d2c "D2C" (primary), real_estate "Real Estate", dev_ngo "Development & NGO", other "Other"
lostReasons: [{ key, label, active, order }]   default: the 10 reference close reasons (2.2), keys slugified; last is `other`
wonReasons:  [{ key, label, active, order }]   default: referral_trust "Referral or trust", proof "Case studies and proof", price_fit "Price fit", speed "Speed of response", other "Other"
targets: { coldMinPct: 3, coldMaxPct: 5, warmPct: 15, weeklyNewLeads: 50, weeklyOutreach: 150, monthlyMeetings: 8 }
staleDays: 7
defaultReviewerId: ObjectId Member | null
```

`getOrbitSettings(ctx)` returns the org's document, creating it with defaults on first read (`findOneAndUpdate({}, { $setOnInsert: defaults }, { upsert: true, new: true })` through `ctx.db`). Keys are slugs generated from the label when an item is added and never change afterwards (labels can be renamed). Items in use are deactivated, not deleted (section 9.11). Lead stages are not stored (fixed in code).

### 6.6 Core `Client` (foundation model, Orbit owns the pages)

SPEC shape: `{ name, displayName?, kind 'company'|'individual', email?, phone?, website?, gstin?, pan?, state? (2-letter), billingAddress { line1, line2, city, state, pincode, country }, contacts [{ name, email, phone, role, primary }], ownerId?, tags [], source?, status 'lead'|'active'|'inactive', notes? }`.
Orbit relies on: contacts subdocuments having their default `_id` (Mongoose adds it unless disabled; ask foundation to keep it), `status` transitions (new client from conversion = 'lead'; set to 'active' when a deal is won), `source` = settings source key when created from a lead.

---

## 7. Domain logic (pure, in `modules/orbit/`, unit-tested)

### 7.1 `leadStage.ts`: transition check

```
checkLeadTransition(input) -> { ok: true, patch } | { ok: false, error }

input = {
  lead: { stage, source, contactedAt, engagedAt, meetingBookedAt, meetingDoneAt, convertedAt, closedAt },
  to: LeadStage,
  can: { write: boolean, close: boolean },
  evidence: { hasOutreach, hasReply, hasMeetingHeld },   // done activities on this lead
  sourceIsWarm: boolean,                                  // settings.sources[lead.source].warm
  reasonCode?: string, reasonNote?: string,               // for lost / disqualified
  meetingAt?: Date,                                       // for meeting_booked
  reopenTo?: LeadStage,                                   // stage before closing (from last StageEvent)
  via: 'move' | 'convert' | 'reopen',
  now: Date
}
```

Rules, in order (error copy in quotes):
1. `to === lead.stage` → "This lead is already {Stage}."
2. `to === 'converted'` and `via !== 'convert'` → "Use Convert to turn this lead into a client and a deal." `via === 'convert'` and `lead.stage !== 'meeting_done'` → "Convert a lead after its meeting is done."
3. Lead is closed (converted, lost, disqualified):
   - converted → "This lead is converted. Continue on the deal." (no reopen; lose the deal instead)
   - lost/disqualified: requires `via === 'reopen'` and `can.close` → else "This lead is closed. Ask your reviewer to reopen it." Target = `reopenTo` (the stage it was closed from; fallback 'new').
4. `to` is lost or disqualified: requires a `reasonCode` that is an active lost-reason key → "Pick a reason before marking this lead {Lost|Disqualified}." If code is `other`, `reasonNote` is required → "Add a short note for 'Other'." Lost requires `can.close` → "Only a reviewer can mark a lead Lost." Disqualified requires `can.write`.
5. Both open: backwards (`rank(to) < rank(from)`) requires `can.close` → "A lead can't move backwards. Ask your reviewer." Forward more than one step → "Move one step at a time: {From} → {Next}." **Exception:** from `new` to `engaged` is allowed when `sourceIsWarm` (inbound/referral/event by default).
6. Evidence (checked for any arrival, forward or backward):
   - contacted: `hasOutreach` → "Log an outreach (DM, email or call) before marking this lead Contacted."
   - engaged: `hasReply` → "Engaged means they replied. Log a 'Reply received' activity first."
   - meeting_booked: `meetingAt` present → "Add the meeting date before marking Meeting booked." (when moving backward to meeting_booked, use the existing meetingAt)
   - meeting_done: `hasMeetingHeld` → "Log the meeting and its notes before marking Meeting done."
7. Build `patch` (timestamps from the OLD values, never from input; `t = now`):
   - always: `stage = to`, `stageChangedAt = t`, `lastActivityAt = t`
   - contacted: `contactedAt = old ?? t`
   - engaged: `contactedAt = old ?? t`, `engagedAt = old ?? t`
   - meeting_booked: `meetingBookedAt = old ?? t`, `meetingAt = input`
   - meeting_done: `meetingDoneAt = old ?? t`
   - converted: `convertedAt = old ?? t`
   - converted/lost/disqualified: `closedAt = old ?? t`; lost/disqualified also `closeReason = { code, note }`
   - any open target: `closedAt = null`, `closeReason = null` (this is the reopen clean-up)
   - Moving backwards never clears milestone timestamps (the funnel is "ever reached").

Also export `nextLeadStage(stage)` (the next open stage, or null at meeting_done), `blockedReason(...)` (same rules, short UI wording: "Log a DM, email or call first.", "Log a 'Reply received' activity first.", "Add the meeting date first.", "Log the meeting first.", "Only a reviewer can …"), `LEAD_STAGE_RANK`, `OPEN_LEAD_STAGES`, `isOpenLead(stage)`. The client imports the same module to show the lock + reason on the "Move to …" button; the server re-checks.

### 7.2 `dealStage.ts`

```
checkDealTransition({ deal: { stage, status, closedAt }, to, can, stages, reasonCode?, reasonNote?, wonReason?, reopenTo?, via: 'move'|'win'|'lose'|'reopen', now })
```
1. Same stage → "This deal is already in {Stage}."
2. Closed deal (won/lost): only `via === 'reopen'` with `can.close`; target = `reopenTo` (last open stage from StageEvent; fallback first open stage). Error: "This deal is closed. Ask a reviewer to reopen it."
3. To `won` (via 'win'): `can.close` → "Only a reviewer can mark a deal Won." Patch: status 'won', probability 100, closedAt = t, wonReason (optional, must be an active key if present), lostReason null.
4. To `lost` (via 'lose'): `can.close`; reasonCode required (active lost-reason key; note required for `other`). Patch: status 'lost', probability 0, closedAt t, lostReason.
5. Between open stages: allowed in any direction for `can.close` or the deal owner with `can.write`. Patch: probability = target stage default, stageChangedAt, lastActivityAt.
6. Reopen patch: status 'open', stage = target, probability = its default, closedAt null, lostReason null, wonReason null.

### 7.3 `metrics.ts` (formulas)

- `pct1(n, d)` = `d > 0 ? Math.round(n * 1000 / d) / 10 : null`.
- `funnel(counts)` from cohort counts `{ total, contacted, engaged, meetingsBooked, meetingsDone, converted, won, lost, disqualified }` returns those plus `open = total − converted − lost − disqualified`, `cold = pct1(meetingsBooked, contacted)`, `warm = pct1(meetingsBooked, engaged)`, `replyRate = pct1(engaged, contacted)`, `contactRate = pct1(contacted, total)`.
- `targetState(value, target)` → `{ ok: value !== null && value >= target, fill: value === null ? 0 : Math.min(value / target, 1) }`. Cold uses `coldMinPct` as target; warm uses `warmPct`. Label cold target as "3–5%" (min–max).
- `dailyTarget(weekly, workWeekDays)` = `Math.round(weekly / workWeekDays)` (reference divides by 5; Flowbit uses `org.workWeek.length`, which is often 6). `targetSub(value, target)` = value ≥ target ? "Target {t} met" : "{t − value} to go today".
- `weighted(valuePaise, probability)` = `Math.round(valuePaise * probability / 100)`.
- `winRate(won, lost)` = `pct1(won, won + lost)`; value win rate = `pct1(wonPaise, wonPaise + lostPaise)`.
- `isStale(lastActivityAt, staleDays, now)` = `now − lastActivityAt ≥ staleDays days` (only for open leads/deals).
- `daysAgo(date, now)` = floor((now − date) / 86 400 000).
- `deltaPct(current, previous)` = previous > 0 ? round((current − previous) / previous × 100) : null (for "±%" pills).
- `agingBucket(dueDate, today)`: not due / 1–30 / 31–60 / 61–90 / 90+ days past due (client ledger tab; reuse Folio's helper if Folio exports one).
- `SMALL_SAMPLE = 30` (contacted count below which the small-sample callout shows). `MATURITY_DAYS = 14`.

**Definitions used by the dashboard and Activities page (one source of truth):**
- Open lead = stage rank 0–4. Open deal = status 'open'.
- Overdue = planned activity with `dueDate < todayIST`. Due today = planned with `dueDate == todayIST`. Upcoming = planned with `dueDate > todayIST`.
- No next step = open lead (or open deal) with `nextFollowUp == null`.
- Stale = open lead/deal with `isStale(lastActivityAt)`. The ghost callout counts open leads that are stale AND have no next step.

### 7.4 `followUps.ts`

`refreshNextFollowUp(ctx, { leadId?, dealId? }, session?)`: find the earliest planned activity for that lead (or deal) sorted by `dueDate` asc, then `dueTime` asc (null last), then `createdAt`; set `nextFollowUp` to `{ activityId, title, type, dueDate, dueTime }` or null. Call it after every schedule, complete, reschedule, cancel and delete of a planned activity, and after conversion. Pure helper `pickNext(activities)` is unit-tested.

### 7.5 `csvImport.ts`

Port `normalise`, `COLUMN_SPECS`, `resolveHeaders` exactly (2.7). `mapRows(rows, settings)` returns `{ rows: ImportRow[], skippedNoCompany, mappedToOther: { sector, source } }`. Sector/source value matching: case-insensitive against setting keys and labels, plus the reference aliases (real estate, realestate, ngo, development & ngo, development / ngo, dev_ngo); unknown → `other` (counted). Parse files with `papaparse` (`header: false`, `skipEmptyLines: 'greedy'`), first row = headers. Max 2000 data rows per import ("This file has 3,400 rows. Import at most 2,000 at a time.").

---

## 8. Server actions catalogue

All built with `action(schema, fn, { perm, product: 'orbit' })` from `lib/actions.ts`, under `modules/orbit/*.actions.ts`. Every write that changes more than one document runs in a transaction (lib/db helper if the foundation provides one; else `mongoose.connection.transaction`). `revalidatePath` the list and detail pages touched. Toast copy names what happened to what.

### 8.1 Leads (`leads.actions.ts`)

| Action | Input (zod) | Perm | Effect |
|---|---|---|---|
| `createLead` | companyName, contactName?, designation?, email?, phone?, linkedinUrl?, instagramHandle?, website?, sector, source, icpScore?, valueRupees?, notes?, ownerId?, reviewerId?, followUp? `{ title, dueDate, dueTime? }`, allowDuplicate? | orbit.write | Stage forced to `new`. owner = input only with orbit.close, else self; reviewer = input (orbit.close) or settings.defaultReviewerId. Duplicate check: an open lead with the same companyName (case-insensitive, trimmed) or same email → `{ ok:false, fieldErrors: { companyName: "An open lead for 'X' already exists (owner Aditi Singh)." } }` unless `allowDuplicate`. Writes Lead, StageEvent (null → new), optional planned follow-up, nextFollowUp. Audit `orbit.lead.create`. Notify reviewer if reviewer ≠ actor ("New lead 'X' for you to review"). Toast "Lead 'X' added". Redirect `/app/orbit/leads/{id}` (unless "Save and add another") |
| `updateLead` | id + any editable profile field (not stage, not timestamps) | orbit.write + canEditLead; ownerId/reviewerId changes need orbit.close | `$set` only provided fields. Audit summary lists changed fields ("Owner changed from Aditi Singh to Rohan Mehta"). Notify new owner/reviewer. Does NOT touch lastActivityAt |
| `moveLeadStage` | id, fromStage, toStage, reasonCode?, reasonNote?, meetingDate?, meetingTime?, meetingLink?, meetingNotes? | orbit.write + canEditLead | Transaction: load lead; evidence counts via `Activity.exists`; if toStage = meeting_booked, build meetingAt from date+time (IST; time default 11:00) and create a planned `meeting` activity (title "Meeting with {contact or company}", dueDate/dueTime, meetingLink, assignee owner); if toStage = meeting_done and no done meeting exists but `meetingNotes` given, complete the earliest planned meeting (or create a done meeting) with those notes first; run `checkLeadTransition`; `findOneAndUpdate({ _id, stage: fromStage }, { $set: patch })`; if no match → "This lead changed while you were looking at it. Refresh and try again."; insert StageEvent (reasonCode/note); refreshNextFollowUp. Audit `orbit.lead.stage`. Notify reviewer when a lead reaches meeting_done ("'X' is ready to convert"). Toast "Lead 'X' moved to Engaged" |
| `reopenLead` | id | orbit.close | Target = fromStage of the last StageEvent that closed it; same pipeline as move with `via: 'reopen'` |
| `convertLead` | id, client `{ mode: 'new' } | { mode: 'existing', clientId }`, deal `{ title, valueRupees, stage, expectedCloseDate?, ownerId? }` | orbit.write + canEditLead | Transaction: check `via: 'convert'`; new client: `{ name: companyName, kind: 'company', email, phone, website, source, ownerId: lead.ownerId, status: 'lead', contacts: [primary contact from the lead if it has a contact name, email or phone] }` (GSTIN uniqueness check only if provided; none here); existing client: add the lead's contact to `contacts` unless one with the same email (or same name when no email) exists; create Deal (leadId, clientId, contactId, source, sector, stage, probability from stage, ownerId default lead owner, status open) + StageEvent (deal: null → stage); lead patch (converted, convertedAt, closedAt, clientId, dealId) + StageEvent (meeting_done → converted); `Activity.updateMany({ leadId }, { $set: { clientId } })`; planned activities of the lead also get `dealId`; refresh nextFollowUp for both. Audit `orbit.lead.convert`. Toast "'X' converted: client and deal created". Redirect to the deal |
| `deleteLead` | id | orbit.admin | Refuse when converted ("This lead became a deal. Delete or lose the deal instead."). Delete lead + its activities + stage events. Audit. Toast "Lead 'X' deleted" |
| `importLeads` | rows (array ≤ 2000 of ImportRow), ownerId?, reviewerId? | orbit.write | Validate each row with the lead schema (bad rows reported, not fatal). Skip duplicates of open leads (company or email) and duplicates inside the file. `insertMany` in batches of 500 + StageEvents. Audit one entry "Imported 132 leads (8 skipped)". Toast "Imported 132 leads; 8 skipped (5 duplicates, 3 without a company)" |
| `bulkAssignLeads` | ids (≤ 200), ownerId?, reviewerId? | orbit.close | `updateMany` within scope; notify the new owner once ("12 leads assigned to you") |
| `bulkDisqualifyLeads` | ids (≤ 200), reasonCode, reasonNote? | orbit.write | Per lead: must be open and editable; run the move logic; summary toast "Disqualified 8 leads; 2 skipped (closed or not yours)" |

### 8.2 Activities (`activities.actions.ts`)

| Action | Input | Perm | Effect |
|---|---|---|---|
| `logActivity` | leadId? / dealId? / clientId?, contactId?, type, channel, notes?, occurredAt?, followUp? `{ title, type, dueDate, dueTime? }` | orbit.write; must be able to edit the related lead/deal (client-only activities: clients.read + orbit.write) | Creates a done activity (occurredAt default now; not future; not older than 7 days → "Pick a time in the last 7 days"). Meeting requires notes ("Add what was discussed"). For a deal, `clientId` = deal.clientId. Updates related `lastActivityAt`. Optional follow-up → planned activity + refreshNextFollowUp. Converted lead → refuse "This lead is converted. Log it on the deal." Returns `data.unlocks` = the next lead stage if this activity just made it reachable (outreach on a New lead → contacted; reply on Contacted, or on a New lead with a warm source → engaged) so the toast can offer "Move to Engaged". Toast "Reply received logged for 'X'" |
| `scheduleActivity` | related ids, type (dm/email/call/follow_up/meeting), title, dueDate (≥ today), dueTime?, assigneeId?, meetingLink?, notes? | orbit.write + edit right on related | Creates planned activity; refreshNextFollowUp; notify assignee if not self ("Follow-up 'Send deck' for Wakefit due 3 Oct"). Toast "Follow-up scheduled for 3 Oct" |
| `completeActivity` | id, notes?, occurredAt? | assignee, creator, or edit right on related | planned → done (occurredAt default now, completedAt now; meeting needs notes). Updates lastActivityAt, refreshNextFollowUp, returns `unlocks` like logActivity |
| `rescheduleActivity` | id, dueDate (≥ today), dueTime? | same | planned only; refreshNextFollowUp. Toast "Moved to 5 Oct" |
| `cancelActivity` | id, reason? | same | planned → cancelled; refreshNextFollowUp |
| `deleteActivity` | id | orbit.admin | Hard delete (any status) with ConfirmDialog; refreshNextFollowUp; audit (this affects evidence and reports). Does not move stages back |

### 8.3 Deals (`deals.actions.ts`)

| Action | Input | Perm | Effect |
|---|---|---|---|
| `createDeal` | title, clientId (required by form), contactId?, valueRupees, stage (open key), probability?, expectedCloseDate?, ownerId?, source?, sector?, notes? | orbit.write | owner = input with orbit.close else self. StageEvent null → stage. Audit. Redirect to deal |
| `updateDeal` | id + editable fields (title, value, probability, expectedCloseDate, contactId, source, sector, notes, ownerId[close]) | canEditDeal | |
| `moveDealStage` | id, fromStage, toStage (open) | canEditDeal | checkDealTransition, optimistic concurrency on fromStage, StageEvent. Toast "Deal 'X' moved to Negotiation" |
| `winDeal` | id, valueRupees (confirm final value), wonReason?, closeDate? (≤ today, default today) | orbit.close | Patch + StageEvent; if client.status = 'lead' → 'active'. Audit `orbit.deal.won`. Notify owner if not actor. Toast "Deal 'X' won: ₹4,20,000" with sound `success` |
| `loseDeal` | id, reasonCode, reasonNote? | orbit.close | Patch + StageEvent (reason). Audit. Notify owner |
| `reopenDeal` | id | orbit.close | Back to the last open stage. If Folio documents reference the deal, the UI's ConfirmDialog warns "Invoice FB/26-27/014 exists for this deal. Void it in Folio if the deal fell through." |
| `deleteDeal` | id | orbit.admin | Refuse if `leadId` set ("This deal came from lead 'X'. Mark it lost instead.") or Folio documents reference it. Delete deal + activities + stage events |

### 8.4 Contacts (`contacts.actions.ts`, writes `Client.contacts`)

| Action | Input | Perm | Effect |
|---|---|---|---|
| `addContact` | clientId, name (2–80), email?, phone?, role? (≤ 60), primary? | clients.write | Build a new contacts array immutably (if primary, all others primary=false; if it is the first contact, primary=true) and `$set`. Duplicate email on the same client → fieldError |
| `updateContact` | clientId, contactId, fields | clients.write | Same immutable rebuild |
| `setPrimaryContact` | clientId, contactId | clients.write | |
| `deleteContact` | clientId, contactId | clients.write | Refuse when open deals use it ("This contact is on 2 open deals. Change the deal contact first."). If the primary is deleted, the first remaining becomes primary |

### 8.5 Clients (`clients.actions.ts`)

| Action | Input | Perm | Effect |
|---|---|---|---|
| `createClient` | name, displayName?, kind, email?, phone?, website?, gstin?, pan?, state?, billingAddress?, ownerId?, tags?, source?, status? (default active), notes?, firstContact? `{ name, email, phone, role }` | clients.write | GSTIN unique per org ("A client with this GSTIN already exists: X"); GSTIN state code must match `state` when both given ("GSTIN 23… belongs to Madhya Pradesh"; auto-fill state from GSTIN when state is empty); PAN must equal GSTIN characters 3–12 when both given. Audit `client.create`. Redirect `/app/clients/{id}` |
| `updateClient` | id + fields | clients.write | Same checks. Audit with changed fields |
| `setClientStatus` | id, status | clients.write | Audit. Toast "Client 'X' marked inactive" |
| `deleteClient` | id | clients.write | Refuse when anything references it: leads, deals (orbit), projects/tasks (work), invoices/quotes/receipts (folio) → "'X' has 2 invoices and 1 project. Mark it inactive instead." Else delete. Audit |

### 8.6 Settings (`settings.actions.ts`, perm orbit.admin)

`saveDealStages`, `saveSources`, `saveSectors`, `saveReasons` (lost + won), `saveTargets`, `saveGeneral` (staleDays 1–60, defaultReviewerId must have orbit.close). Each validates the whole list (rules in 9.11), replaces that array with `$set`, audits `orbit.settings.update` with a summary, toasts "Orbit settings saved: Sources".

---

## 9. Pages by route

Common to all Orbit pages: `requireMember()`, `ctx.has('orbit')` (the shell locks the product otherwise), `ctx.assert('orbit.read')`. Lists use URL params (`?q=&page=&…`), 25 rows per page, debounced search input (300 ms) that updates the URL. Server components fetch through `ctx.db`; client components only for boards, dialogs and forms. Every destructive action uses `ConfirmDialog`. Scope selector ("Mine / Whole team / {person}") appears only with `orbit.viewAll`, as `?owner=me|all|{memberId}`; default `me`.

### 9.1 `/app/orbit`: dashboard (replaces the reference Today page)

**Purpose.** Start of the day for a salesperson and the pipeline glance for a manager. "This is the daily report."

**Data.**
1. Header: section label "ORBIT", title "Today", date "1 Oct 2026, Thursday"; scope selector; buttons "New lead" (opens quick-add dialog) and "Log activity".
2. **Daily counters** (4 stat cards, Home-style with 14-day sparkline from the volume series):
   - Leads added: leads created today (IST) by owner scope; target `dailyTarget(weeklyNewLeads, workWeek)`; sub "Target 10 met" / "4 to go today".
   - Outreach sent: done outreach activities with occurredAt today, by `createdBy` in scope ("effort"); target from weeklyOutreach.
   - Replies in: done reply activities today; sub "Unlocks the Engaged stage".
   - Meetings booked: leads with `meetingBookedAt` today (by lead owner); sub "Good day." when > 0 else "The only number that closes"; plus "{monthToDate} / {monthlyMeetings} this month".
3. **Pipeline value by stage** (open deals in deal scope): one horizontal bar per deal stage in order: count, ₹ value (compact), weighted ₹; totals "Open pipeline ₹X · Weighted ₹Y". Bar width = stage value ÷ max stage value.
4. **Won this month**: deals with status won and closedAt in the current IST month: count, ₹ sum, ±% vs last month (`deltaPct`), list of the last 3 wins (title, client, value).
5. **Conversion**: Cold % and Warm % (cohort = leads created in the last 30 days, owner scope) as two small rings vs targets; link "Open reports".
6. **Follow-ups**: two lists side by side, **Overdue** (oldest first, note "3d late") and **Due today** (by time): rows show activity type icon, title, related lead/deal name, due, assignee avatar; inline actions Complete (dialog), Reschedule (date popover), Open. Planned activities of open leads/deals and client-level ones, `assigneeId` in scope.
7. **No next step**: open leads in scope with no `nextFollowUp` (first 12, "See all {n}" → `/app/orbit/leads?due=none`), note "untouched 9d" when stale; inline "Schedule" button.
8. Ghost callout when open leads that are stale AND have no next step exist (reference copy, 2.2).

**Actions.** New lead (quick-add dialog), Log activity (dialog with related-record search), complete/reschedule follow-ups, schedule next step.
**Permission.** orbit.read; actions need orbit.write.
**Empty states.** No open leads and no deals: big empty card "Your pipeline is empty. Add your first lead; sourcing {dailyTarget} a day gets you to the weekly target." + New lead + Import CSV. Overdue: "Nothing overdue. Clean slate." Due today: "Nothing due today." No next step: "Every open lead has a next step." Pipeline value: "No open deals yet. Convert a lead or create a deal."

### 9.2 `/app/orbit/leads`: table + board

**Purpose.** All leads (reference Leads + Pipeline pages). `?view=table` (default) or `?view=board`.

**Filters (URL):** `q` (company, contact, email, phone; escaped regex, ≤ 80 chars), `stage` (open (default) | all | closed | each stage), `sector`, `source`, `owner` (viewAll only), `due` (overdue | today | week | none), `stale=1`, `sort` (updated | company | stage | due | created | value; default updated desc), `page`.

**Table columns:** checkbox, Company (link; contact · designation below), Sector (icon + label), Source (icon + label), Stage (badge), Owner (avatar + name), Next step (title; due chip: red "Overdue 3d", amber "Today", grey date), Last touch ("2d ago" or red "stale 9d"), Value (₹ compact or "—"). Row click → detail.

**Board:** columns New, Contacted, Engaged, Meeting booked, Meeting done (each with stage icon, label, count, empty text = stage rule), plus a narrow "Closed" rail at the right with three drop targets Converted, Lost, Disqualified (counts of leads closed in the last 30 days; "Show closed" toggle reveals them as full columns). Cards: company, contact · designation, sector and source icons, ICP dots (1–5), value, next follow-up chip, age "3d ago" / stale badge with clock, owner initials. Board shows all matching open leads; if a column has > 100 cards show the first 100 + "View all in table". Drag with `@dnd-kit`:
- to the next stage: `moveLeadStage`; optimistic update (immutable), roll back and play `error` + toast the server message on refusal;
- to Meeting booked: opens Meeting dialog (date required, time, link) first;
- to Meeting done: opens "Log the meeting" dialog (notes required) unless a done meeting exists;
- to Lost / Disqualified: opens Reason dialog;
- to Converted: opens Convert dialog;
- a refused move snaps back with the reason (e.g. "Move one step at a time: Contacted → Engaged").
Info callout above the board (reference copy, adapted).

**Actions.** New lead (→ `/app/orbit/leads/new`), Import CSV (dialog: choose file → preview first 50 rows with mapped columns, counts of skipped / duplicates / mapped-to-Other, owner + reviewer pickers for orbit.close; confirm → `importLeads`), Export CSV (`GET /api/orbit/leads/export?{same filters}` → `orbit-leads-YYYY-MM-DD.csv`, BOM, columns = reference export + Reviewer + Last touch; respects scope; perm orbit.read), bulk bar when rows selected: Assign owner / Set reviewer (orbit.close), Disqualify (reason dialog), Export selected.

**Permission.** orbit.read; create/import/drag need orbit.write and edit rights per lead.
**Empty states.** No leads at all: "No leads yet. Add your first lead or import a CSV of sourced leads." + New lead + Import CSV. Filters match nothing: "No leads match. Loosen the filters." + Clear filters.

### 9.3 `/app/orbit/leads/new`

**Purpose.** Add a lead in under 30 seconds (reference QuickAddLead). The same form component is used in the quick-add dialog (dashboard, leads header, command palette if the shell offers actions).

**Fields.** Required: Company / brand (autofocus, placeholder "e.g. Kesar & Clay"). Visible: Contact name, Designation ("Founder, Marketing Head"), Sector (select; hint "Primary motion" / "Secondary motion" based on the primary flag), Source (select; default first active), Email, Phone. "More details" disclosure: Instagram handle ("@brand"), LinkedIn URL, Website, ICP fit (1–5, default 3, hint "1 = poor fit, 5 = ideal"), Est. deal value (₹), Next step (title + date, optional; "Send intro DM"), Owner and Reviewer (only with orbit.close; reviewer hint "One owner, one reviewer. No second boss."), Notes. Callout: "Every lead starts at New…".

**Validation** (zod, server): as in 6.1; sector/source must be active setting keys ("Pick a sector"); followUp.dueDate ≥ today ("Pick today or a later date"); followUp.title defaults to "Follow up" when only a date is given; duplicate check (8.1) shows a field error with a link to the existing lead and an "Add anyway" button that resubmits with `allowDuplicate`.

**Actions.** "Add lead" → detail page; "Save and add another" → toast, form cleared, focus company. Cancel → back.
**Permission.** orbit.write (page redirects to `/app/orbit/leads` with a toast otherwise).
**Empty state.** n/a. If settings have no active sources/sectors (all deactivated): callout "Add a source and a sector in Orbit settings first" with a link (shown to orbit.admin).

### 9.4 `/app/orbit/leads/[id]`

**Purpose.** Work one lead: see its history, log activities, schedule follow-ups, move it through the guarded stages, convert it.

**Data.**
- Header: back link "Leads", company name (28px), badges: stage, sector (icon), source (icon, "warm" tag when warm), "ICP 4/5", value. Primary button "Log activity"; secondary "Schedule follow-up"; overflow menu: Convert (only at meeting_done), Disqualify, Mark lost (orbit.close), Reopen (orbit.close, closed lost/disqualified), Delete (orbit.admin; ConfirmDialog "Delete 'X' and its 14 activities? Reports will stop counting it.").
- **Stage card** (section label "STAGE"): rail New → Contacted → Engaged → Meeting booked → Meeting done → Converted, each with icon, done/current/future styling, tooltip = rule. Below: "Move to {next}" primary (lock icon + disabled + blocked callout using `blockedReason`; e.g. "Blocked: Log a 'Reply received' activity first. They replied. Any human response counts, positive or not."), at meeting_done the primary becomes "Convert to client + deal". For a warm-source lead at New with a reply logged, also show "Move to Engaged". Disqualify / Mark lost buttons. Closed: close-reason callout ("CLOSE REASON · No budget — Said budget opens in Q3"), and Reopen for reviewers or "Ask your reviewer to reopen it if that was wrong." Converted: green callout "Converted on 28 Sep 2026" with links to the Client and the Deal; Log activity hidden.
- **Upcoming** (planned activities for this lead, by due): type icon, title, due (red when overdue), assignee; Complete / Reschedule / Cancel. Empty: "No next step. Leads without a next step quietly die." + Schedule follow-up.
- **Timeline** (merged, newest first; filter chips All / Activities / Stage changes): done activities (icon, "Reply received · Instagram", time "2 Oct, 3:30 pm", notes, author, a highlight tint on replies), cancelled planned ones (struck, with reason), stage events ("Contacted → Engaged" with who; "Created at New"; reason on exits). Empty: "Nothing logged yet. This lead can't leave New until an outreach is recorded." + "Log the first outreach".
- **Details card** (right column, inline form, Save changes): contact name, designation, email (mailto), phone (tel + WhatsApp `https://wa.me/91…` link when 10 digits), Instagram (link), LinkedIn, website, sector, source, ICP (Not rated / 1–5), est. value ₹, owner and reviewer (orbit.close, else read-only text), notes.
- **Milestones card**: Created, First contacted, First reply, Meeting booked (+ "Meeting on 3 Oct, 4:00 pm" from meetingAt), Meeting done, Converted, Closed; "—" when empty; plus "{n} days from first contact to meeting" when both exist.

**Dialogs.**
- *Log activity*: type chips (DM, Email, Call, Follow-up, Reply, Meeting, Note; with icons), channel select (default by type: dm → the source if instagram/linkedin else whatsapp, email → email, call → phone, meeting → video, reply → channel of the latest outreach), notes ("What did you say, what did they say back"; required for Meeting), when (default now; date-time picker limited to the last 7 days), reply callout, "Also schedule a follow-up" disclosure (title + date). After success: toast; if `unlocks` returned, the toast carries an action "Move to Engaged" that calls `moveLeadStage`.
- *Schedule follow-up*: type (Follow-up, Call, Email, DM, Meeting), title, date (≥ today), time, assignee (owner default; others only with orbit.close), link (meeting).
- *Meeting booked*: date (required), time (default 11:00), link, notes → `moveLeadStage` with meeting fields.
- *Log the meeting* (for Meeting done): notes (required), when → `moveLeadStage` with meetingNotes.
- *Reason* (lost/disqualified): reason select (active lost reasons), detail textarea (required for Other), callout (reference copy).
- *Convert*: Client section (radio "Create new client" prefilled with company and primary contact preview, or "Link existing client" with a search select that suggests up to 5 clients whose name contains the company name); Deal section (title default "{Company}", value ₹ prefilled from lead value, stage default first open deal stage, expected close date ≥ today, owner default lead owner). Submit "Convert".

**Permission.** orbit.read + in scope; actions need canEditLead (and orbit.close where noted).
**Empty state.** Not found / out of scope → `notFound()`.

### 9.5 `/app/orbit/deals`: kanban by stage

**Purpose.** Money pipeline. `?view=board` (default) or `?view=table`.

**Data.** Header totals: Open pipeline ₹, Weighted ₹, Won this month ₹ (count), Expected this month ₹ (open deals with expectedCloseDate in the current month). Board columns = settings deal stages in order + Won + Lost (Won/Lost show deals closed in the last 90 days; "Show older" link to the table filtered by status). Column header: label, count, ₹ sum (compact), weighted ₹, probability %. Card: title, client name, value ₹, probability, expected close (red when past and open), owner initials, "in stage 6d", next follow-up chip, source icon.
**Filters:** `q` (title, client name), `owner` (viewAll), `client`, `source`, `close` (this_month | overdue | next_30), `status` (table: open | won | lost | all).
**Table columns:** Deal, Client, Stage, Value, Probability, Weighted, Expected close, Owner, Next step, Last touch.

**Actions.** New deal (dialog: title, client search select with inline "New client" (name only → `createClient` minimal), contact (from that client's contacts), value ₹, stage, probability (pre-filled from stage, editable), expected close, owner (orbit.close), source, notes) → deal page. Drag between open stages → `moveDealStage` (optimistic, rollback on error). Drop on Won → Won dialog (final value ₹ prefilled, won reason optional, close date default today) → `winDeal`. Drop on Lost → Reason dialog → `loseDeal`. Won/Lost drops are disabled (visually locked) without orbit.close.

**Validation.** title 2–140; value ≥ 0; probability 0–100 int; expectedCloseDate valid date (past allowed only when editing, not when creating: "Pick today or a later date"); client required on create ("Pick a client or create one"); stage must be an open stage key.
**Permission.** orbit.read; create/move need orbit.write + canEditDeal; won/lost need orbit.close.
**Empty state.** "No deals yet. Convert a lead at Meeting done, or create a deal for an existing client." + New deal + "Go to leads".

### 9.6 `/app/orbit/deals/[id]`

**Data.** Header: title, status pill (Open / Won / Lost), stage badge, value ₹ (large), probability, weighted, client link, owner. Buttons: Log activity, Schedule follow-up, Mark won (orbit.close), Mark lost (orbit.close), Reopen (closed, orbit.close; ConfirmDialog with Folio warning when relevant), overflow: Delete (orbit.admin; rules 8.3).
- Stage rail of open stages (click a stage to move there for canEditDeal; won/lost via buttons).
- Upcoming planned activities; Timeline (deal activities + deal stage events; if the deal came from a lead, a collapsed "Before conversion" group with the lead's activities and stage events, linking to the lead).
- Details card (inline edit): title, value, probability, expected close, contact (select from client contacts + "Add contact" → addContact), source, sector, owner (orbit.close), notes.
- Client card: name, status, primary contact (email/phone links), GSTIN, link to `/app/clients/{id}`.
- Origin card (if leadId): lead link, source, sector, first contacted, meeting done, converted, days from first contact to win (when won).
- Lost/won reason callout when closed.
- **Folio card** (when status won, or always with a muted look while open): if `ctx.has('folio')` and the user has Folio quote/invoice create permission: "Create quote" → `/app/folio/quotes/new?clientId={}&dealId={}&title={}&amountPaise={}` and "Create invoice" → `/app/folio/invoices/new?clientId={}&dealId={}&title={}&amountPaise={}`; below, the quotes/invoices that reference this deal (`dealId`), with number, status, total, link. If Folio is not entitled: locked card "Billing with Folio isn't on your plan" + "See plans" (opens the upgrade dialog / `/app/settings/subscription`). If Folio has no `dealId` field yet: show "Invoices for this client" linking to the client's Invoices tab.

**Permission.** orbit.read + in scope.
**Empty state.** notFound when missing/out of scope; timeline empty: "No activity yet. Log a call or schedule the next step."

### 9.7 `/app/orbit/contacts`

**Purpose.** People you sell to. Source of truth = `Client.contacts` (embedded); prospects come from open leads.

**Tabs (`?tab=clients` default | `prospects`).**
- *Clients*: aggregate `Client` → `$unwind: '$contacts'` → fields contact `_id`, name, role, email, phone, primary, client `_id`, client name, client status; search `q` on contact name/email/phone and client name; filters: client status, "Primary only"; sort by name; paginate 25. Columns: Name (+ "Primary" pill), Role, Client (link), Email, Phone, Open deals (count of open deals with this contactId, via a second query on the page's ids).
- *Prospects*: open leads in scope with a contactName: Name, Designation, Company (lead link), Email, Phone, Stage, Owner. Read-only; row → lead.

**Actions.** "Add contact" (dialog: client search select (required), name, role, email, phone, primary) → `addContact` → contact page.
**Validation.** name 2–80; email valid + unique within the client; phone 7–15 digits; role ≤ 60.
**Permission.** orbit.read + clients.read; add/edit need clients.write.
**Empty states.** Clients tab: "No contacts yet. Contacts live on clients; add one, or convert a lead to bring its contact over." + Add contact. Prospects tab: "No open leads with a contact name."

### 9.8 `/app/orbit/contacts/[id]`

`id` = the contact subdocument `_id`. Load with `Client.findOne({ 'contacts._id': id })`; `notFound()` if missing.
**Data.** Name, role, Primary pill, email (mailto), phone (tel, WhatsApp link), client card (link, status, GSTIN), deals with this contactId (in deal scope: title, stage, value, status), activities with this contactId (timeline), upcoming planned activities.
**Actions.** Edit (dialog → `updateContact`), Make primary, Delete (ConfirmDialog; rules 8.4), Log activity (preselects client + contact; optional pick of one of the client's open deals), Schedule follow-up.
**Permission.** orbit.read + clients.read; edits clients.write; activities orbit.write.
**Empty states.** Deals: "No deals with this contact." Activity: "No activity with this contact yet."

### 9.9 `/app/orbit/activities`

**Purpose.** The follow-up queue and the activity log across leads, deals and clients (SPEC: calls, emails, meetings, notes, follow-ups; today / overdue / upcoming).

**Tabs (`?tab=`):** `today` (default): planned due today (by time, then created) and, below, "Done today" (logged today); `overdue`: planned with dueDate < today, oldest first, "3d late"; `upcoming`: planned in the next 30 days grouped by date ("Tomorrow", "Mon 5 Oct"); `done`: log of done activities, newest first, with date range (`from`, `to`; default last 7 days), paginated.
**Filters:** type chips (All, Calls, Emails, DMs, Follow-ups, Meetings, Replies, Notes), `owner` (assignee for planned / logger for done; viewAll), `related` (lead | deal | client).
**Row:** type icon (colour by type), title or label, related record link (lead company / deal title / client name) with a small kind tag, due date-time or occurredAt, assignee avatar, notes preview (done).
**Actions.** New activity (dialog: related record search across leads/deals/clients in scope, Planned vs Done toggle, type, channel (done), title, date/time, assignee, notes), Complete, Reschedule, Cancel (ConfirmDialog with optional reason), Open related.
**Tab counts** shown in the tab labels (Today 4, Overdue 2).
**Permission.** orbit.read (scope 5); actions orbit.write + edit right.
**Empty states.** Today: "Nothing due today." Overdue: "Nothing overdue. Clean slate." Upcoming: "No follow-ups scheduled. Every open lead needs a next step." + "See leads without a next step" (→ leads `?due=none`). Done: "Nothing logged in this period."

### 9.10 `/app/orbit/reports`

**Filters (URL):** `range` = 7d | 30d (default) | 90d | month | last_month | all | custom (`from`, `to`, IST dates), `owner` (viewAll; else forced to me), `sector`. Cohort = leads created in the range (createdAt between IST start of `from` and end of `to`). Each section has "Download CSV" (client-side `papaparse.unparse` of the rows the server sent).

Sections:
1. **Conversion: the two denominators.** Cold card (value, ring vs coldMin, "Meetings booked ÷ leads contacted", "6 ÷ 121", pill "Target 3–5% · on track/below") and Warm card ("Meetings booked ÷ leads who replied", target warmPct). Small-sample callout when contacted < 30. Maturity note: "{n} of these leads were contacted in the last 14 days and may still convert" (count of cohort leads with contactedAt within 14 days of today).
2. **Funnel (cohort, "ever reached").** Bars: Leads added, Contacted (% of total), Engaged (reply rate %), Meeting booked, Meeting done, Converted, Won (= cohort leads whose deal is won). Width = value ÷ total (min 2.5% when > 0). Tiles: Lost, Disqualified, Open, Converted.
3. **Outreach volume, last 14 days** (fixed window, owner = activity logger): per IST day outreach, replies, meetings held; stacked bars scaled to max(outreach + replies); hover shows "2 Oct: 24 outreach, 5 replies"; legend; "Today" at the right.
4. **Stage velocity.** For each open lead stage (New … Meeting done): average days from entering that stage to the lead's next stage event, rounded to 1 decimal, and the sample size. Spans start = StageEvent with toStage = that stage and changedAt in range; end = the next StageEvent of the same lead. Spans without an end are excluded. Empty: "Not enough stage movement yet."
5. **Source performance.** Per source: Leads, Contacted, Replied, Meetings, Converted, Won, Cold %, Warm %; "warm" tag; order meetings desc, total desc; cold/warm cells highlighted (`--success`) when ≥ targets.
6. **Sector split.** Per sector: Leads, Contacted, Replied, Meetings, Won, Warm %; "Primary" pill; order total desc.
7. **By owner** (viewAll only). Per lead owner: Leads (cohort), Contacted, Replied, Meetings, Cold %, Warm %, Outreach logged (activities they logged in range), Deals won (count and ₹, deals they own closed won in range).
8. **Deals: won and lost.** Deals closed in range: Won (count, ₹), Lost (count, ₹), Win rate by count and by value. Deal-stage reach: for each open deal stage, deals created in range that ever reached it (distinct entityId from deal StageEvents with that toStage, plus the creation event), and the share that went on to win.
9. **Close reasons.** Table grouped by reason code: Leads disqualified, Leads lost, Deals lost (count and ₹), share of total; and a Won reasons table (count, ₹). Labels from settings (deactivated reasons still show their label).
10. **Pipeline now** (not range-bound): open deals by stage (count, ₹, weighted ₹) and expected close this month.

Implementation notes: compute cohort counts with one `$match` + `$group` with `$sum: { $cond: [{ $ne: ['$contactedAt', null] }, 1, 0] }` per milestone; per-source/sector/owner with the same `$group` keyed by field; "won" via `$lookup` into deals on dealId (status won). Daily series with `$dateToString: { format: '%Y-%m-%d', date: '$occurredAt', timezone: 'Asia/Kolkata' }`, then fill missing days with zeros in JS. Velocity with `$setWindowFields` (partition by entityId, sort changedAt, `$shift` by 1) or in JS over the events in scope (fine at this scale).
**Permission.** orbit.read. **Empty state.** No leads in the range: "No leads in this period. Try a longer range." (sections still render with dashes).

### 9.11 `/app/orbit/settings`

**Permission.** orbit.admin (others: redirect with "Ask an admin to change Orbit settings"). Tabs `?tab=`:
- **Deal stages**: ordered list editor (drag handle via dnd-kit, label, probability %, colour from 6 presets: sky, indigo, violet, orchid, amber, mint). Won (100%) and Lost (0%) rows shown locked at the end. Rules: 1–8 open stages; labels unique (case-insensitive), 2–40 chars; probability int 0–100, should not decrease down the list (warning only); a stage with open deals cannot be removed ("4 open deals are in Negotiation. Move them first.").
- **Lead stages** (read-only): the 6 open+converted stages and 2 exits with their rule text and guard, and the note "Lead stages are fixed: Cold % and Warm % are defined by them."
- **Sources**: list editor (label, Warm toggle with hint "Warm sources may skip Contacted: an inbound lead can go straight from New to Engaged once their message is logged", Active toggle, reorder). At least one active. Removing an item used by any lead or deal is refused; offer Deactivate (hidden from pickers, label kept in reports).
- **Sectors**: list editor (label, Primary radio (exactly one), Active, reorder). Same in-use rule.
- **Close reasons**: two list editors, Lost reasons (≥ 1 active; must keep `other`) and Won reasons. In-use rule as above.
- **Targets**: Cold min % and Cold max % (0–100, step 0.5, min ≤ max: "Cold min can't be above cold max"), Warm % (0–100, step 0.5), New leads / week, Outreach / week, Meetings / month (ints 0–10 000). Callout: "Cold conversion is measured against everyone contacted, where 3–5% is realistic for pure outreach. Warm conversion is measured against everyone who replied, where 15% is fair. One number can't serve both."
- **General**: stale after N days (1–60, default 7), default reviewer (members with orbit.close, or None).
Each tab saves independently (`settings.actions.ts`), toasts with sound, audits.
**Empty state.** n/a (defaults are created on first read).

### 9.12 `/app/clients`: shared clients list (built by Orbit)

**Permission.** `clients.read` and any of work/orbit/folio.
**Filters:** `q` (name, displayName, email, GSTIN, contacts.name, contacts.email), `status` (all | lead | active | inactive; default active+lead), `owner`, `tag`, `sort` (name | recent | outstanding (folio) | pipeline (orbit)).
**Columns:** Name (kind icon company/individual; displayName below), Primary contact (name · phone), Status pill (lead amber, active mint, inactive grey), Owner, Open pipeline ₹ (orbit only: sum of open deals), Outstanding ₹ (folio only: sum of invoice `balancePaise` where status issued/part_paid), Active projects (work only), Last activity. Columns for products the workspace lacks are hidden.
**Actions.** Add client (→ `/app/clients/new`), Export CSV (name, kind, GSTIN, state, email, phone, primary contact, status, owner, city).
**Empty states.** "No clients yet. Add your first client, or convert a lead in Orbit." + Add client (clients.write). No match: "No clients match." + Clear filters.

### 9.13 `/app/clients/new`

**Fields.** Kind (segmented Company / Individual), Name*, Display name, Email, Phone, Website, GSTIN (uppercase, 15 chars, live format check), PAN (uppercase, 10 chars), State (select of Indian states/UTs; auto-filled from GSTIN), Billing address (line 1, line 2, city, state, pincode 6 digits, country default India), Owner (members), Tags (chip input), Source (settings sources when Orbit is on, else free text), Status (Active default, or Lead), Notes, First contact (name, role, email, phone; optional).
**Validation.** name 2–120; email/phone/GSTIN/PAN via `lib/validation`; GSTIN unique in the org; GSTIN state code ↔ state match; PAN = GSTIN[2..11] when both; pincode `/^[1-9]\d{5}$/`.
**Actions.** Save → `/app/clients/{id}`; Cancel.
**Permission.** clients.write.

Indian states and UTs with GST codes (use a shared list if foundation/Folio already provides one; otherwise `modules/orbit/indiaStates.ts`; keep the 2-letter codes aligned with Folio): 01 JK Jammu & Kashmir, 02 HP Himachal Pradesh, 03 PB Punjab, 04 CH Chandigarh, 05 UK Uttarakhand, 06 HR Haryana, 07 DL Delhi, 08 RJ Rajasthan, 09 UP Uttar Pradesh, 10 BR Bihar, 11 SK Sikkim, 12 AR Arunachal Pradesh, 13 NL Nagaland, 14 MN Manipur, 15 MZ Mizoram, 16 TR Tripura, 17 ML Meghalaya, 18 AS Assam, 19 WB West Bengal, 20 JH Jharkhand, 21 OD Odisha, 22 CG Chhattisgarh, 23 MP Madhya Pradesh, 24 GJ Gujarat, 26 DN Dadra & Nagar Haveli and Daman & Diu, 27 MH Maharashtra, 29 KA Karnataka, 30 GA Goa, 31 LD Lakshadweep, 32 KL Kerala, 33 TN Tamil Nadu, 34 PY Puducherry, 35 AN Andaman & Nicobar Islands, 36 TS Telangana, 37 AP Andhra Pradesh, 38 LA Ladakh.

### 9.14 `/app/clients/[id]`

**Header.** Name, kind icon, status pill, GSTIN, state, owner avatar, tags. Actions (each only if the product is on and the user has the permission): New deal (orbit; opens the New deal dialog with the client fixed), New project (work → `/app/work/projects?new=1&clientId={id}`), New invoice (folio → `/app/folio/invoices/new?clientId={id}`), overflow: Edit, Mark inactive / Mark active, Delete (rules 8.5).
**Tabs (`?tab=`, hidden when the product is off):**
- **Overview**: details card (editable inline with the client form fields; clients.write), KPI tiles: Open pipeline ₹ and Won lifetime ₹ (orbit), Active projects (work), Outstanding ₹ and Overdue ₹ (folio), primary contact card, recent activity (5 items).
- **Contacts**: table of `contacts` (name, role, email, phone, primary) with Add / Edit / Make primary / Delete (8.4). Empty: "No contacts yet." + Add contact.
- **Projects (Work)**: `Project.find({ clientId })`: code, name, status, health, lead, end date; link to `/app/work/projects/{id}`. Empty: "No projects for this client." + New project.
- **Deals (Orbit)**: deals for this client in deal scope: title, stage, value, probability, expected close, status, owner; plus the converted lead(s) (`Lead.find({ clientId })`) as an origin note. Empty: "No deals yet." + New deal.
- **Invoices (Folio)**: `Invoice.find({ clientId })` sorted by issueDate desc: number (or "Draft"), issue date, due date, status pill, total ₹, balance ₹; link to `/app/folio/invoices/{id}`. Empty: "No invoices yet." + New invoice.
- **Ledger (Folio)**: summary from invoices: billed (sum totalPaise of non-draft, non-void), received (billed − outstanding), outstanding (sum balancePaise of issued/part_paid), overdue (outstanding where dueDate < today), aging buckets (not due, 1–30, 31–60, 61–90, 90+); button "Open full statement" → `/app/folio/ledger/{clientId}`. Empty: "Nothing billed yet."
- **Activity**: Orbit activities with this clientId (done, newest first), stage events of this client's deals and converted leads, and AuditLog entries with entity = client and entityId = id (created, updated, status changed). Empty: "No activity yet."
**Permission.** clients.read; product tabs require `ctx.has(product)` and that product's read permission (deals: orbit.read; invoices/ledger: Folio read permission).
**Empty state.** notFound when missing.

---

## 10. Shared Orbit components (`components/orbit/`)

`StageBadge` (lead or deal stage chip with icon), `StageRail`, `LeadCard`, `LeadBoard` (dnd-kit), `DealCard`, `DealBoard`, `LeadForm` (page + dialog), `ImportLeadsDialog`, `LogActivityDialog`, `ScheduleDialog`, `CompleteActivityDialog`, `MeetingDialog`, `ReasonDialog` (lost/disqualified/deal lost), `WonDialog`, `ConvertDialog`, `ActivityRow`, `Timeline` (merged activities + stage events), `FollowUpList` (dashboard + activities), `ConversionCard` (ring + numerator ÷ denominator + target pill), `FunnelBars`, `VolumeBars`, `ReportTable` (sortable, CSV button), `ListEditor` (settings lists with reorder/active/in-use guard), `ClientForm`, `ContactDialog`, `RecordSearchSelect` (leads/deals/clients), `BrandIcons` (Instagram, LinkedIn, WhatsApp, ported). Charts use the foundation's SVG components in `components/charts` where they fit (ring, sparkline, bars); build Orbit-specific ones locally only if missing.

---

## 11. Visual and copy notes (Flowbit dark theme)

- Orbit accent `--orbit` sky `#60A5FA` for the product icon, active tab underline, section-label icons.
- Lead stage colours (dot/solid; chips use the colour at 14% alpha as background and the colour as text): new `#7E768C` (`--text-3`), contacted `#7C93C8`, engaged `#60A5FA` (`--orbit`), meeting_booked `#6366F1` (`--info`), meeting_done `#8B5CF6`, converted `#5EEAB0` (`--success`), lost `#F0507A` (`--danger`) at reduced opacity, disqualified `#7E768C` dimmed. The idea from the reference holds: colour intensifies as a lead approaches money; only the success state uses mint.
- Deal stage colours come from the preset chosen in settings; won `--success`, lost `--danger`.
- Stale and overdue: `--danger` text with a clock icon; due today `--warning`.
- Glass cards (`--surface`, 20px radius), pill inputs/buttons, section labels uppercase 11–12px with an icon ("STAGE", "UPCOMING", "TIMELINE", "DETAILS", "MILESTONES", "PIPELINE VALUE", "FOLLOW-UPS").
- Sounds: drag-drop success `success`, refusal `error`, opening dialogs `pop`, chips/toggles `toggle` (the Button primitive already plays `click`).
- Copy: name what happened to what ("Lead 'Kesar & Clay' moved to Engaged", "Deal 'Malabar Mornings retainer' won: ₹4,20,000"); errors say what to do (the guard messages in 7.1). Money `formatINR`, dates "3 Oct 2026", times "4:00 pm" IST.

---

## 12. Seed data (`modules/orbit/seed.ts`)

Use the members the seed harness provides: owners = members with role `sales` (2–3 people), reviewer = an `admin` or `owner` (or a sales lead); if no sales members exist, use admins. Create a custom role **"BD executive"** (orbit.read, orbit.write, clients.read) through the core `Role` model and assign it to one seeded salesperson so the intern limits can be demonstrated. Use fictional companies and fictional contact people (no real brands or founders). Dates between 15 Aug and 1 Oct 2026, IST working hours.

1. **OrbitSettings**: defaults + an extra source "DevNetJobs" (key `devnetjobs`, not warm) for the Vistaar demo org; default reviewer = the reviewer.
2. **Leads (about 150, generated deterministically)** aimed at the reference demo numbers so the reports look real: total ~148, contacted ~121, engaged ~34, meeting booked ~6, meeting done ~4, converted 3, lost ~9, disqualified ~14 → Cold ≈ 5%, Warm ≈ 18%, reply rate ≈ 28%. Mix: sectors ~65% D2C, 22% Real Estate, 13% Development & NGO; sources Instagram 45%, LinkedIn 30%, Referral 6%, DevNetJobs 12%, Inbound 5%, Event 2%. Build each lead's history in order so the guards would have allowed it: created at New (StageEvent), 1–3 outreach activities (dm/email/call/follow_up with realistic notes) before contactedAt, a reply before engagedAt, meetingAt + planned→done meeting for booked/done leads, closeReason codes spread over the lost-reason list. Set all milestone timestamps, stageChangedAt, lastActivityAt consistently. About 20 open leads get a planned follow-up (some overdue, 4 due today, the rest in the next 10 days); about 12 open leads have none and are stale (for the ghost callout). Name pools: brand prefixes (Kesar, Malabar, Urban, Saffron, Indus, Gulmohar, Neel, Chai, Desi, Banyan, Ritu, Amrit, Kaveri, Narmada, Sattva) × suffixes (& Clay, Mornings Coffee, Pind Apparel, Trails, Leaf Teas, Naturals, Theory Co, Threads, Botanicals, Realty, Homes, Foundation, Learning Trust); contact names from common Indian first/last names (Aditi Singh, Rohan Mehta, Priya Nair, Karan Malhotra, Sneha Kulkarni, Arjun Rao, Meera Iyer, Vikram Shah, Neha Joshi, Farhan Qureshi, Ananya Das, Siddharth Jain).
3. **Clients (8)**: 3 from conversions (status lead or active), plus 5 existing active clients, e.g. "Kesar & Clay Ceramics" (MP, GSTIN 23…), "Malabar Mornings Coffee" (KL), "Narmada Valley Realty" (MP), "Gulmohar Learning Trust" (an NGO: kind company, no GSTIN), "Urban Pind Apparel" (DL), "Saffron Trails Travel" (RJ), "Indus Leaf Teas" (AS), "Neel Botanicals" (KA). Each with 1–3 contacts (one primary), billing address, owner. Upsert by name (`findOne({ name })` then create) so Work and Folio seeds can reuse the same clients; share this list with those agents.
4. **Deals (about 10)**: 3 from conversions (leadId set, source/sector copied) + 7 direct for existing clients. Values ₹60,000 to ₹6,00,000 (paise). Stages spread: discovery 2, proposal 2, negotiation 2, won 3 (closed 12 Sep, 24 Sep, 29 Sep 2026; won reasons), lost 1 (reason "Price too high", note "Wanted a retainer under ₹1L"). StageEvents for every move; a few deal activities (calls, meetings, emails) and 3 planned follow-ups.
5. Activities total roughly 450 (most outreach), StageEvents roughly 420; use `insertMany`.

---

## 13. Agent split, file ownership, cross-agent needs

If one Orbit agent builds everything, ignore the split. If two are used, build in this order:

**orbit-a (foundation of Orbit + leads + activities + dashboard)**
- `src/models/orbit/{Lead,Deal,Activity,StageEvent,OrbitSettings}.ts` (all models first, since orbit-b depends on them)
- `src/modules/orbit/{constants,scope,leadStage,dealStage,metrics,followUps,csvImport}.ts` + tests
- `src/modules/orbit/{settings,leads,activities}.{actions,queries}.ts`, `dashboard.queries.ts`, `seed.ts`
- `src/app/app/orbit/page.tsx`, `orbit/leads/**`, `orbit/activities/page.tsx`, `src/app/api/orbit/leads/export/route.ts`
- `src/components/orbit/` lead, activity, timeline, follow-up, dialog components

**orbit-b (deals, contacts, clients, reports, settings)**
- `src/modules/orbit/{deals,contacts,clients,reports}.{actions,queries}.ts`
- `src/app/app/orbit/deals/**`, `orbit/contacts/**`, `orbit/reports/page.tsx`, `orbit/settings/page.tsx`
- `src/app/app/clients/**`
- `src/components/orbit/` deal, report, settings, client components

**Needs from foundation (list in the final report if missing):**
1. Permission keys `orbit.read`, `orbit.viewAll`, `orbit.write`, `orbit.close`, `orbit.admin`, `clients.read`, `clients.write` and the role mapping in section 5.
2. Catalog entries for every Orbit route and `/app/clients/*`, with Orbit side-panel sections, e.g. PIPELINE (Dashboard, Leads, Deals), PEOPLE (Contacts, Clients), FOLLOW-UPS (Activities), INSIGHTS (Reports), Settings.
3. `Client.contacts` subdocuments keep `_id`.
4. A transaction helper (or `ctx.db` methods forwarding `{ session }`).
5. `todayIST()`, IST day/month boundaries (start/end of day as `Date`), `formatINR`, `formatINRCompact`, `rupeesToPaise`.
6. Shared Indian states list with GST codes (else Orbit keeps a local one).

**Needs from Folio:** store `dealId?` on Quote and Invoice; accept query params `clientId`, `dealId`, `title`, `amountPaise` on `/app/folio/quotes/new` and `/app/folio/invoices/new` to prefill; optionally export an aging helper. Orbit reads Folio models read-only.

**Needs from Work:** accept `?new=1&clientId=` on `/app/work/projects` to open the new-project form with the client set; `Project.clientId` and `Task.clientId` (already in the SPEC contract).

**Muster:** none.

---

## 14. Unit test checklist (Vitest, next to the code)

`leadStage.test.ts`
- new → contacted refused without outreach; allowed with one; stamps contactedAt
- contacted → engaged refused without reply; allowed with one; keeps an existing contactedAt
- new → engaged refused for a cold source; allowed for a warm source with a reply; stamps both contactedAt and engagedAt
- skip new → meeting_booked refused for everyone (including close permission)
- backwards refused without close; allowed with close; milestone timestamps not cleared
- meeting_booked needs meetingAt; meeting_done needs a held meeting
- lost refused without close; lost/disqualified refused without a reason; 'other' needs a note
- converted only via convert and only from meeting_done
- closed lead: intern refused; reopen goes to the pre-close stage and clears closedAt and closeReason
- timestamps never taken from input (passing a fake old date has no effect)
`dealStage.test.ts`
- open ↔ open moves set probability to the stage default; won/lost need close; lost needs a reason; won sets probability 100 and closedAt; reopen restores the last open stage and clears reasons
`metrics.test.ts`
- `pct1` rounding (6/121 = 5.0, 6/34 = 17.6, 34/121 = 28.1, 0 denominator = null)
- funnel open count; targetState fill capped at 1; dailyTarget with 5- and 6-day weeks; weighted rounding; winRate; deltaPct; isStale boundary at exactly staleDays; agingBucket edges (0, 1, 30, 31, 60, 61, 90, 91 days)
`followUps.test.ts`
- `pickNext` orders by dueDate, then dueTime (null last), then createdAt; ignores done/cancelled
`csvImport.test.ts`
- "Company Name" goes to company, not contact; "LinkedIn URL" goes to linkedin, not website; exact beats fuzzy; a claimed column is not reused; rows without company are skipped and counted; unknown sector maps to other and is counted; "Development & NGO" maps to dev_ngo; 2000-row cap
