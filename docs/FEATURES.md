# Flowbit: feature list (as built, 11 Oct 2026)

This is a list of what the code does today. It is not marketing copy. Every item was checked against `src/` (mainly `src/lib/catalog.ts`, the pages under `src/app` and the modules under `src/modules`) and against the build log (`docs/archive/STATUS-HISTORY.md`). Refreshed on 11 Oct 2026 against the code at that date; where this page and the code disagree, the code wins and this page should be fixed.

**(v2)** marks a feature added after the v1 baseline commit `b972907` (7 Oct 2026). It was checked with `git diff --stat b972907..HEAD` for each area.

---

## 1. At a glance

- **Four products and one back office.** Flowbit Work (tasks and projects), Muster (HR and payroll), Orbit (CRM) and Folio (billing and collections) run in one app with one login. The Flowbit team uses a separate **Console** on its own host. Customers never see it.
- **One login.** A person has one account and can belong to several workspaces. Each workspace switches its products on or off in Settings → Modules.

| Number | Today | v1 baseline (`b972907`) | How it was counted |
|---|---|---|---|
| Pages | **186** | 122 | `find src/app -name page.tsx \| wc -l` (the baseline used `git ls-tree`). Includes marketing, auth, public link pages and the Console. |
| API routes | **88** | 39 | `find src/app -name route.ts \| wc -l` |
| Automated tests | **2,896** in **347** files | 915 | `npm test` (11 Oct). The baseline figure is the "before" count in the build log, v2 step 1. |
| Workspace roles | **8 built-in** + any custom roles, from **77** permissions | same | `BUILTIN_ROLE_KEYS` in `src/lib/permissions.ts`; `PERMISSION_DEFS` in `src/lib/catalog.ts`. The roles are Owner, Admin, HR admin, HR executive, Finance, Manager, Sales and Member. |
| Console staff roles | **3** (Admin, Sales, Accounts), from **27** Console permissions | none (v2) | `STAFF_ROLES` and `CONSOLE_PERMS` in `src/lib/console/roles.ts` |
| Lines of TypeScript in `src`, with tests | **183,734** in 2,449 files | 96,453 in 1,248 files | `find src -name '*.ts' -o -name '*.tsx'` minus `*.d.ts`, then `wc -l` (baseline: `git grep -c '' b972907`). Blank lines and comments are included. |
| Lines of TypeScript in `src`, without tests | **158,513** in 2,110 files | 89,875 | The same count, leaving out `*.test.ts(x)` |
| Size of `src` on disk | 15 MB | n/a | `du -sh src` |

Other counts used below: 20 HR letter templates, 9 importers, 14 cron endpoints under `src/app/api/cron/*` (21 entries in `vercel.json`, Vercel Pro required) plus the self-host `api/folio/cron`, 9 Muster reports, 5 Folio reports, 5 Work report sections.

---

## 2. Core (shared by all products)

### Sign-in and signup
- Sign in with email and password. Google sign-in works when it is configured; otherwise the button is disabled and says so.
- Forgot and reset password. Invite links. Sessions use httpOnly cookies with a 30-day sliding expiry. Auth routes are rate-limited.
- **Signup with an email code (v2).** A 6-digit code is valid for 10 minutes, with 5 tries and at most 5 codes an hour. Onboarding asks for the workspace name, a live check of the web address (slug), team size and invites, then project or personal mode. An optional GSTIN or PAN can be given. Only one Free workspace is allowed per verified user, GSTIN or PAN, and at most 3 workspaces per user per day.
- **(v2)** Every signup and demo request also creates a lead in Vistaar's own Orbit (when `FLOWBIT_HOUSE_ORG_SLUG` is set). UTM tags from the first visit are kept for 30 days and stored on the workspace.

### Workspaces, roles and permissions
- A workspace switcher sits in the side panel. Each workspace has its own logo, name and modules.
- Members: invite, change role, disable, re-enable and resend an invite. When no email provider is set, the invite link can be copied.
- Roles: 8 built-in roles, plus custom roles made from a permission matrix (Settings → Roles).
- A product the workspace has not bought opens a **preview page** with sample data, the price, and Start trial / Add to plan (owners) or "Ask your admin" (others).
- Audit log with CSV export.

### Plans and account types (v2)
- **Start free.** A team of **5 or fewer** starts on **Free for 6 months**; a **bigger team** starts a **15-day trial**. Signup decides from the larger of the team-size answer and 1 + invites (`signupAccountType` in `src/lib/account-types.ts`).
- **Account types:** Internal, Test, Free, Trial, Paid and Comped. Internal and Test accounts are never billed and are left out of every Console number.
- **Free:** up to 5 billable seats (the higher of logins and on-payroll employees), every product, 2 Folio firms, for 6 months. After that the workspace becomes read-only, then blocked. **Free gets no paid add-ons** (client portal, Meetings AI, custom domains), even if one is switched on (`hasAddOn` in `src/lib/addons.ts`).
- **Trial:** 15 days, once per business (matched by GSTIN, else PAN, else owner email), with every product and every add-on. A trimmed team can go back to Free ("Stay on Free").
- **No separate product trial.** A locked product page offers Add to plan only (product trials already running end normally).
- **Paid:** the plans and prices in `lib/plans`, as overridden in Console settings. **Yearly = 10 × monthly** ("2 months free", `YEARLY_MONTHS = 10`), and the **first yearly invoice is 50% off** (Console → Settings → Limits, 0–90, default 50; 0 turns it off). GST 18% is worked out on the discounted value. Renewals and monthly invoices pay list price.
- **Lifecycle:** read-only 30 days after Free or trial ends (or after the 7-day payment grace), then blocked, then deleted 90 days after blocking. A workspace the owner deletes is purged 30 days later. Deletion runs for real on a deployed production server (`LIFECYCLE_DELETE_ENABLED=false` is the kill switch) and as a dry run elsewhere.
- A 6th seat on Free is refused with an "Upgrade or start a 15-day trial" prompt.
- **Folio alone** includes 3 users and 2 firms; a 4th user with any Folio permission is refused ("Move to Suite for more"). Extra firms cost ₹199 a month each. Suite has no Folio user limit.
- Reminder emails go out as Free nears its end (30, 7 and 1 days), as a trial nears its end (3 and 1 days), and before read-only, blocking and deletion. Day 1, 3 and 7 onboarding emails are skipped when the step is already done.

### Subscription and billing pages
- **Settings → Subscription:** plan picker, checkout through Razorpay (or a simulated payment in test mode), state panel (days left, what happens next) and billing history with Flowbit's GST invoices.
- **Settings → Billing (v2):** due bills with Pay now, invoices to download, autopay (set up or cancel), "Paid offline?" (UTR and screenshot) and the transfers you reported. It stays open even when the workspace is blocked.

### Notifications (v2 except the bell)
- **Bell:** checks every 30 seconds. All / Unread filter and grouping by item, for example "3 updates on 'Homepage copy'" (v2). There is also a full notifications page.
- **My alerts (v2):** a grid of event group by channel (in-app, email, WhatsApp) that overrides the workspace defaults (Settings → Notifications).
- **Digest (v2):** hourly or end of day (18:00). Comment alerts are always hourly.
- **Quiet hours (v2):** default 21:00–08:00 IST, set for the workspace or per person.
- **Snooze (v2):** 1 hour, the rest of today, or until a date.
- **Leave and holidays (v2):** non-urgent email and WhatsApp alerts wait until 09:00 on the person's first working day back. Security mail always goes.
- **(v2)** Every alert email links back to its item, and meeting emails carry a calendar (`.ics`) invite. Approval emails have Approve / Reject buttons and task emails have Mark done / Snooze 1 day. These buttons work through signed one-time links (`/a/<token>`), and the landing page asks you to confirm before anything happens.
- **(v2)** An unsubscribe link and one-click unsubscribe headers. Security mail, payslips and documents sent by hand ignore unsubscribe.

### Morning briefs (v2)
- Profile → Briefs: each person can have several briefs, each with a time, days, frequency, channels, ordered sections, filters and "skip if empty". There are role presets and a "Send me a preview now" button.
- Sections: Work (due today, overdue, this week, blocked, today's meetings, timesheet), Approvals, Team (out or late today, team overdue), Money (due and overdue with the top 5 clients, yesterday's receipts, this month's billing), Sales (follow-ups, new leads yesterday, deals closing this week) and Compliance (statutory dates in the next 7 days).

### Automations engine (v2)
- Rules start from an event, a date offset or a schedule. They can have conditions, a delay, business hours (Mon–Sat 09:00–18:00 IST) and a per-contact daily cap (3 by default). Each rule sends a message, creates a task or follow-up, or raises an in-app alert. Every run is kept in a history.
- Settings → Automations lists the recipes by area with on/off switches and run history. The editor has variable chips, a live preview, a "Test on me" button, "Reset to Flowbit's wording" and "Use Hindi wording". The Hindi text is a draft waiting for the owner's review.
- **New automation:** a builder for rules from scratch. Custom rules can be deleted.
- **Recipes, Money:** payment thank-you (on), part-payment acknowledgement (on), invoice issued → send (off), payment reminders (shares the Folio reminder switch), overdue 30 days → owner alert and call follow-up (on), quote not accepted in 3 days (on), quote expiring in 2 days (on), quote accepted → owner alert and convert task (on), retainer drafts → review (off), monthly statement on the 1st (off), UTR shared → verify task (on).
- **Recipes, Team:** task overdue 3 days → project lead (off), leave pending 24 h → approver (on), leave pending 48 h → escalation (on), meeting in 15 minutes → attendees (on).
- **Recipes, Sales:** new lead (alert and welcome email), not contacted in 2 h (nudge), not contacted in 24 h (sales managers), deal idle 7 days, deal won (team and owners).
- **Recipes, People:** attendance not marked by 10:30, forgot to check out by 19:30, birthday, work anniversary, new joiner welcome the day before plus a manager alert, weekly joining-document reminder, probation ending in 15 days, document expiring in 30 days, payslip ready (no amounts).
- **Recipes, Compliance:** a statutory due date in 3 days → accounts.

### Messages log (v2)
- Settings → Messages log replaces the old Email log (the old URL redirects). It shows every email, in-app and WhatsApp message with its channel, status, type and date filters, a per-message timeline, "Send again" and the reason a message was skipped.
- Failed sends are retried at 1 minute, 5 minutes, 30 minutes and 2 hours. Bounces and spam complaints stop non-essential mail to that address.

### Appearance
- Sound effects on or off, with a test button for each sound. Motion setting: System, Reduce or Full.
- **Brand colours:** primary, secondary and accent, with a live preview, a contrast check and reset. They apply to the whole shell for everyone, but only on Suite or during a trial.
- Workspace logo (Settings → Company profile). It shows at the top of the side panel and the phone top bar (the Flowbit logo only when none is uploaded), in the workspace switcher, on PDFs and in client emails.
- Dark theme only.

### Import and export
- **Settings → Import (v2):** download a CSV template, upload a CSV or XLSX, preview with row errors and a Free-seat warning, confirm, then undo within 7 days. Import history is kept.
- **The 9 importers:** team members and invites; Muster employees; attendance; Work projects; Work tasks; Orbit leads; Orbit contacts and companies; Folio clients; Folio items. Employees, attendance and leads can also be imported from their own pages.
- **Workspace export (v2):** Settings → Export (owner only, in every state including blocked) downloads a ZIP with JSON, CSV and files.
- **CSV exports:** people, attendance (by date range), leads, clients, audit log, Work reports, HR reports, Folio reports, ledgers, expenses, forecast and P&L. Ledgers also download as PDF.

### Privacy, DPDP (v2)
- Export one person's data (JSON) or erase it, for a client contact, a lead or a member. Start from the contact or lead page, or search by email or phone in Settings → Privacy. Invoices, payroll, the audit log and the opt-out record are kept.
- Message, delivery, automation, WhatsApp chat and payment-webhook logs older than 13 months (395 days) are pruned, for real in deployed production (`RETENTION_PRUNE_ENABLED=false` is the kill switch), as a dry run elsewhere.
- Breach notices are sent from Console → Incidents, following `docs/BREACH-RUNBOOK.md`.
- The DPA page (`/legal/dpa`) records when the owner accepts it.

### Support access (v2)
- Flowbit staff ask for **read-only** access (1–72 hours) or **import-only** access (7 days). The owner approves or declines in Settings → Support access.
- While access is on, everyone sees a banner, and each visit is written to the workspace audit log. Salary, bank and PAN details stay masked for the Sales and Accounts staff roles.
- Import-only access also needs the DPA to be accepted.

### Compliance calendar (v2)
- Settings → Compliance calendar holds the FY 2026-27 dates as data: GSTR-1, GSTR-3B (with the QRMP dates), PMT-06, TDS deposit and returns, PF and ESI, professional tax (a default day for 9 states, editable) and advance tax.
- Each workspace sets its filer type, state and which items apply. One date can be overridden when the government extends it; it then shows as "Extended".
- Reminders go out 3 days before, and the dates also appear in the brief. The page carries a "verify before relying" note.

### Setup guide (v2)
- A "Setup guide" card on Home, shown to owners and admins while the Flowbit team runs a handover or for the first 30 days, until "Go live". The help video links come from Console settings.

### Public document links (v2)
- `/d/<token>`: a signed link that cannot be guessed. It can be turned off or set to expire, and opens are counted.
- **Invoice:** lines, totals, PDF, a UPI QR for the balance, "Pay now" (Razorpay link) and "I've paid" with a UTR.
- **Quote or proforma:** accept (typed name, comment, IP address and time) or decline.
- **Credit note, receipt and statement:** view and PDF.
- The pages use the workspace logo and brand colour. Invoice, quote, receipt and credit-note pages in the app show "Online link and activity" (sent → delivered → read → opened → accepted → UTR shared → paid).
- Other public pages: `/bill/<token>` (Flowbit's own bills), `/p/<token>` (payslip after an email code), `/a/<token>` (approve from email), `/c/<slug>` (claim form) and `/unsubscribe/<token>`.

### Mobile and PWA (v2)
- Touch-friendly kanban boards (press and hold to drag). Controls that appear only on hover on desktop are always visible on touch screens, and touch targets are at least 44 px.
- On phones the task calendar, leave calendar and meetings week become day-by-day lists, and the timesheet becomes a day form.
- On phones every dialog opens as a bottom sheet, and a quick check-in button sits in the top bar.
- Installable as an app (manifest and icons). There is no service worker, so nothing works offline.

### Search and shell
- A gradient nav rail and a side panel built from the catalog. ⌘K opens a command palette and search. The top bar has a breadcrumb, the bell and the user menu.
- A check-in widget in the side panel (see Muster).

### Arc AI
- Arc has workspace search and three helpers: Outline a project, Break down a task and Progress update. Nothing changes until you click Apply.
- **Without `ANTHROPIC_API_KEY`:** search works, and the three helpers produce text from fixed templates. **With the key**, the helpers draft with Claude. No AI key is set up today, so in practice Arc runs on templates (`src/modules/work/arc/templates.ts`, `claude.ts`).

---

## 3. Flowbit Work

### Home
- Greeting and a workday timeline (punches for today).
- Three stat cards with sparklines (In progress, Overdue, Completed), switchable between "Me" and "Everyone".
- Project overview ring chart with a project switcher, or "My tasks" counts when there are no projects.
- An "Assign to me" table with All task / Done / Due tabs and a quick-complete checkbox on each row. There is no quick-add field in this widget: the "New task" button opens a dialog.
- My attendance card with a bar and a calendar.
- Arc card, the setup guide card (v2), and a "Getting started" card for empty workspaces.

### Tasks
- **Views:** List, Board (drag between columns) and Calendar. **(v2)** On phones the calendar becomes an agenda list and the board works by touch.
- Statuses: To do, In progress, In review, Blocked, Done. Priorities: Low, Medium, High, Urgent.
- Filters (assignee, project, client, space, folder, due date, status, "Me", personal), search, sort and saved views.
- Quick add, and a New task dialog. Personal tasks are supported.
- **Bulk actions:** status, priority, assign, due date, project and delete.
- **Blocked:** moving a task to Blocked asks "Why is this blocked?" with @mentions. The reason is stored on the task, written to its activity, and the mentioned people are notified.
- **Task detail:** a full page (`/app/work/tasks/[id]`) with title and description editors, an attribute panel (status, priority, assignees, dates, project, client, milestone, estimate), subtasks, checklist, comments with @mentions, replies and reactions, attachments with preview, activity, watchers and time logged.
- **Task alerts:** assigned, @mention, blocked, due today and overdue; comments go out as an hourly digest. **(v2)** Task emails carry Mark done / Snooze 1 day buttons.
- A task picks up the client of its project automatically.

### Spaces
- Spaces contain folders, and folders contain lists. Each has its own members, colour (8 preset colours) and icon.
- A space has an Overview tab (tasks by status, recent tasks, files and links) and a Tasks tab with the full task views (list, board and calendar).
- Folders can be reordered and archived.

### Projects
- A project list with cards. Inside a project: Overview, Tasks, Milestones, Files, Activity and Settings tabs.
- Health score, progress ring, project lead, members, client link and colour (8 preset colours or a custom colour). Project logo (JPEG/PNG): set at create or in Settings, shown on cards, the table and the page header.

### Teams
- Team cards show the initials square, description, lead, member avatars and open tasks. A card lifts slightly on hover. There is only a card view, with no list view.
- Team detail has a Members table and a Workload tab with period switches.

### Meetings
- List and week calendar views. **(v2)** On phones the week becomes a day-by-day list.
- Each meeting has an agenda, a location, a meeting link (pasted by hand, or a **Google Meet link created through Google Calendar** when the organiser has connected Google in Settings → Google), attendees, RSVP and notes. Connected meetings sync to Google Calendar.
- Action items with an assignee and due date. **Create task** turns one item, or all open items, into tasks.
- **(v2)** Invite, update and cancel emails carry a calendar (`.ics`) entry, and a "meeting in 15 minutes" reminder recipe exists.
- **Meetings AI (v2.2, paid add-on `meetings_ai`, or a trial):** upload a recording or send the "Flowbit Notetaker" bot (Recall.ai) to a call; Sarvam transcribes it (speaker names, Hinglish); Claude drafts the minutes (MOM) and action items, which stay drafts until someone presses Create task. Hours a month are capped per plan; recordings past the workspace's retention are purged (dry run unless `MEETINGS_PURGE`).

### Posts
- **(v2.1)** Ten types with duotone icons: Announcement, Update, Kudos, Celebration, Policy, Question, Poll, Win, Welcome, Event. Only managers and admins can post announcements and policies. Priorities (announcements) run from Low to Urgent.
- **(v2.1)** Policy posts ask for "I've read this"; the author sees who has not, exports the list as CSV and reminds only them. Kudos tag people and tell their managers; the Muster profile has a Kudos tab. Polls: single or multiple choice, anonymous, close date, live results. Scheduled publishing.
- **(v2.1)** Audience: the whole workspace, chosen roles, teams, departments or work locations, or private.
- **(v2.1)** Automatic birthday, work-anniversary and new-joiner posts from Muster data (Settings → Automations, on by default).
- Pinning (a Pinned section on top), read receipts ("seen by"), replies, emoji reactions, @mentions, filter chips by type, mentioned/about me, author, search, sort and an announcement pop-up on sign-in.
- **(v2.1)** Image upload, and GIF search through Klipy when `KLIPY_API_KEY` is set (a picked GIF is copied into the workspace; without the key there is no GIF button).

### Time tracking and approvals
- A server-side timer, manual entries, billable or non-billable flag, a weekly timesheet and Submit week.
- The direct manager approves. **(v2)** Approval also works from email. On phones the timesheet becomes a day form.

### Whiteboards
- Excalidraw boards with autosave, a version check, image upload and thumbnails.

### Reports
- Throughput, Overdue (with aging buckets), By assignee, Project health and Time by project, with filters and CSV export.

---

## 4. Muster (HR and payroll)

### HR dashboard
- Headcount and today's attendance, with a range chart (Today, 1M, 6M, 1Y, Custom) showing present %, late, absent, on leave and WFH.

### People
- List, add, edit and CSV import with a preview. Profile tabs: Profile, Job, Documents, Nominees, Bank & statutory, Remarks, Attendance, Leave, Letters and Payslips.
- 13 lifecycle statuses. HR verifies bank changes, and **(v2)** can verify them from email.
- **Joining documents:** HR sets the mandatory documents and a threshold (default 60%). A person below the threshold cannot be made active unless an HR admin gives a reason, which is audited. Employees upload their own documents.
- **(v2)** Probation end date, and an expiry date on documents.
- **Remarks:** Performance note, Concern, One-on-one and General. General and One-on-one remarks are visible to the employee.

### Attendance and check-in
- **Check-in:** a web check-in widget in the side panel and **(v2)** a quick check-in in the top bar on phones.
- The punch types in code are exactly: **Check in**, **Take break**, **Resume** and **Check out** (`in`, `break_start`, `break_end`, `out` in `src/models/AttendanceDay.ts`).
- **(v2)** Four break types: Lunch, Power Nap, Tea/Coffee and Personal/Rest (`src/lib/break-types.ts`). Each is paid or unpaid with a daily limit in minutes, set in HR settings → Attendance rules (defaults: Lunch unpaid 45 min, Power Nap paid 20, Tea/Coffee paid 30, Personal unpaid 30). The limit is checked when a break starts. Paid breaks count towards payable minutes up to their limit; unpaid breaks, minutes past the limit and untyped breaks (WhatsApp) never do.
- **(v2.1)** Location consent: before the first located check-in the employee accepts a versioned notice; a new notice version asks again.
- **(v2)** Check in from WhatsApp with a shared location, through the employee bot.
- **(v2.1)** Location at web check-in: off, optional or required per workspace, after a notice the employee accepts; optional office geofences flag or block check-ins outside; the daily view shows each place with a map link.
- **Statuses:** present, late, half day, absent, leave, holiday, week off, on duty, work from home, sick leave and paid half day.
- **Daily view** (the default): one row per person, tap a status, a reason when changing a recorded day, and "Mark remaining N present".
- Month register grid, HR override, lock and reopen a month with a reason, corrections (approve or reject, and **(v2)** from email), comp-off, CSV import with a template and preview, and a date-range CSV export.

### Leave
- Leave types and policy, balances, apply, manager → HR approval routing, a team leave calendar (**(v2)** as a list on phones), HR balance adjustments and comp-off credit.
- **(v2)** Approve or reject from email, and from WhatsApp quick replies. Pending-leave reminders go out at 24 h and 48 h.

### Payroll (Muster Business)
- An 8-stage run: attendance locked → claims closed → generated → HR reviewed → finance approved → locked → released → payslips published.
- Salary components and structures, dated PF, ESI, PT and LWF rates by state, holds, exclusions, adjustments, payslip PDFs and email.
- Bank payment file (Generic, HDFC-style or ICICI-style CSV) for a locked or released month.
- Gratuity report with exact tenure.

### Payslips
- Employees see and download their payslips in My payslips.
- **(v2)** A "payslip ready" message never carries amounts. A payslip link (`/p/<token>`) opens the PDF only after a code sent to the work email.

### Letters
- 20 templates with numbered references, PDF, email with an editable covering note and live preview, and revoke. Issued letters are never deleted. Draft letters can be rebuilt from the template.

### Claims (reimbursements)
- Categories with ceilings and claim forms. The public form (`/c/<slug>`) uses a work-email OTP and a receipt upload.
- A review queue: approve, approve a reduced amount, reject and bulk approve. Then send to payroll and mark paid. **(v2)** Approve or reject from email.

### Self-service (My space)
- My profile, My attendance, My leave, My payslips, My claims, My letters, My documents and **(v2)** My tax (regime choice, investment declarations and proofs within the HR windows, and the Form 130 summary). Each always shows the signed-in person's own record.

### Employee WhatsApp bot (v2, see section 7)
- Check in, check out, leave balance, apply for leave and payslip, in English, Hindi and Hinglish.

### Reports
- Employee master, attendance, leave, leave balances, salary register, statutory (PF/ESI/PT), payroll journal, claims and gratuity, each with a preview and CSV.

### HR settings
- Departments, designations, holidays, leave types and policy, attendance rules, joining documents and policy documents.

---

## 5. Orbit (CRM)

- **Dashboard:** the pipeline bar, a month target and follow-ups.
- **Leads:** table and board views. Stages are New, Contacted, Engaged, Meeting booked, Meeting done, Converted, Lost and Disqualified, with guards on each move. Convert a lead to a client and a deal. CSV import, a quick-add lead, and a timeline.
- **Bulk actions on the leads list:** select rows, then **Assign** (owner and reviewer), **Disqualify** with a reason (closers only), **Export** the selection as CSV, or **Clear**. There is no bulk email, reminder or automation on selected leads.
- **Deals:** a kanban board by stage (drag, and by touch on phones (v2)), with value and probability. Won and lost carry reasons, and a won deal shows a Folio card with "Create quote" and "Create invoice".
- **Activities:** calls, emails, meetings, notes and follow-ups, grouped as today, overdue or upcoming. Log activity and schedule a follow-up.
- **Contacts:** linked to their company and history. A WhatsApp button sends the hello template **(v2)** or opens wa.me.
- **Clients (shared with Work and Folio):** list with search and filters (owner, tag, status), sorting (name, recent, pipeline, outstanding), CSV export and new client. The detail page has Overview, Contacts, Projects, Tasks, Deals, Invoices, Ledger and Activity tabs, and tabs for products you do not have show a lock card. The page has KPI tiles and three charts (clients by health, new clients per month, top revenue), filters for status, owner, tag, health and new (30 or 90 days), a cards or list view, and Import (contacts and Folio clients importers) and Export buttons. Clients can have a logo (JPEG/PNG), shown on the client and on its tasks.
- **Reports:** cold vs warm conversion, conversion by source and by owner, and won/lost reasons, with charts.
- **Settings:** deal stages, lead stages, sources, sectors, close reasons, targets, general settings, and **(v2)** Lead capture.
- **Lead sources (v2):**
  - **Website form:** a public endpoint or `embed.js` script, with an origin allow-list, a honeypot field, rate limits and UTM fields.
  - **Lead webhook:** flat JSON (Zapier style), Meta lead ads and JustDial push. Repeats are acknowledged only once.
  - **IndiaMART (beta):** pulled every 15 minutes and de-duplicated by query id. It has not been checked with a real key yet.
  - **WhatsApp:** an unknown number becomes a lead with source WhatsApp, or "WhatsApp ad" when it comes from a click-to-WhatsApp ad.
  - **Assignment:** a fixed owner or round-robin. The assignee is alerted at once.

---

## 6. Folio (billing and collections)

- **Receivables dashboard:** receivables, overdue, collected, aging, top debtors, a six-month trend and P&L and forecast cards. A firm switch shows Combined or one firm, and a period picker sets the window (This month, Last month, This FY, Last FY, Custom).
- **Invoices:** draft → issue, with number series per entity and financial year. CGST+SGST or IGST is worked out from the place of supply. Also non-GST sale invoices and reverse charge. PDF, email, void with a reason, write-off and duplicate. **(v2)** Online link, "Create payment link" and Send on WhatsApp.
- **Quotes and proformas:** convert to an invoice in one click. **(v2)** Online accept or decline.
- **Receipts:** record money received and allocate it across invoices; the rest stays as an advance. **(v2)** Receipt PDF and an online receipt page.
- **Recurring:** retainers and billing plans (milestones) that create drafts for review.
- **Credit notes:** full or by line.
- **Client ledgers:** a running statement as PDF and CSV. **(v2)** An online statement link.
- **Collections:** an aging table, "Your queue today" (Mine or Everyone), everything overdue, follow-ups, automatic reminders (before, on and after the due date, each sent once), and a "WhatsApp to send" queue for wa.me.
- **Expenses:** firm, category, vendor, GST with an input-tax flag, payment mode, receipt upload, monthly repeats and CSV.
- **Profit and loss:** income, expenses by category, salaries (Combined view only) and net profit by month, with a chart and CSV. It is a management view, not statutory accounts.
- **Billing forecast:** the next 3 and 6 months from retainers and plan milestones, with CSV.
- **Reports:** GST (summary, B2B, B2CL, B2CS, exports, CDN, HSN and docs, for GSTR-1), sales register, collections, aging and revenue, each with CSV. They are tables only, with no charts.
- **Settings:** entities, banks, number series, signatory, tax, terms, services, reminders and expense categories. The plan includes 2 firms, and each extra firm costs ₹199 a month.
- **UPI QR (v2):** a UPI QR for the balance on the invoice PDF and the public page, using the bank's or entity's UPI ID.
- **Razorpay payment links (v2):** the workspace connects its own Razorpay keys, which are stored encrypted (Settings → Integrations → Razorpay). A payment link is made for the balance. When it is paid, the webhook records a receipt, allocates it, marks the invoice paid and sends the thank-you. Each payment is recorded only once.
- **Branded client email (v2):** invoices, quotes, statements and reminders carry the workspace logo, name and primary colour.
- **PDF branding:** documents carry the entity's or workspace's logo and details. The heading colour is a fixed Flowbit purple (`PDF_COLORS.brand` in `src/lib/pdf/base.tsx`), so PDFs do not follow the workspace's brand colours.

---

## 7. WhatsApp: built, hidden at launch

**Status: built and hidden.** WhatsApp is on only when both switches are on (`isWhatsAppOn` in `src/lib/feature-flags.ts`): the env flag `FEATURE_WHATSAPP` (off by default; accepts `on`, `true`, `1` or `yes`) and Console → Settings → Features → WhatsApp (on by default, so staff can switch it off without a deploy). The provider is **Interakt**: Flowbit's own numbers, and each workspace's own Interakt account (bring your own). The public site says "coming soon".

- **Platform sender (Flowbit's own number, through Interakt):** bills, receipts, reminders and verification codes to workspace owners and admins who verified their number with an OTP and opted in (Profile → WhatsApp from Flowbit). It falls back to email when no key is set or a send fails. STOP replies are honoured everywhere.
- **Bring your own Interakt (workspace number):** Settings → Integrations → WhatsApp has the API key and webhook secret (stored encrypted), a webhook URL, Test connection, template mapping (English and Hindi text in `docs/WHATSAPP-TEMPLATES-CUSTOMER.md`), 30-day status and Disconnect. The "Flowbit-managed" mode is shown as "Coming soon" and does not send.
- **Wallet:** Settings → Billing → WhatsApp wallet. Promo and paid balances, a free monthly allowance by plan, daily and monthly caps, low-balance alerts, recharge packs from ₹500 with bonus credit and a GST invoice, a ledger, and expiry after 12 months. Auto top-up is stored but never charges. There is no cash-out.
- **Send on WhatsApp:** on invoices, quotes, proformas, credit notes, receipts and statements, with a template preview, the PDF and the public link. Also used by collections reminders, automatic reminders, automations and Orbit contacts and leads.
- **Inbox:** `/app/whatsapp`, shown in the nav only when connected. Threads matched to a client, lead or member, assignment, open / assigned to me / closed views, unread counts, free replies only within 24 hours (after that, a follow-up template), STOP and START, saved replies and "Send document".
- **Quick replies:** Approve / Reject, Mark done / Snooze, Accept a quote, and "I've paid" (which asks for the UTR).
- **Employee bot:** off by default. It answers only verified, opted-in members: menu, check in (with location), check out, leave balance, guided leave application and payslip link, in English, Hindi and Hinglish.
- **Team alerts:** the WhatsApp column in the notification grids turns on once the workspace is connected.
- **Console → Messages:** Flowbit's own inbox (see section 8).
- Interakt, IndiaMART and Meta behaviour is coded from documentation and has not been tested against a live account.

---

## 8. Console (Flowbit team back office, all v2)

- **Host and sign-in:** `console.useflowbit.com`, with its own cookie. Sign-in is a password, then a TOTP code (or one of 10 recovery codes). First sign-in enrols with a QR code. Setup links last 48 hours. Sign-in is rate-limited.
- **Staff roles:** Admin (everything), Sales (accounts, one trial extension of up to 15 days, support requests, imports, handover, bills, inbox, reports) and Accounts (billing, payments, credit notes, TDS, inbox, reports). Only the founder can open an Internal workspace. Console → Staff can add staff, change roles, disable, reset sign-in and send setup links.
- **Home:** signups this week; Free, Trial and Paid counts; accounts in setup; habit formed; conversions; Free ending in 30 days; overdue amount; **Call today**; Sales alerts; a signups chart; recent payments; demo requests.
- **Accounts:** filters for type, status, health, salesperson ("My accounts") and days left, sorted by days left.
- **Account detail:** contact, type and plan, seats used against the limit, health signals, salesperson, notes, handover checklist, support access, imports, WhatsApp wallet (promo grant and free-message override) and a Timeline tab (signup, usage per day, plan changes, payments, messages, imports). Role-gated actions: extend trial, end trial, plan, type, status, disable and restore.
- **Health score:** a nightly job scores each account Green, Amber or Red from usage events. **Call today** lists Red accounts with more than 5 seats and Free accounts in their last 30 days. A limit hit or an Upgrade click alerts the salesperson.
- **Setup and handover:** a checklist (data, roles, PM invited, kickoff, training, live). A weekly cap on free setups applies, and a free setup needs a yearly paid or comped plan.
- **Billing:**
  - **Due bills** with a Razorpay link, a public `/bill/<token>` page and PDF. On payment the bill becomes a GST tax invoice (`FB/<FY>/NNNN`).
  - **Autopay** (UPI Autopay / e-mandate) with a pre-debit notice.
  - **Offline payments:** UTR and screenshot, provisional access for 7 days, and maker-checker verification (the person who recorded a payment cannot verify it).
  - **TDS:** a 2% deduction, settled at 98% or more, with certificate tracking.
  - **Credit notes and refunds** (refunds go only to the original Razorpay payment).
  - **Dunning:** reminders 15, 7, 3 and 1 days before the due date, on the day, and 1, 3 and 7 days after, by email then WhatsApp.
- **Messages:** an inbox for Flowbit's WhatsApp number (assign, reply within 24 hours, once-a-day auto-reply) and a delivery log with costs.
- **Reports:** funnel, money (MRR, ARR, movements, renewals, overdue, collections, TDS, wallet margin), team and marketing (by UTM), each with CSV. Each role sees only its own sections.
- **Settings:** prices, limits, email templates, help links, WhatsApp templates and rate card, and wallet allowances. The product reads these values.
- **Incidents:** a breach notice to the owners of chosen workspaces.
- **Audit:** a row for every staff action, also written to the workspace's own audit log.

---

## 8b. Integrations and add-ons (v2.1–v2.2)

- **Client portal** (`/portal/<workspace>`; paid add-on, included in Suite): clients sign in with an emailed code and see their documents and files.
- **Connected apps (MCP):** Claude and ChatGPT connect to `/mcp` through Flowbit's own OAuth server; Settings → Integrations → Connected apps lists connections, history with undo and an admin switch. Free workspaces cannot connect.
- **Slack app:** `/flowbit` command and message shortcut (Settings → Integrations → Slack).
- **Email to task:** each member forwards mail to their own `tasks+…` address (Profile).
- **Outbound webhooks:** HMAC-signed (`X-Flowbit-Signature`), retried for about 9 hours, SSRF-guarded (Settings → Integrations → Webhooks).
- **Orbit sequences:** multi-step follow-up sequences (emails in an IST send window, call tasks, waits) that stop on a reply (`/app/orbit/sequences`).
- **Folio bank reconciliation:** import bank statements (bank presets, re-imports skip rows already in, undo within 7 days) and match deposits to receipts (`/app/folio/bank`).
- **E-invoice:** IRN, cancel and e-way bill through a GSP (sandbox first), per GST entity.
- **Tally export:** XML vouchers and ledgers, with a ledger mapping in Folio settings.
- **Custom domains** (paid add-on): a workspace's own sending domain and portal domain (Settings → Domains).
- **Biometric attendance import:** device export formats with a column mapping.
- **Salary TDS:** HR Salary tax (`/app/hr/payroll/tax`), employee My tax (declarations and proofs), Form 130 PDF and Form 138 quarterly export, from tax year 2026-27.
- **Two-factor sign-in** for workspace users (Settings → Security), which owners can require for admins.
- **Hindi:** employee self-service surfaces only, not the whole app.
- **Status page:** `/status` shows app, database, email and cron health.

## 9. Marketing site

- Pages: landing page, pricing (monthly or yearly toggle, calculator, compare table), four product pages (`/products/work`, `muster`, `orbit`, `folio`) and contact (stored as a demo request). OG images.
- Legal: terms, privacy, refunds and **(v2)** DPA.
- Auth pages: login (shows the four products), signup, forgot password, reset, invite and **(v2)** unsubscribe.
- The marketing site reads prices from the code (`lib/plans`), not from Console settings.
- **Help (10 Oct):** `/help` (help centre: a card per product and area, each opening its manual chapter), `/faq` (105 questions in 8 categories with search, category chips, anchors, `<details>` accordions and FAQPage JSON-LD; data in `src/modules/marketing/content/faq/`, the one source for the landing, pricing and product FAQs), `/manual` and `/manual/<chapter>`. Each product page has a "How to use" section. The header has a Help menu, the footer a Help column, and the account menu opens `/help`.

---

## 10. Not built / known gaps (from the 8 Oct review, refreshed 11 Oct)

| Item | Status | Where |
|---|---|---|
| Quick add in the Home "Assigned to me" widget | **Exists.** The widget has an inline quick add as well as quick-complete. | `src/components/work/dashboard/assigned-quick-add.tsx` |
| Break types Lunch / Power Nap / Tea-Coffee / Personal-Rest | **Exists.** Four types, each paid or unpaid with a daily limit (section 4). | `src/lib/break-types.ts` |
| Project and client logo upload (JPEG/PNG) | **Exists.** Resized in the browser to 256 px. Project logos are set at create or in Settings and show on cards; client logos show on the client and its tasks. | `src/modules/work/projects/logo-actions.ts`, `src/components/ui/logo-upload.tsx`, `src/components/clients/client-mark.tsx` |
| Project colour options | **Exists.** 8 preset colours plus a custom colour picker. | `src/modules/work/projects/constants.ts:15`, `src/components/work/spaces/color-swatches.tsx` |
| Teams card + list view | **Partial.** Cards only; no list view. | `src/app/app/work/teams/page.tsx`, `src/components/work/teams/team-card.tsx` |
| Posts image and GIF upload | **Exists.** Image upload, and GIF search with `KLIPY_API_KEY`. | `src/modules/work/posts/image-actions.ts`, `src/modules/work/posts/gifs.ts` |
| Post types | **Exists.** 10 types (section 3). | `src/modules/work/posts/post-types.ts` |
| Task blocker plus a blocker comment | **Exists.** Blocked asks for a reason with @mentions; it is stored, logged in the activity and notified. | `src/components/work/tasks/blocked-dialog.tsx`, `src/modules/work/tasks/mutate.ts:88-111` |
| Client logo on tasks | **Exists.** A task shows its client's logo before the title, and the client page has a Tasks tab. | `src/components/work/tasks/client-logo.tsx`, `src/app/app/clients/[id]/page.tsx` |
| Clients import | **Exists.** The Clients page has Import (contacts, Folio clients) and Export. | `src/app/app/clients/page.tsx` |
| Clients dashboard charts and filters | **Exists.** KPI tiles, three charts, and filters including health and new (30/90 days). | `src/components/clients/clients-dashboard.tsx` |
| Spaces kanban | **Exists.** A space's Tasks tab has the List / Board / Calendar views. The space list itself is cards only. | `src/app/app/work/spaces/[id]/page.tsx:125` |
| Meetings: Google Meet link | **Exists** with Google connected (Calendar sync creates the Meet link); otherwise pasted by hand. | `src/modules/work/meetings/google-sync.ts` |
| Meetings: recording or transcription | **Exists** (Meetings AI add-on: upload or Recall notetaker, Sarvam transcription). | `src/modules/work/meetings/ai/` |
| Meetings: MOM | **Exists** with Meetings AI (Claude drafts minutes and action items); otherwise typed by hand. | `src/modules/work/meetings/ai/minutes.ts` |
| Meetings: action item → task | **Exists** for one click (one item or all open items). AI-drafted items stay drafts until Create task. | `src/modules/work/meetings/item-actions.ts:60`, `src/components/work/meetings/action-items.tsx` |
| Per-company branding on PDFs | **Partial.** The logo and company details are the workspace's or entity's; the heading colour is fixed Flowbit purple and the PDF metadata says Flowbit. | `src/lib/pdf/base.tsx:36,108`, `src/components/folio/pdf/assets.ts` |
| Orbit bulk automation on selected leads | **Missing.** Bulk actions are Assign, Disqualify, Export and Clear only. | `src/components/orbit/lead-table.tsx:51-78` |
| Folio report charts | **Missing.** Reports are tables and CSV only; charts exist on the dashboard, P&L and forecast. | `src/app/app/folio/reports/page.tsx` |
| Appearance gradient applying everywhere | **Bug.** Brand colours override only some gradients. `--grad-button-alt`, `--grad-selected` and `--grad-step` stay fixed, and the check-in widget, Arc card, Arc page, auth card and brand mesh have hard-coded purple gradients. | `src/lib/brand-theme.ts:98-106`, `src/app/globals.css:72-90`, `src/components/shell/check-in-widget.tsx:20`, `src/components/work/dashboard/arc-card.tsx:34` |
| Logo applying everywhere | **Exists.** The workspace logo shows in the side panel and phone top bar (`WorkspaceLogo`), falling back to the Flowbit logo. | `src/components/shell/workspace-logo.tsx` |
| Red "test" text in the UI | **Not found in code.** No hard-coded red "test" string exists. The nearest matches are the amber "Test mode" labels on Subscription, the plan summary and Integrations, shown while Razorpay has no live keys. A screenshot is needed to locate it. | `src/app/app/settings/subscription/page.tsx:117`, `src/components/settings/plan-summary.tsx:36`, `src/app/app/settings/integrations/page.tsx:103` |
| Comment performance | **Likely cause found.** Posting a comment runs about 6 database steps in a row, then waits for every mention and watcher notification (which may try to send email at once), then refreshes the whole `/app` layout. A task loads all its comments with no limit. | `src/modules/work/tasks/comment-actions.ts:25-39`, `src/modules/work/tasks/revalidate.ts:6`, `src/modules/work/tasks/detail.ts:47` |
| Clients page performance | **No obvious cause.** The list is paged (25), the per-client numbers come from 4 batched aggregations, and the indexes exist. Sorting by pipeline or outstanding loads up to 2,000 clients and their numbers. It needs measuring. | `src/modules/clients/queries.ts:57-87` |
| Support access scope | **Partial.** Two modes exist: read-only (1–72 h) and import-only (7 days). The Settings page does not say what import access covers. The 9 importers are team, employees, attendance, projects, tasks, leads, contacts, Folio clients and Folio items; there is none for billing or inventory. | `src/app/app/settings/support/page.tsx:35`, `src/modules/imports/types.ts:8` |
| User manual on the website | **Exists.** `/manual`, `/help` and `/faq`. | `src/app/(marketing)/manual`, `help`, `faq` |

### Other gaps worth knowing
- WhatsApp is hidden by the `FEATURE_WHATSAPP` flag and the Console switch (section 7).
- There is no single approvals inbox: approvals live on each product's own page (leave, corrections, claims, time approvals).
- Posts, Teams and the task detail have not been redesigned (review items 9, 12 and 13).
- The task detail is a full page, not a side panel.
- On Vercel, uploads are capped at 4 MB (`MAX_UPLOAD_MB`). The old manual says "up to 10 MB" in places.
- The product gaps in `docs/STATUS.md` ("Known product gaps") still apply, for example payroll freshness checks and duplicate retainer drafts under concurrent runs.

### The old user manual (`flowbit-launch/manual`) compared with the code
- It is up to date with v2 for the customer app. It has 118 screenshots and topics for My alerts, Briefs, Automations, Billing, Wallet, WhatsApp, Import, Export, Compliance, Privacy and Support access.
- It describes WhatsApp in about 85 places. Those parts must come out or be marked "coming later" when WhatsApp is hidden.
- It does not cover the Console. That is correct, because the Console is internal.
- Its check-in section must describe the four break types (paid and unpaid, with limits) and location consent; the in-app manual (`content/manual/35-me.html`) does.
- It states a 10 MB upload limit, but Vercel caps uploads at 4 MB.
