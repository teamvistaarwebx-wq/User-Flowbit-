# Flowbit 2.0: overlaps, conflicts and confusing concepts (part A: concepts, navigation and naming)

Read-only audit, 11 Oct 2026. No code was changed. Every claim below was checked in the code, and each one cites file:line or a route. Items are ranked by user impact: how many people hit the problem, multiplied by how badly it misleads them.

Key: **Effort** S = under a day, M = 1–3 days, L = a week or more. **Owner?** = needs a product decision before anyone builds it.

Personas: **Owner** (signs up, pays, sets up), **Admin**, **HR** (HR admin or executive), **Finance**, **Manager**, **Sales**, **Employee** (Member role), **Buyer** (a visitor on the website).

---

## Ranked list

### 1. Company details live in five places, signatories in four, working hours in two
**Status:** Fixed a03d79b (Form 130 signer, billing details, firm signatory overrides, working hours read-only in General with Muster).

**What overlaps**
- Legal name, GSTIN, PAN, address and logo:
  - Settings → Company profile (`src/app/app/settings/company/page.tsx:22-40`)
  - Folio → Settings → Entities: legal name, GSTIN, PAN, CIN, address and logo for each entity (`src/components/folio/settings/EntityDialog.tsx:71-103`)
  - Settings → Subscription → "Billing details": name, GSTIN and address on Flowbit's invoices (`src/components/settings/billing-details-form.tsx:19-30`)
  - Settings → General: the workspace name, "shown … on the header of every PDF" (`src/components/settings/general-forms.tsx:67`)
  - Signup, which takes an optional GSTIN or PAN (docs/FEATURES.md §2)
- Signatories:
  - Company profile → Signatories (`company/page.tsx:46`)
  - Folio → Settings → Signatory, one per entity (`src/app/app/folio/settings/page.tsx:42`, `EntityForms.tsx:57-70`)
  - HR settings → Letter signatories (`src/app/app/hr/settings/page.tsx:48`)
  - Salary tax → Tax year settings, "Form 130 signed by" (`src/components/muster/tax/year-settings-form.tsx:20`)
- Working hours: Settings → General → Working calendar (`general-forms.tsx:109-124`, saved by `src/modules/settings/general-actions.ts:79`) and HR settings → Attendance rules (`src/components/muster/settings/attendance-rules-form.tsx:26-29`, saved by `src/modules/muster/settings/rule-actions.ts:128`). Both write the same `Org.officeHours` fields, under different labels ("Half day (hours)" in one, "Half day under (hours)" in the other).

**Why it confuses.** An Owner who fixes the address in one place still sees the old one on another PDF. HR edits the half-day threshold and then sees it "changed" on the General page. Nobody can tell which signature prints on which document.

**Resolution (merge).**
- Make Company profile the single source.
- Entities, letter signatories and the Form 130 signer should *pick from* the Company profile's signatory list. Each should show "Using company profile" with an override; Folio already does this for email, phone and logo (`EntityDialog.tsx:38-39`).
- Billing details should prefill from the Company profile and say so.
- Remove the Working calendar card from General and keep it in Attendance rules, or the reverse.

**Effort:** M. **Owner?** Yes: decide whether entities may differ from the company (multi-firm) for the address only, or for everything.

### 2. "Free", "trial" and "product trial": three offers, sold as one
**Status:** Not in this pass: Free/Trial copy and rules are owned by agent X.

**What conflicts**
- The marketing CTAs say "Start free trial" (`src/components/marketing/site-header.tsx:130,155`) and "Start your 15-day trial" (`src/app/(marketing)/page.tsx:68`, `src/components/marketing/plan-cards.tsx:53`).
- But teams of 5 or fewer start on **Free for 6 months**, not a trial (`src/lib/account-types.ts:20-21`; small print at `page.tsx:71`).
- The workspace trial is 15 days (`src/lib/plans.ts:10`).
- Locked product pages offer a separate **14-day product trial** (`plans.ts:21`; `src/app/app/locked/_components/upsell-buttons.tsx:16`).

**Why it confuses.** A Buyer clicks "Start 15-day trial" and lands on a 6-month Free plan. A paid Owner later sees "Start 14-day trial" for one product and cannot tell whether it is the same trial. Support will get "how many days do I have?" tickets.

**Resolution (rename and explain).**
- CTA: "Start free" with the subline "Free for up to 5 people for 6 months; bigger teams get 15 days of everything."
- Call the per-product offer "Try Orbit for 14 days", or align it to 15 days.
- Add one plans explainer to Subscription.

**Effort:** S. **Owner?** Yes: should the product trial be 14 or 15 days, and should the CTA wording change?

### 3. Notifications: seven surfaces, and two pages with the same title
**Status:** Fixed 2d294f6 (Workspace alerts, inbox out of Settings, digest vs brief explained); bell also links Approvals (3a0edc3).

**What overlaps**
- The bell (`src/components/shell/notification-bell.tsx:134`) leads to `/app/notifications`, titled "Notifications". This inbox opens inside the **Settings** side panel, and the rail highlights Settings (`src/lib/catalog.ts:526,756`).
- Settings → Personal → "Notifications" (`catalog.ts:716`) is that same inbox.
- Settings → Workspace → "Notifications" (`catalog.ts:737`) is the workspace defaults page, also titled "Notifications".
- "My alerts" (`catalog.ts:717`) holds the per-person channel grid plus Snooze, Digest and Quiet hours (`src/components/settings/personal-delivery.tsx:34-86`).
- "Briefs" (`catalog.ts:718`) are scheduled summaries, a second digest-like concept.
- Automations also send alerts (item 5).
- The Messages log shows what was sent (`catalog.ts:740`).
- On phones the Settings pills flatten both sections, so two identical "Notifications" pills sit side by side (`src/app/app/settings/layout.tsx:9-12`).

**Why it confuses.**
- Employees: "is this where I read alerts or where I switch them off?"
- Admins: "do I turn the leave reminder off in Notifications or in Automations?"
- "Digest" and "Brief" read as the same thing.

**Resolution (rename, move and explain).**
- Rename `/app/notifications` to **Inbox**, take it out of the Settings panel and the rail match, and reach it from the bell only.
- Rename the workspace page **Alert defaults**.
- Show My alerts and Briefs as two tabs of one page, **My alerts**, with a one-line explainer: alerts are single events, digests batch them, briefs are a summary at a time you choose.

**Effort:** M. **Owner?** No.

### 4. Two "profiles", and Members vs People vs Team vs Departments
**Status:** Fixed 7b7d3e1 (My account (login), My employee record, Members vs People, Teams vs Departments, seats explainer).

**What conflicts**
- Settings → **Profile** is the login account (`catalog.ts:713`). **My profile** is the HR employee record (`catalog.ts:378,624`). The user menu's "Profile" goes to the first one (`src/components/shell/user-menu.tsx:43`).
- Settings → **Members** are logins (`catalog.ts:730`). HR → **People** are employee records (`catalog.ts:580`).
- The importer called **"Team members"** invites logins "with their role and department" (`src/modules/imports/importers/team.ts:17-18`).
- Work → **Teams** (`catalog.ts:514`) are work groups. HR settings → **Departments** (`hr/settings/page.tsx:41`) are a second org structure. Posts target "teams, departments or work locations" (`src/models/work/Post.ts:9`).
- Seats are "the higher of logins and on-payroll employees" (FEATURES §2), which only makes sense once the member-versus-employee split is understood.
- My space pages say "Your account is not linked to an employee record", but no screen explains linking.

**Why it confuses.** An Owner adds 10 people in HR and wonders why they can't sign in, or invites 10 members and wonders why payroll is empty. Employees click "Profile" to change their bank details and find only their name and photo.

**Resolution (rename and explain).**
- Rename Settings → Profile to **Account**.
- Add a "Login ↔ Employee" explainer card on Members and People, with a "Link" action on both.
- Decide whether Teams and Departments should merge or link.

**Effort:** M. **Owner?** Yes: Teams vs Departments.

### 5. Three automation engines, and a recipe whose name says the wrong thing
**Status:** Fixed 4bd4540 (engine notes with cross-links; wish recipes renamed to team alert); merging the engines is left as is.

**What overlaps**
- Settings → Automations recipes (`src/modules/automations/recipes.ts`).
- Folio payment reminders keep their own engine. They are only "bridged" into Automations (`recipes.ts:26-27,155-159`) but are edited in Folio → Settings → Reminders.
- Orbit → Sequences run follow-up steps (`catalog.ts:646`), alongside the Automations sales recipes ("not contacted in 2 h").
- The workspace notification grid also decides what is sent (item 3).
- "Birthday → wish + team post" and "Work anniversary → wish + team post" (`recipes.ts:379,392`) send **notifications, not posts** (`recipes.ts:384-386`, type `notify`). Separate recipes, "Birthday → Celebration post in the feed", actually post (`recipes.ts:405-410`, type `post`, on by default). If an admin turns the first one on, every birthday produces a "team post" notification *and* a feed post.

**Why it confuses.** An Admin can't find where a given email comes from, or turns a reminder off in one place while it keeps firing from another.

**Resolution.**
- Rename the two recipes to "Birthday → wish + team alert".
- Add an "Also controlled in" link on bridged recipes and on Sequences.
- Longer term, show Folio reminders and Sequences as Automations recipes.

**Effort:** S for the rename, L for the merge. **Owner?** Yes, for the merge.

### 6. "Billing" means four things, and Subscription and Billing list the same invoices
**Status:** Fixed bea6a43 (Folio section Invoicing, Edit client billing details) and fa7bb36 (Plan & billing with tabs; /app/settings/billing redirects).

**What conflicts**
- Settings → Subscription has "Billing history" (`src/components/settings/subscription-sections.tsx:53`).
- Settings → Billing has "Invoices and receipts" (`src/app/app/settings/billing/page.tsx:82`).
- Both run the same `SubscriptionInvoice` query (`billing/page.tsx:34`, `subscription/page.tsx:59`).
- Folio's side-panel section is also called **"Billing"** (`catalog.ts:663-665`). It is about your *clients'* invoices.
- Folio also has a "Billing forecast", a "billing plan", "Add a billing entity" (`EntityDialog.tsx:51`) and a "billing profile". The button "Edit on billing profile" (`src/components/folio/InvoiceActions.tsx:80`) opens the client page, where no section has that name.

**Why it confuses.** Finance looks for client invoices under Settings → Billing, and the Owner looks for Flowbit's invoices under Folio → Billing.

**Resolution.**
- Merge Subscription and Billing into **Plan & payments**, with tabs Plan / Bills / Autopay.
- Rename the Folio section **Sales documents** or **Invoicing**.
- Rename the button to "Edit client billing details" and deep-link it to that card.

**Effort:** M. **Owner?** Yes: the section names.

### 7. Product names drift between the rail, page titles, help and the manual
**Status:** Fixed f71599b (Muster · HR, Orbit · Sales, Folio · Invoicing, Work · Tasks caption; product homes titled by product).

**What conflicts**
- **Muster:**
  - The rail says "HR" (`catalog.ts:519`); the home page is "HR dashboard" (`catalog.ts:350`).
  - The help card says "Muster: HR and payroll" (`src/modules/marketing/content/help.ts:44`); the manual eyebrow says "Muster · HR" (`src/modules/manual/chapters.ts:22`).
  - The word "Muster" never appears in the app shell.
- **Orbit:**
  - The page metadata title is "Orbit" (`src/app/app/orbit/page.tsx:37`), the catalog title and breadcrumb say "Pipeline" (`catalog.ts:388`), and the side panel says "Dashboard" (`catalog.ts:641`).
  - The side section holding Leads, Contacts and Clients is also called "Pipeline" (`catalog.ts:638`), and the Deals page describes itself as "Money in the pipeline".
- **Folio:** the home page is "Receivables" (`catalog.ts:404`) and its section is "Billing" (item 6).
- **Work:**
  - The product is "Flowbit Work" (`catalog.ts:153`) while the others carry no "Flowbit" prefix.
  - The rail has no Work entry. Its pages are spread over 7 rail items.
  - The manual says both "Work → Posts" and "Side panel → TOOLS → Posts" for the same page (content/manual/20-work.html).

**Why it confuses.** A new user reads "Muster" on the pricing page and can't find it in the app.

**Resolution.**
- Pick one rule. Either the rail shows the product name with a subtitle ("Muster · HR"), or the product names are dropped inside the app.
- Make each home page title the product name ("Orbit", "Folio", "Muster").

**Effort:** S. **Owner?** Yes.

### 8. Clients, leads and contacts: the same words mean different records
**Status:** Fixed c8b49e2 (status shows Prospect; Clients and WhatsApp keep the Orbit or Folio panel); merging the two client importers is not done.

**What conflicts**
- A shared Client has a status `lead` (`src/models/Client.ts:5`), shown as **"Leads"** on the Clients dashboard (`src/components/clients/clients-dashboard.tsx:12`). Orbit has a separate Lead record (`src/models/orbit/Lead.ts`).
- Contacts are stored in three ways:
  - embedded in each Client (`Client.ts:44`)
  - the Orbit Contacts page, "Client contacts, plus prospects on open leads" (`src/app/app/orbit/contacts/page.tsx`)
  - portal contacts, a separate model (`src/models/portal/PortalContact.ts`), shown on the client's Contacts tab (`src/app/app/clients/[id]/page.tsx:124`)
- Two importers both create Clients: "Contacts and companies" and "Folio clients" (`src/modules/imports/importers/orbit-folio.ts:52,67`).
- "Clients" appears in the rail and in the Orbit and Folio panels (`catalog.ts:516,647,674`). Opening it switches the side panel to **Work's** projects and teams (`catalog.ts:752-758`), so a Finance user leaves Folio without meaning to. The WhatsApp inbox (`/app/whatsapp`) behaves the same way.

**Who it confuses.** Sales ("is a client lead the same as my lead?") and Finance (lost context).

**Resolution.**
- Rename the client status to **Prospect**.
- Keep the side panel of the product the user came from when they open /app/clients (pass `?from=`, or a remembered panel).
- Merge the two client importers into one with an "include billing fields" option.

**Effort:** M. **Owner?** Yes: the status name.

### 9. Import: four ways in, two interfaces for the same importer
**Status:** Fixed fb33688 (one screen per importer; biometric kept; the file deletions landed in fabee7d).

**What overlaps**
- Settings → Import, with 9 importers, a template, preview and 7-day undo (`src/modules/imports/types.ts:8`).
- Employees can also be imported from HR → People → Import, a separate wizard (`src/components/muster/people/import-wizard.tsx:14`, `src/app/app/hr/page.tsx:41`, `src/app/app/hr/people/page.tsx:93`).
- Attendance can also be imported from HR → Attendance → Import tab, which has a biometric variant (`src/app/app/hr/attendance/page.tsx:143,172`).
- Leads have their own "Import CSV" dialog (`src/app/app/orbit/leads/page.tsx:46`, `src/components/orbit/import-leads-dialog.tsx`).
- The Clients page links to Settings → Import (`src/app/app/clients/page.tsx:48`).
- The Setup guide links to Settings → Import (`src/components/work/dashboard/setup-guide.tsx:39`).
- Console staff have a third path (`src/app/console/(staff)/accounts/[id]/import`).
- The per-page imports record undo batches, but they then tell the user to undo "in Settings" (`src/modules/muster/import/actions.ts:57`).

**Why it confuses.** Admins and HR get different screens and templates for the same job, and undo lives somewhere else.

**Resolution (merge).** Every per-page Import button should open the Settings importer for that kind (`/app/settings/import/<kind>?from=…`), as Clients already does. Keep the biometric format as an option inside the attendance importer.

**Effort:** M. **Owner?** No.

### 10. Rail and side-panel labels that mislead
**Status:** Fixed ea96325 (Work reports, plural labels, Projects section, Compliance for Finance); manual paths f4b505a.

**What misleads**
- **"Reports"** in the rail is Work-only (`catalog.ts:518`), but it reads as global. HR, Orbit and Folio each have their own reports.
- The rail uses singular labels while the pages use plural: "Team", "Project", "Client" and "Meeting" (`catalog.ts:514-517`) open "Teams", "Projects", "Clients" and "Meetings".
- The Work side section header is the action **"Create new project"** (`catalog.ts:558`), not a noun.
- There are two "Time" sections: Work Tools → Time (`catalog.ts:567`) and Muster → Time (`catalog.ts:585-586`).
- The Muster section "Documents" holds Letters, **Reports and HR settings** (`catalog.ts:609-616`).
- "Settings" names four things: the rail item, HR, Orbit and Folio settings. "General" names two: Settings → General and Orbit settings → General (`src/app/app/orbit/settings/page.tsx:30`).
- The manual writes "Settings → Tax" and "Settings → Reminders" (`content/manual/50-folio.html:114,191,347`) for Folio settings tabs, which reads as the main Settings.

**Who it confuses.** HR clicks Reports and lands on task throughput.

**Resolution (rename).**
- Rename the rail item to "Work reports", or make Reports a hub.
- Use plural labels.
- Rename the section to "Projects".
- Move Reports and HR settings out of "Documents".
- In the manual, write "Folio → Settings → Tax".

**Effort:** S. **Owner?** No.

### 11. Approvals are spread over six pages with no single inbox
**Status:** Fixed 3a0edc3 (/app/approvals inbox, Home card, bell link; role and tenancy tests).

**What overlaps**
- Leave (`/app/hr/leave`), Corrections (`/app/hr/attendance/corrections`), Claims (`/app/hr/claims`), Time approvals (under Work → *Tools*, `catalog.ts:568`), Payroll stages (`/app/hr/payroll`) and bank-detail verification on the employee page.
- Decisions can also be made from email (`/a/<token>`) and from WhatsApp (hidden).
- Briefs have an "Approvals" section, and the bell shows approval items.
- Time approvals go to the "direct manager" (FEATURES §3). Leave goes to the reporting manager first, then HR, with a fallback (`src/modules/muster/leave/decide.ts:47`). The *Manager role* (`src/lib/permissions.ts:68-75`) is a different thing from *being someone's manager*.

**Who it confuses.** A Manager doesn't know where to look. A reporting manager on the Member role may never see the request.

**Resolution.** Add an **Approvals** page (or a Home card) that lists everything waiting on me, with links to each queue. Explain "reporting manager vs Manager role" on Roles.

**Effort:** L. **Owner?** Yes.

### 12. Spaces, lists, folders, projects and teams
**Status:** Explained 94d0ceb (Spaces and Projects explainers; list, not folder, in UI text).

**What conflicts**
- A task can sit in a project *and* in a space list at once (`src/models/work/Task.ts:39-41`).
- The data calls a list a "folder" (`src/models/work/Folder.ts:5`: "'folder' in the data, 'list' in the UI").
- Other places name both levels:
  - the permission "spaces, folders and lists" (`catalog.ts:45`)
  - the feature text (`catalog.ts:165`)
  - FEATURES ("Spaces contain folders, and folders contain lists")
  - marketing "Spaces and folders" (`src/modules/marketing/content/work.ts:12`)
  - the help text "A space per team, a project per goal" (`help.ts:118`)
- The Spaces page says "Group lists of tasks by team or area" (`src/app/app/work/spaces/page.tsx`), which overlaps with Teams.

**Who it confuses.** An Owner setting up Work, who doesn't know whether to create a space or a project.

**Resolution.**
- Use one word, "list", everywhere and drop "folder".
- Add a 3-line explainer on Spaces and Projects: spaces = where work lives by team, projects = deliverables with dates, both optional.

**Effort:** S–M. **Owner?** Yes: is a task meant to be in both?

### 13. Two clocks and three "workday" lengths
**Status:** Fixed e42a715 (Time explainer; timer target from office hours) and a03d79b (one edit place for working hours).

**What conflicts**
- The attendance check-in widget in the side panel shows worked and payable time (`src/components/shell/check-in-widget.tsx:33`).
- The Work time-tracking timer shows a pill in the top bar (`src/components/work/time/running-timer-pill.tsx`). It has no link to attendance (no reference in `src/components/work/time`).
- The workday is 8 h in the timesheet (`src/modules/work/tasks/constants.ts:29`, "Today X of 8h") and 9 h in the punch dial (`src/components/shell/punch-dial-model.ts:17`). Office hours default to 10:00–19:00 (`src/app/app/settings/page.tsx:32`).
- The words differ too: "effective", "payable", "worked", "logged" and "billable".

**Who it confuses.** Employees, who check in and also start a timer and expect them to match.

**Resolution.** Explain it on the Time page ("Attendance = when you were at work; Time = what you worked on"). Derive the timesheet target from office hours.

**Effort:** S. **Owner?** No.

### 14. Claims vs Expenses vs Receipts
**Status:** Explained d6cf239.

**What conflicts**
- The feature is called "Reimbursements" (`catalog.ts:192`). The nav says "Claims" (`catalog.ts:604`), and the page talks about "expense claims".
- Folio also has "Expenses" (`catalog.ts:692`), with a separate category list (Folio settings → Expenses, `folio/settings/page.tsx:47`) next to the claim categories.
- "Receipt" means money received in Folio (`catalog.ts:670`) and a bill photo in claims and expenses.

**Who it confuses.** Finance, and employees.

**Resolution.**
- Use **Reimbursements** everywhere in Muster (or Claims everywhere).
- Rename Folio receipts to **Payments received**.
- Note on the claim forms that approved claims flow into payroll, not into Folio expenses.

**Effort:** S. **Owner?** Yes: the names.

### 15. Firm vs entity vs business
**Status:** Fixed 6b3ba65 (Firm everywhere in the Folio UI).

**What conflicts**
- The plan sells "Folio firms" (`src/components/settings/plan-picker.tsx:156`).
- The firm switch and the expense form say "Firm" (`src/components/folio/FirmSwitch.tsx:15`, `src/components/folio/expenses/ExpenseForm.tsx:101`).
- Folio settings says "Entities" and "Add a billing entity" (`folio/settings/page.tsx:39`, `EntityDialog.tsx:51`).
- The FAQ says "firm" 11 times and "entity" 0 times. The Folio manual says "entity" 45 times and "firm" 26 times.
- The help card says "Set up your firms" (`help.ts:149`).

**Who it confuses.** Finance and the Owner.

**Resolution.** Pick **Business** or **Firm** and rename the Entities tab.

**Effort:** S. **Owner?** Yes.

### 16. Tax form names: old and new Act mixed
**Status:** Not in this pass: tax form names are owned by agent X.

**What conflicts**
- The code's own rule is to use the 2025 Act names, Form 130 and Form 138 (`src/modules/muster/tax/labels.ts:5-8`). Places that don't follow it:
  - The HR Salary tax download button reads **"24Q {q}"**, and the page description says "24Q (Form 138)" (`src/app/app/hr/payroll/tax/page.tsx:66,89`).
  - The compare page says "24Q data export" (`src/modules/marketing/content/compare.ts:30`).
  - The FAQ question asks "Does Muster work out salary TDS and **Form 16**?" (`src/modules/marketing/content/faq/hr.ts:85`).
  - The compliance calendar says "TDS return (24Q / 26Q)" (`src/modules/compliance/rules.ts:25`).
  - The Console says "Form 16A" (`src/components/console/billing-actions.tsx:115`).
- The manual uses "Form 138 (formerly 24Q)" (`content/manual/31-muster-b.html:382`).

**Who it confuses.** HR and the CA, who see two names for one file.

**Resolution.** Use "Form 138 (formerly 24Q)" and "Form 130 (formerly Form 16)" everywhere, the button included. Check the Console's 16A wording with the CA.

**Effort:** S. **Owner?** Yes: confirm the 16A/26Q equivalents.

### 17. Policies in two places; events vs meetings
**Status:** Explained ef14162.

**What overlaps**
- HR settings → Policy documents (`hr/settings/page.tsx:47`) are shown in My documents, with no read confirmation.
- Work → Posts has a **Policy** type that asks everyone to confirm they have read it (`src/modules/work/posts/post-types.ts:33`).
- The Post type "Event" (`post-types.ts:10`) overlaps with Meetings.

**Who it confuses.** HR, who won't know where to publish the leave policy.

**Resolution.** A Policy post should be able to attach an HR policy document, and My documents should link to it. Otherwise, pick one home.

**Effort:** M. **Owner?** Yes.

### 18. Settings sprawl and permission mismatches
**Status:** Fixed 42f178e (six groups, section labels on phone pills, anyPerm, Export gate).

**The count.**
- The Settings side panel has **26 links**: 8 Personal (`catalog.ts:713-720`) and 18 Workspace (`catalog.ts:728-745`).
- There are **34 routes** under `/app/settings`, plus `/app/notifications`.
- Each product has its own settings: HR 8 tabs, Orbit 8 tabs, Folio 10 tabs.

**Proposed grouping.**
- **You:** Account, Security, Appearance, My alerts (incl. Briefs), Google, Connected apps.
- **Company:** General, Company profile, Domains, Privacy.
- **People and access:** Members, Roles, Support access, Audit log.
- **Plan:** Plan & payments.
- **Automation and messages:** Alert defaults, Automations, Messages log, Compliance calendar.
- **Data:** Import, Export, Integrations, Modules.

**Mismatches.**
- The Compliance calendar page allows `folio.settings` (`catalog.ts:307`; `src/app/app/settings/compliance/page.tsx:20`), but its nav link needs `org.manage` (`catalog.ts:739`). Finance can open it only by URL.
- Connected apps sits under Personal (`catalog.ts:720`) and also under Workspace → Integrations ("Manage connected apps", `src/app/app/settings/integrations/page.tsx:94`).
- The Export nav link needs `billing.manage`, but the page has no permission gate and allows the action only to the owner (`catalog.ts:313,741`; `src/app/app/settings/export/page.tsx:24-44`).

**Resolution.** Group as above, add section labels to the mobile pills, and give the Compliance link `anyPerm`.

**Effort:** M. **Owner?** No.

### 19. Onboarding and help: three Home cards plus five help surfaces
**Status:** Fixed fb487f1 (one onboarding card); the Help centre Payroll card is marketing content, left to its owner.

**What overlaps**
- Home stacks a "Setup guide" (handover from the Console, `src/components/work/dashboard/setup-guide.tsx:24`), a "Get started" checklist (`src/lib/i18n/en.ts:264`) and "Let's get your workspace moving" (`src/components/work/dashboard/getting-started.tsx`) (`src/app/app/page.tsx:106-112`).
- The sample-data button appears in all three.
- Help is spread across `/help`, `/manual`, `/faq`, the product tour ("Help: replay the tour", `user-menu.tsx:47`) and the "How to use" sections on product pages.
- The app's only link into help is "Help centre" in the user menu (`user-menu.tsx:46`). Pages have no contextual "?" links.
- The Help centre has no card for the Payroll chapter (`help.ts:26-98` against `chapters.ts:23`).
- Sequences are documented only in "What's new" (`help.ts:141`).

**Who it confuses.** The Owner on day 1.

**Resolution.**
- Show one card: the Setup guide while a handover runs, otherwise the checklist. The empty-state card should appear only when neither shows.
- Add "?" links from page headers to manual anchors.
- Fold the What's new topics into the product chapters.

**Effort:** M. **Owner?** No.

### 20. Search and AI: two searches with different scopes, and three AI surfaces
**Status:** Fixed a082b8b (Search everything, palette scope, Arc Suggestions mode, explainer).

**What overlaps**
- ⌘K searches tasks, projects, invoices, leads, deals, clients, people and pages (`src/lib/search.ts:31-35`).
- Arc searches tasks, projects, clients, people, posts and meetings (`src/modules/work/arc/search.ts:25`).
- Arc is an "AI assistant" (FAQ), but it runs on templates when no key is set (FEATURES §2). It is gated to Work (`catalog.ts:511`), so a Muster-only customer has no Arc.
- Connected apps (MCP) let Claude or ChatGPT act inside Flowbit (`src/app/app/settings/integrations/ai/page.tsx`).

**Who it confuses.** Everyone: "where do I search?"

**Resolution.**
- Make ⌘K the one search and have Arc call it.
- Label Arc "Suggestions" while no AI key is set.
- Explain Arc vs Connected apps on the Connected apps page.

**Effort:** M. **Owner?** Yes: what Arc is in v2.0.

### 21. Self-service and HR "documents" naming
**Status:** Fixed 6854e7d (My HR in the app; marketing and help copy left to its owner).

**What conflicts**
- Self-service is called "My space" (side panel, `catalog.ts:620`), "Self-service" (feature, `catalog.ts:195`), "Employee self-service" (help, `help.ts:53`), "Your own HR desk" and "my-hr" (manual, `chapters.ts:24`).
- "My documents" holds joining documents and policies. "My letters" is separate. The HR "Documents" section holds Letters, Reports and Settings (item 10).

**Resolution.** Use **My HR** everywhere.

**Effort:** S. **Owner?** Yes.

### 22. Modules vs plan vs seats
**Status:** Explained 094daab.

**What needs explaining**
- Settings → Modules switches a product off "for everyone" (`src/app/app/settings/modules/page.tsx:48`), and also shows "Add to plan" (`modules/page.tsx:87`). Nothing says whether switching a product off changes the bill.
- Seat units differ by product: user, employee, sales user, per workspace, person (`plans.ts:95-100`). Free counts "billable seats" a third way.

**Resolution.** Add one explainer on Modules and Subscription: what is billed and on which count.

**Effort:** S. **Owner?** Yes.

### 23. Dead catalog pages and a legacy route
**Status:** Fixed cac5b12.

- `/platform`, `/platform/orgs` and `/platform/orgs/[id]` are declared as pages (`catalog.ts:320-322`), but there is no `src/app/platform`. The proxy redirects them to the Console (`src/lib/console/host.ts:96`). The command palette carries a 'Platform' label for them (`src/components/shell/command-palette.tsx:16`).
- `/app/settings/email-log` is only a redirect (`src/app/app/settings/email-log/page.tsx:5`).

**Resolution.** Remove the PageDefs and keep the redirect.

**Effort:** S. **Owner?** No.

### 24. docs/FEATURES.md contradicts itself and the code
**Status:** Not in this pass: FEATURES.md is owned by agent Z.

- §10 says break types are "Missing", Posts have no upload, and posts have "4 fixed categories". §3–4 and the code have 4 break types (`src/lib/break-types.ts:9`) and 10 post types (`post-types.ts:10`).
- §6 and §10 say Clients has no import and no charts. The Clients page now has both (`src/app/app/clients/page.tsx:48`, `src/components/clients/clients-dashboard.tsx`).
- §7 says no WhatsApp switch exists. One does (`src/lib/feature-flags.ts:27`).
- §3 says Meetings have "no Google Calendar connection". `src/modules/work/meetings/google-sync.ts` and Settings → Google both exist.
- It says the workspace logo is set in Settings → General, but it moved to Company profile (`general-forms.tsx:96`).
- It does not mention the client portal, Connected apps/MCP, Slack, Sequences, bank reconciliation, e-invoice, the Tally export, Domains or the biometric import.

**Resolution.** Refresh it before anyone uses it as the source for the manual or sales.

**Effort:** S. **Owner?** No.

### 25. Lesser naming items
**Status:** Left as is: the compare page and FEATURES terms belong to X and Z; no in-app label needed changing.

- Product and plan pages call the Muster tiers "Starter" and "Business", while the Modules page says "Payroll needs Muster Business" (`modules/page.tsx:96`). This is fine, but the catalog has no tier names.
- Two public "what changed" pages exist: `/compare-v1-v2`, linked in the footer (`src/components/marketing/site-footer.tsx:10`), and `/manual/whats-new`.
- Orbit's "reviewer" (`catalog.ts:91`) and the FEATURES term "closers" both describe the same permission.

**Effort:** S. **Owner?** No.

---

## Concepts a new user needs explained (the UI does not explain them today)

**Status:** Explained 8dc82c8 and the item commits above (? popovers from src/lib/explainers.ts; a test checks each one is shown on a page). Concept 3 (Free vs trial) Fixed 3b9bf0c (`free-vs-trial` explainer on Plan & billing).

1. Login (member) vs employee record, and how they link; which one counts as a seat.
2. Workspace vs company profile vs Folio business (firm/entity).
3. Free (6 months, 5 seats) vs the 15-day trial vs the 14-day product trial vs read-only and blocked.
4. Modules (on/off) vs the plan (billed).
5. Spaces and lists vs projects vs teams vs departments; personal mode vs project mode (General → "How you work").
6. The Manager role vs being a reporting manager; Orbit reviewer/closer.
7. Client vs lead vs contact vs portal contact; prospect status.
8. Quote vs proforma; receipt vs advance; recurring retainer vs billing plan (milestones); credit note vs void vs write-off.
9. Attendance (effective vs payable) vs time tracking (logged vs billable).
10. Alerts vs digests vs briefs vs automations vs sequences.
11. Locking a month (attendance and payroll) and the 8 payroll gates.
12. Brand colours apply only on Suite or during a trial; PDFs keep Flowbit purple.
13. Support access: what Flowbit staff can see, and for how long.
