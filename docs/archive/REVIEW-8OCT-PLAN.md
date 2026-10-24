# Plan after the 8 Oct review

This plan reworks the 8 Oct review list (`REVIEW-8OCT.md`). It draws on three research passes from the same day:
- **Competitors:** ClickUp, Linear, Asana, Basecamp, Viva Engage, Staffbase, Workvivo, Zoho, Keka, Productive, Accelo.
- **Meetings, CRM, finance, branding, migration:** costs and feasibility.
- **Twelve user viewpoints:** owner, PM, developer, designer, HR, accountant, salesperson, field staff, the agency's client, Flowbit sales, a new trial user, an investor or CA.

Items marked "(already built)" exist in code today. `FEATURES.md` has the details.

## Principles

1. **Fix what people feel first.** That means speed (comments, the Clients page) and visible bugs (gradient, logo).
2. **Build habit loops: check-in → brief → today's tasks.** These keep people opening Flowbit every day. Never gate them behind a paid plan.
3. **Muster and Folio are what make customers stay** (payroll, ledger, Tally). Put money into them before cosmetics.
4. **Heavy-cost features go in as paid add-ons.** Meeting transcription, AI and custom domains fall here.

## Tier 1: lock build (tonight to tomorrow evening)

Small, visible changes and bugs.

| # | Change | Why |
|---|---|---|
| 1 | Feature flag that hides WhatsApp everywhere: Integrations, the wallet, Profile, the notification grid and the employee bot. Remove the 85 WhatsApp mentions from the manual. | Owner decision |
| 2 | Comment speed. The server only saves the comment. Notifications, activity and automations run in the background (`after()` or the outbox). Revalidate only the task, not all of `/app`. The UI shows the comment instantly. | Speed (#15) |
| 3 | Brand colour gradients: add the 3 missing variables and replace the hard-coded gradients (check-in, Arc card, login card). The workspace logo replaces the Flowbit logo in the side panel and the phone top bar. | Bugs #31, #32 |
| 4 | Quick add in Home → "Assigned to me": type, press Enter, the task lands assigned to me. | #1 |
| 5 | Break types: Lunch, Power Nap, Tea/Coffee, Personal/Rest. Each carries paid or unpaid, a daily limit, and a tag on the attendance record. Use simple icons now; glass icons and animation later. | #2. The review advised against spending time on the animations. |
| 6 | Image upload in posts and comments (JPEG/PNG/GIF file upload) | #10 |
| 7 | Logo upload for projects and clients (JPEG/PNG), shown on tasks. Add custom colours (a colour picker). | #4, #5, #14 |
| 8 | Clients page: an Import button that opens the existing importer | #21 (half-built) |
| 9 | Bump the version to 2.0. Correct the upload limit in the manual (4 MB, not 10 MB). | #37 |
| 10 | Red "test" text: wait for the screenshot. The code only has an amber "Test mode" label. | #33 |

## Tier 2: v2.1 (in 10 days)

| # | Change | Who benefits | Value | Effort |
|---|---|---|---|---|
| 1 | **Task side panel** (built 9 Oct), ClickUp/Linear style: opens from the list without changing route; fields fixed on the right; toggle between comments and all activity; J/K moves to the next or previous task; `?` lists the shortcuts. Add "Blocked by" / "Blocks" relations, building on the blocker that exists today. | PM, developer | H | M |
| 2 | **Clients page:** (built 9 Oct) measure it first, then speed it up. Client cards show health, hours vs retainer this month, margin (Muster cost vs Folio revenue), overdue amount, last activity and onboarding date. Filters: new (30/90 days), onboarding month, health. Pie charts. Add a **Tasks tab** to the client page. | Owner, PM | H | M |
| 3 | **Folio charts:** (built 9 Oct) receivables aging (click to follow up), monthly invoiced vs collected, top 10 clients, GST summary. | Finance, owner | H | S |
| 4 | **Tally XML export** (built 9 Oct) (invoices, receipts, expenses). The CA no longer re-types everything. | Accountant, CA | H | M |
| 5 | **Google Calendar plus automatic Meet links** (built 9 Oct) (Calendar scope is "sensitive", so no CASA audit is needed). | Everyone | H | M |
| 6 | **Orbit bulk follow-up sequence:** (built 9 Oct) select leads → enrol in up to 5 steps (email / call task / reminder). Sends in IST, Monday to Saturday, with a daily cap, an unsubscribe link and a "Replied" mark. Mail goes from the user's own Gmail through `gmail.send`; reading replies needs a CASA audit, so that comes later. | Sales | H | M |
| 7 | **Posts:** (built 9 Oct) new types (Announcement, Update/FYI, Kudos, Celebration, Policy with "I've read it", Question, Poll, Win, Welcome, Event). Automatic birthday and work-anniversary posts. Polls. Scheduled posts. Audience targeting by team or department. Phosphor icons (duotone for categories). | Everyone, HR | M | M |
| 8 | **Teams:** (built 9 Oct) card and list view. The member card shows status (on break / on leave), local time, workload bar, project logos and skills. Show leave or OOO on the assignee's avatar, and warn when assigning to someone who is on leave. | PM | M | S |
| 9 | **Activation:** (built 9 Oct) "Load sample agency" (removable in one click), a 5-step checklist (invite 2 people, first project, first task, check in, first invoice), and a 60-second tour for each product. | New trial user, Flowbit sales | H | M |
| 10 | **Location check-in on the web** (built 9 Oct), with an optional geofence. This replaces the bot that is being hidden. | Field staff, HR | H | M |
| 11 | **Hinglish quick add:** (built 9 Oct) "kal 5 baje @vikram #design !client", with the parsed tokens shown as chips before saving. | Developer, PM | H | S |
| 12 | **Arc:** (built 9 Oct) connect a real AI key, with a usage cap per plan. AI is in the pitch, so it has to work. | Owner | H | S |
| 13 | **User manual on the website** (built 9 Oct), with WhatsApp removed and the numbers updated. | New trial user | M | S |
| 14 | **Per-company PDF branding:** (built 9 Oct) heading colour from the company's own brand, not Flowbit's. | Owner | M | S |
| 15 | **Support access:** (built 9 Oct) list on the page what can be imported (9 importers) and what cannot (billing, inventory). | Flowbit team | M | S |

## Tier 2b: MCP and connectors (after v2.1, design in `docs/specs/mcp.md`)

- **Flowbit MCP server:** Claude or ChatGPT can read and update Flowbit.
  - Sign-in is OAuth, and every token gets only the permissions of that user's role.
  - Coverage: Work (tasks), Orbit (CRM), Folio (draft invoices and quotes only), and People (read only).
  - Never: attendance, payroll, issuing invoices, payments, deletes.
  - Bulk updates from Slack or email go through plan → preview → apply. Each apply is one batch that can be undone, and each change is linked to its source.
- **Connectors:** Slack, email-to-task, Google Calendar and Meet, Tally export, Zapier/webhooks.

## Tier 3: later, or as a separate paid add-on

| Change | Note |
|---|---|
| **Meetings AI (Fireflies style)** (built 9 Oct, step 7: upload + Recall notetaker) | **MVP:** upload a recording → Sarvam transcript (₹45/h with speaker labels; handles Hinglish) → minutes (agenda, notes, decisions, action items with owner and date) → draft tasks. About ₹50 per hour of meeting. **Full:** a recording bot via Recall.ai ($0.50/h; covers Meet, Zoom and Teams), about ₹90 per hour. At 100 customers × 20 h this could cost ₹1–1.8 L a month, so **sell it as a paid add-on with an hours cap**. Consent: the bot must announce itself and recordings need a delete option (DPDP). |
| Client portal (built 9 Oct, step 7) | Project status, approvals and invoices for the agency's client. A strong add-on. |
| Bank statement import → match receipts automatically (built 9 Oct, step 7) | Accountant |
| TDS worksheet / Form 16 in payroll (built 9 Oct, step 8: declarations, proofs, worksheet, 24Q CSV, Form 130 Part B) | HR. Without it, payroll still ends up in Excel. |
| E-invoice (IRN) / e-way bill via a GSP (built 9 Oct, step 8: generic GSP adapter, sandbox first) | Needed above ₹5 Cr turnover |
| Custom sending domain and portal domain (built 9 Oct, step 8: add-on `domains`) | Paid add-on, about ₹999 a month |
| Email-to-task (built, step 6), a personal Inbox/Triage, Gmail reply detection (built 9 Oct, step 8: reply inbox, Gmail read behind a flag) | |
| Hindi for My space, payslips and check-in (built 9 Oct, step 7; Hindi strings marked for review) | |
| 2FA for workspace owners (built 9 Oct, step 7), a security page (built 9 Oct, step 8: `/security`), a status page | Trust signals buyers look for |
| WhatsApp back | Once the Interakt partner deal is done |

## Advice: deprioritise these

The owner overruled this list: item 1 was built in step 7, items 2, 4 and 5 in step 8 (Tier 3b), as noted on each line. Item 3 (posts redesign) was not in step 8's scope.

1. **Meeting recording bot** (built, step 7): large, costly and carries a consent risk. Start with upload → transcript → minutes.
2. **Glass icons and animation for breaks** (built, step 8): cosmetic. The break types are what matter.
3. **Posts redesign:** posts are opened rarely. Image upload is what people will notice.
4. **"Old vs New" page** (built, step 8, as `/compare-v1-v2` with counted figures and no defensive copy) **with lines of code and test counts, and "Not vibe-coded" messaging:** buyers don't care about line counts, and the denial plants the doubt. Prove quality through speed and a working AI.
5. **Animated card borders, per-company themes and avatars** (built, step 8: presets with contrast checks, avatar style, skills and local time on member cards): polish, with a contrast risk. Fixing the gradient bug covers most of it.

## Ideas that are already built

These came up in the research but exist in code today:
- UPI QR and Razorpay link on invoices, with automatic receipts
- Quote → invoice in one click; deal won → quote or invoice
- IndiaMART, web form and webhook lead capture
- Owner morning brief (email)
- Billable timesheets with approval
- Compliance calendar
- Payment reminder schedule
- Blocker with comment
- Kanban view inside a space
- Email digest
