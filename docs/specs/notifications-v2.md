# Flowbit v2, phase 1: Messaging, alerts and automations

> **Status (11 Oct 2026): built.** This spec was written before the build. The WhatsApp provider that was built is **Interakt**, bring your own account (each workspace pastes its own Interakt key; Flowbit's own numbers also use Interakt), not a Gupshup or 360dialog BSP partnership and not Flowbit's own Meta Cloud API. WhatsApp is **hidden** behind the `FEATURE_WHATSAPP` flag (off by default) and the Console → Settings → Features switch; the public site calls it "coming soon". What is built is in `docs/FEATURES.md`; setup is in `docs/DEPLOY-VERCEL.md` (e2) and (e3).

Draft 2 for owner review, 7 Oct 2026. Background is in `docs/archive/V2-AUDIT.md`, sections 2 and 3.

## 0. What changed from draft 1

Draft 1 was a fixed list of events, each with a fixed channel. That is too narrow. Draft 2 is built on three things:

1. **One messaging layer.** The same pipeline delivers in-app, email and WhatsApp (SMS and push can come later). It handles templates, retry, delivery ticks, a fallback channel, opt-out and a full log.
2. **Automations.** These are "When X happens → send Y to Z, through channel C, after delay D, if condition K" rules. Flowbit ships ready recipes such as "Payment received → thank-you" and "Quote not accepted in 3 days → follow up". A business can switch each recipe on or off, edit its wording and timing, or create its own.
3. **A personal brief builder.** Each person chooses what they want, when, how often and where.

**Owner decisions taken into account:**
- WhatsApp is pay-as-you-use from a recharged wallet.
- The free messages included in each plan can be customised per plan, and per workspace from the Console.
- The morning brief is fully customisable.
- The payment thank-you goes out automatically, using a ready-made template.
- Payslips go by email only.

## 0b. Draft 3: changes after the research check (7 Oct)

Sources are in `docs/archive/V2-RESEARCH.md`. Where this section disagrees with sections 1–8, this section wins.

### Corrections

1. **The wallet model has to change.**
   - As a Meta Tech Provider, Flowbit **cannot** pay Meta on a client's behalf. The client's own card pays Meta.
   - A true "recharge once, one price" wallet needs a BSP's credit line.
   - **New default: Flowbit wallet on a BSP partner** (Gupshup or 360dialog, as a multi-partner solution).
     - The BSP pays Meta.
     - Flowbit charges the client from its wallet: Meta cost plus margin, with GST.
   - **Fallback mode: "Bring your own Meta account"** for larger clients who already have one.
     - Meta bills them directly.
     - The Flowbit wallet charges only a small platform fee per message, or nothing within the plan.
   - The pipeline talks to a `WhatsAppProvider` interface with two adapters: Meta Cloud direct, and the BSP partner API. This way the choice of provider does not lock in the code.
2. **Rates are data, not code.**
   - BSPs report that Meta may have started charging for service replies and in-window utility messages from 1 Oct 2026. Meta's public page does not say so.
   - The Console rate card therefore holds: Meta cost per category, BSP fee, Flowbit margin, and the free allowance.
   - Every message stores the exact cost charged.
3. **INR billing.** Every WhatsApp account connected through Flowbit must be billed in INR. Non-INR accounts stop working on 1 Jan 2027.
4. **Embedded Signup v4 only** (v2 ends 15 Oct 2026).
   - Until Meta verifies Flowbit, only 10 new client connections a week are possible. Start the Meta verification now.
   - Until then, manual setup or BSP onboarding fills the gap.
5. **A client's own business verification matters.** Without Meta business verification, a number can message only 250 new people a day. The connect panel shows the tier and links to Meta's verification steps.
6. **Birthday and anniversary wishes count as marketing** (about 7× the cost of utility, and they need explicit opt-in).
   - Default for employees: in-app and email.
   - WhatsApp only when the workspace turns it on and the employee has opted in.
7. **Payslips** stay email only, sent as a **password-protected PDF**.
   - The default password combines PAN and date of birth. The format is shown in the email.
   - Optional WhatsApp alert: "Your payslip for Sep is ready". It carries no amounts and only an OTP-protected link.
8. **Wallet rules (RBI closed-system PPI, GST):**
   - Credit is usable only for Flowbit's own services, with no cash-out and no transfers.
   - Refunds go only to the original Razorpay source, through a GST credit note.
   - Every recharge gets a tax invoice (18%).
   - Free credits sit in a separate ₹0 promo balance and are spent first.
   - Expiry and refund terms are shown at checkout. **CA to confirm the SAC code and expiry terms.**
9. **DPDP (Flowbit as data processor for clients and employees):**
   - Add a data processing agreement (DPA) to the terms.
   - Consent log per contact and channel: time, source, notice version.
   - A suppression list honoured by every send (STOP or unsubscribe).
   - Export and delete for each contact, and retention rules.
   - Message logs kept at least 1 year.
   - Breach runbook: tell the workspace at once, so it can meet the 72-hour rule.
   - Target: Nov 2026. Legal deadline: May 2027.
10. **SMS later.** The data model keeps DLT fields (entity ID, header, template ID) from day one.

### Additions

11. **Coexistence.** A small business can keep using the WhatsApp Business app on its phone while Flowbit sends through the same number.
    - Offered as "Connect your existing WhatsApp number" in Embedded Signup.
    - Limits: 20 messages a second; groups don't sync.
    - India support should be confirmed with the BSP.
12. **Pay inside WhatsApp (India).**
    - The invoice goes as a WhatsApp "order details / invoice" message, and the client pays by UPI in the chat.
    - It works through UPI Intent with any gateway, or through Razorpay or PayU.
    - The workspace links its own gateway. The payment webhook then:
      1. marks the invoice paid;
      2. creates the receipt;
      3. fires the thank-you automation.
13. **Payment links with automatic reconciliation (email as well).**
    - Each invoice gets a Razorpay or Cashfree payment link, plus a UPI QR on the PDF and the public page.
    - Paid → the receipt is recorded automatically → thank-you is sent → reminders stop.
14. **Approvals by email, as well as WhatsApp.** Approve and Reject buttons in the email, through signed one-time links (like sumHR).
15. **Email replies.**
    - Replying to a task-notification email adds a comment.
    - Forwarding an email to `tasks+<workspace>@…` creates a task (like ClickUp and Asana).
16. **End-of-day check-in.** "What did you work on today?" at a time the workspace sets (like Basecamp). The answers feed the manager's brief.
17. **Employee WhatsApp bot** (later in phase 1, opt-in per workspace).
    - Check in or out, by sharing location (and optionally a selfie).
    - Apply for leave, check the leave balance, and get a "payslip ready" link.
    - Lightweight attendance for field and shop staff without the app.
18. **Lead sources.**
    - IndiaMART and JustDial pull or webhook.
    - A website form embed.
    - Click-to-WhatsApp ads, where the first 72 hours are free.
    - All of these become Orbit leads with source tags and an instant alert to the assignee.
19. **Quote e-acceptance** on the public link: typed name, IP address and time. Accepted → deal won + draft invoice + project (optional automation).
20. **Compliance calendar data.**
    - Due dates vary by filer type (monthly or QRMP) and by state (professional tax, QRMP 22nd or 24th).
    - The admin can override dates when the government extends them.
    - It carries a "check before relying" note.

### Pricing guide (owner to decide; the Console can change it any time)

**Market benchmarks:**

| Item | Rate |
|---|---|
| Meta utility | ≈ ₹0.115 + GST |
| Meta marketing | ≈ ₹0.86 + GST |
| BSP resellers (utility) | ₹0.14–0.16 |
| BSP resellers (marketing) | ₹0.95–1.09 |
| TallyPrime WhatsApp add-on | ₹1,300 a year |

**Suggested starting point:**
- Plans include utility messages, for example:
  - Starter: 300 a month
  - Growth: 1,000 a month
  - Suite: 3,000 a month
- Above that, the wallet charges utility at ₹0.20 and marketing at ₹1.20 (excluding GST).
- Recharge packs: ₹500, ₹1,000, ₹2,500 and ₹5,000.

## 1. Messaging layer

### 1.1 Message pipeline

- **New `Message` model.** The old `Outbox` rows migrate into it.
  - Fields:
    - `channel`, `to`, `contactId` / `memberId`, `event`, `automationId`, `entity` / `entityId`
    - `template` and `params`, plus `attachments`
    - `scheduledFor`
    - `status` (scheduled, queued, sending, sent, delivered, read, failed, skipped)
    - `attempts`, `nextAttemptAt`, `cost` and `error`
- **Sending.** `enqueue()` tries to send at once. On failure it retries with backoff at 1 m, 5 m, 30 m and 2 h. The `/api/cron/messages` job runs every 5 minutes and picks up anything that is due.
- **Fallback channel.** If WhatsApp fails (invalid number, wallet empty, or not connected), the message can go by email instead. Each automation sets whether this happens.
- **Webhooks:**
  - Resend: delivered, bounced and complained.
  - Meta: sent, delivered, read and failed, plus inbound messages.
- **Messages log.** It replaces the Email log, covering both channels with filters and a per-message timeline. Admins can resend, and see why a message was skipped (opted out, quiet hours, no number, wallet empty).
- **Document timeline.** Each invoice, quote, receipt and statement shows "Sent on WhatsApp ✓✓ read 2:14 pm · Opened link 2:20 pm · Paid".

### 1.2 Contacts and consent

Every client contact and member has:
- Their email and WhatsApp number (stored in E.164 format; +91 by default).
- A preferred channel.
- Opt-in status and an opt-out date.

**Opt-out rules:**
- An inbound "STOP" (or a reply to an opt-out button) marks the contact opted out of WhatsApp.
- Automations skip opted-out contacts and log the skip.
- Meta requires opt-out handling, and it protects the number's quality rating.

**Number check:**
- Numbers are validated when entered.
- A number Meta reports as "not on WhatsApp" is flagged on the contact and used for email fallback.

### 1.3 Email upgrades

- **Sender identity:**
  - The "From" name is the business name, and the reply-to is the workspace's own address.
  - Optionally, a custom sending domain with DKIM and SPF checked through the Resend domains API (for example `billing@theirdomain.in`). Without it, mail goes out from Flowbit's domain.
- **Branding.** Emails carry the workspace logo and brand colour, and a sign-off per workspace.
- **Links, not heavy attachments.** Documents are sent as a public link, with the PDF attached optionally.
- **"Viewed" status.** When the client opens the link, the document shows it was viewed.

### 1.4 Public document link (new)

- **Route:** `/d/[token]`. The token is signed, can be revoked, and can be set to expire.
- **Invoice page:** view, download the PDF, a UPI QR, a "Pay now" link, and a "Mark as paid / share UTR" option where the client types the UTR and the business confirms it.
- **Quote page:** accept or decline with a name and comment. Accepting notifies the owner and creates a task to convert the quote to an invoice.
- **Statement:** what the client owes, by invoice.
- **Tracking:** opens are recorded and shown on the timeline.

## 2. WhatsApp

### 2.1 Connecting

**Primary: "Connect with Meta" (Embedded Signup).**
- The admin logs in with Facebook, picks or creates a WhatsApp Business Account and number, and verifies it by OTP.
- No copying IDs or tokens.
- This requires Flowbit to register as a Meta Tech Provider (a one-time business verification by Vistaar). ⚠ This is an owner task.

**Fallback: manual setup.**
- The admin pastes the Phone Number ID, WABA ID, a permanent token and the app secret, as in draft 1.
- Works before Tech Provider approval comes through.

**After connecting, the panel shows:**
- The number's display name.
- Its quality rating (green, yellow or red).
- Its messaging tier: how many new people a day it can start conversations with (250, 1k, 10k…).
- Webhook status, and a test send.

**Secrets:** encrypted at rest with AES-GCM; only the last 4 characters are ever shown; "Disconnect" wipes them.

### 2.2 Templates

- **Synced from Meta**, showing status (approved, pending or rejected, with the reason) and category (utility, marketing or authentication).
- **"Install Flowbit template pack"** submits ready-made templates in English and Hindi:
  - Money:
    - invoice share
    - quote share
    - receipt / thank-you
    - payment reminder (before due, on due date, overdue)
    - statement
  - Team:
    - task alert
    - approval pending
    - morning brief
    - meeting reminder
    - leave decision
  - HR:
    - birthday
    - work anniversary
    - welcome / joining
- **Editor:** variables are shown as chips such as {{client_name}} and {{amount}}, with a live preview. Button types are supported:
  - URL buttons: "View invoice", "Pay now".
  - Quick-reply buttons: "Approve", "Reject", "Mark done", "Stop".
- **Meta's 24-hour rule:**
  - Anything Flowbit starts must use an approved template.
  - Free text is allowed only in the shared inbox, while the 24-hour window after the contact's last message is open.

### 2.3 Wallet (pay as you use)

**Each plan includes N free WhatsApp messages a month.**
- The number is set per plan, and can be overridden per workspace in the Console (founding customers, deals).
- Unused free messages do not carry over.

**After that, messages are charged from a prepaid wallet.**
- Recharge through Razorpay with fixed packs (₹500, ₹1,000, ₹2,500, ₹5,000) or a custom amount.
- Every recharge produces a GST invoice from Flowbit (the existing `FB/` series).
- Optional auto-recharge when the balance drops below a threshold.

**Rates:**
- Charged per message, by Meta category: utility, marketing or authentication.
- Set in the Console rate card (Flowbit's price).
- Inbound messages and free-form replies inside the 24-hour window are free.

**Ledger:**
- Every recharge, debit (linked to the message), refund for a failed send, and free-quota use is recorded.
- Monthly statement.

**Limits:**
- A daily and monthly spending cap per workspace, plus an optional cap per automation.
- Alerts at a low balance and at 0.
- At 0, messages fall back to email if the automation allows; otherwise they are held for 24 hours.

**⚠ Open question: who pays Meta?** See Q1.

### 2.4 Shared WhatsApp inbox (new)

- **Inbound conversations** are matched to a client, lead or member by phone number. An unknown number becomes a new Orbit lead, with "WhatsApp" as the source.
- **Assignment:** a conversation can be assigned to a teammate, with unread counts.
- **Window indicator:** shows how much of the 24-hour window is left. After it closes, only templates can be sent.
- **Reply tools:** canned replies, and attaching an invoice or quote straight from the chat.
- **Triggers:** an inbound message from a client with dues can raise an automation, for example "client replied → notify the owner".

### 2.5 Act from WhatsApp (quick replies)

| Who | Button in the message | What it does in Flowbit |
|---|---|---|
| Manager | Approve / Reject on a leave, timesheet, claim or correction | Applies the decision, with the same checks as the app (permission, month lock) |
| Assignee | Mark done / Snooze 1 day on a task alert | Updates the task |
| Client | Accept on a quote | Accepts the quote |
| Client | Pay now on an invoice | Opens the public link |
| Client | I've paid | Asks for the UTR and creates a "verify payment" task |

## 3. Automations

### 3.1 Engine

- **Trigger types:**
  - **Event:** for example `invoice.issued`, `payment.received`, `task.assigned`, `leave.requested`.
  - **Time-based:** X days before or after a date field, such as an invoice due date, quote validity, date of birth, joining date, probation end or document expiry.
  - **Schedule:** daily, weekly or monthly at a set time.
- **Conditions:** amount ≥ X, client tag, project, priority, status unchanged for N days, and similar.
- **Actions:**
  - send a message: channel, template and recipient (client, assignee, manager, a role or a fixed person);
  - create a task;
  - notify in-app.
- **Delay:** "after 2 hours", with the option to send only during business hours.
- **Safety:**
  - Once per entity per rule, using `dedupeKey`.
  - A daily cap per contact.
  - Quiet hours.
  - A "test on me" button that sends a preview to yourself.
- **Run history:** every run shows what was sent, skipped or failed, and why.

### 3.2 Ready recipes

Each recipe can be switched on or off, and its wording and timing edited. ✓ = on by default.

**Money (Folio)**

| Recipe | Default |
|---|---|
| Invoice issued → send to client (WhatsApp with email fallback) | off, the user chooses |
| Payment received or receipt recorded → thank-you with amount, invoice number, balance left and receipt PDF/link | ✓ |
| Part payment → acknowledgement with balance due | ✓ |
| Payment reminders at −3, 0, +7, +15 and +30 days (existing schedule, now actually sent) | ✓ |
| Overdue > 30 days → alert the owner and create a call task for the account owner | ✓ |
| Quote sent and not accepted in 3 days → follow-up; quote expiring in 2 days → reminder | ✓ |
| Quote accepted → notify owner + task to convert to invoice | ✓ |
| Recurring / retainer invoice generated → auto-send after review, or only notify for review | |
| Monthly statement on the 1st to clients with dues | |
| Client shares UTR → task to verify | ✓ |

**Sales (Orbit)**

| Recipe | Default |
|---|---|
| New lead (manual, web form or WhatsApp) → instant alert to the assigned person + welcome message to the lead | |
| Lead not contacted in 2 hours → nudge the assignee; after 24 hours → escalate to the sales manager | |
| Follow-up due → reminder to the salesperson | ✓ |
| Deal idle for 7 days in a stage → nudge | |
| Deal won → team post + owner alert | |

**Team (Work)**

| Recipe | Default |
|---|---|
| Task assigned, mentioned or blocked → assignee (in-app + email) | ✓ |
| Due tomorrow / due today / overdue → assignee | ✓ |
| Overdue by 3 days → also the manager or project lead (escalation) | |
| Meeting in 15 minutes → attendees (WhatsApp or email); invites carry an `.ics` file | ✓ |
| Approval pending > 24 hours → reminder to the approver; > 48 hours → escalate to the next approver or HR (built for leave, timed from the current stage; timesheets, claims and corrections not yet) | ✓ |
| Recurring tasks (new feature) → created on schedule, with their alerts | |

**People (Muster)**

| Recipe | Default |
|---|---|
| Leave requested → approver; decision → employee | ✓ |
| Attendance not marked by 10:30 → nudge the employee; forgot to check out → evening nudge | |
| Birthday or work anniversary → wish to the employee + post to the team | |
| New joiner: welcome message before Day 1, document checklist reminders until 100% | |
| Probation ending in 15 days → HR and manager | ✓ |
| ID, contract or visa expiring in 30 days → HR | ✓ |
| Payslip published → email with PDF; optional WhatsApp "your payslip is ready, check email", with no amount | |

**Business compliance (new)**

| Recipe | Default |
|---|---|
| Indian due-date calendar → owner or accountant: GSTR-1 (11th), GSTR-3B (20th), TDS deposit (7th), PF/ESI (15th), PT, advance tax (15 Jun / Sep / Dec / Mar) | |

The dates are editable. Flowbit ships the calendar and the owner checks each date against current notices.

**Flowbit account**

| Recipe | Default |
|---|---|
| Wallet low or empty, trial ending, payment failed, seat limit reached → owner | ✓ |

## 4. Personal brief builder

**One person can have several briefs**, for example a "Morning brief" and an "End-of-day wrap".

| Setting | Options |
|---|---|
| When | Time, days (Mon–Sat by default), how often (daily, weekdays, weekly on a chosen day, monthly on the 1st) |
| Where | In-app, email, WhatsApp (a short version with a "View full brief" link). Any combination. |
| What | Pick and order the sections below |
| Filters | Projects, spaces, tags, priority (for example "only High and Urgent"), "only tasks assigned to me / created by me / watching" |
| Skip | Send nothing when every section is empty |

**Sections the person can pick:**

*Work*
- My tasks due today
- Overdue
- Due this week
- Blocked
- Today's meetings
- My timer and timesheet status

*Approvals*
- Everything waiting on me, with one-tap approve links

*Team (for managers)*
- Who is on leave or absent today
- Who is late
- The team's overdue tasks
- Workload

*Money (for owners and accounts)*
- Due today and overdue, with the top 5 clients
- Yesterday's receipts
- This month's billing so far
- Cash forecast for the week

*Sales*
- Follow-ups due
- New leads yesterday
- Deals closing this week

*Compliance*
- Statutory dates in the next 7 days

**Defaults:** each role starts with a preset brief, for example the owner gets everything and an employee gets Work + Approvals. The admin can set workspace defaults.

**Preview:** "Send me a preview now".

## 5. Personal notification settings

- **Grid:** event group × channel (in-app, email, WhatsApp), with workspace defaults and personal overrides.
- **Digest mode:** batch non-urgent emails into one hourly or end-of-day email instead of one email per event.
- **Quiet hours and holidays:** quiet hours default to 21:00–08:00 IST; nothing goes out on leave days, except urgent messages.
- **Snooze:** pause all alerts for 1 hour, today, or until a date.
- **Bell improvements:** filter, mark all as read, and group by object (for example "5 updates on Task X").
- **Fixed rules:** payslip contents never go by WhatsApp. Security mails always go.

## 6. Console additions (Flowbit staff)

- **Rate card:** price per WhatsApp category and free messages per plan.
- **Per workspace:** override the free quota, credit the wallet (with a reason), and see each workspace's usage and margin.
- **Overview:** WhatsApp numbers connected, their quality rating, and failures across workspaces.

## 7. Not in this phase

- Broadcast or marketing campaigns to many clients (later; needs marketing templates and a stricter opt-in).
- Chatbot or auto-replies beyond the quick-reply buttons.
- SMS and web push / PWA (the mobile phase).
- Becoming a full BSP.

## 8. Build order inside this phase

1. Message pipeline, contacts and consent, Messages log, email upgrades, public document link.
2. Personal preferences, the brief builder, and the new team alerts.
3. Automation engine plus the money and team recipes.
4. WhatsApp: manual setup, templates, sending, webhook ticks, wallet and Razorpay recharge, Console rate card.
5. Shared inbox, quick-reply actions, People / Sales / compliance recipes.
6. Embedded Signup, once Meta Tech Provider approval comes through.

**Every step ends with:**
- tests (with mocked Meta, Resend and Razorpay; no real sends);
- a role crawl;
- a 375 px check of the new screens;
- build clean.

## Owner questions (draft 3: these replace the list below)

1. **BSP partner for the wallet.**
   - Gupshup: lower fixed cost, about $0.001 a message.
   - 360dialog: $500+ a month, no markup on Meta's charges.
   - I recommend Gupshup to start. You would sign up as their partner.
2. **Start Meta business verification and Tech Provider registration for Sanskaar Webx Services LLP now?** Until it is done, only 10 client connections a week are possible.
3. **Rates:** is the suggested starting point (free allowance per plan, ₹0.20 utility, ₹1.20 marketing, packs) OK?
4. **CA confirmations:** the SAC code for message credits, and the expiry and refund terms for credits.
5. **Phase 1 scope:** keep the employee WhatsApp bot, the lead sources and the compliance calendar in phase 1, or move them to phase 1b?

## Owner questions (draft 2, superseded)

1. **Who pays Meta?** With the business's own Meta account, Meta also charges that business directly for each template message, on a card added in Meta Business Manager.
   - **(a)** Keep that as it is. The Flowbit wallet charges only Flowbit's own fee per message, so the client pays twice (Meta and Flowbit) but Flowbit carries no risk.
   - **(b)** The Flowbit wallet covers everything: one price, one bill. This needs Flowbit to sell Meta messages, either through a partner BSP (Gupshup, Karix, Interakt and similar) under a reseller deal, or by becoming a Meta Solution Partner.
   - Recommendation: launch with (a) and plan (b) as the next step.
2. **Meta Tech Provider registration** (for one-click "Connect with Meta"): should Vistaar start it now? It needs a verified Meta Business account for Sanskaar Webx Services LLP.
3. **Starting free WhatsApp messages per plan and the per-message rates.** The Console can change them later.
4. **Compliance calendar:** include it in phase 1, or move it later?
