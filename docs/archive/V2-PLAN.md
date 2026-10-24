# Flowbit v2: master plan (7 Oct 2026)

This page ties every v2 piece into one order of work. Each piece keeps its own detail in its own spec:

| Track | Spec |
|---|---|
| Console (selling, billing, setup) | `docs/specs/console.md` (draft v2) |
| Messaging hub, alerts, automations, WhatsApp | `docs/specs/notifications-v2.md` (draft 3, section 0b is the latest) |
| Audit of what exists today | `docs/V2-AUDIT.md` |
| Research (Meta, competitors, law) | `docs/V2-RESEARCH.md` |

Rows marked "(built 8 Oct)" are built; `docs/STATUS.md` has the detail per step.

## 1. The two halves of v2

| Half | Who uses it | What it covers |
|---|---|---|
| **Customer side** (the app) | Workspaces: owners, staff, employees | Alerts and morning brief, automations, "Send on WhatsApp" for invoices and quotes, payment links, mobile fixes, notification settings, Billing page, Setup guide |
| **Seller side** (Console, `console.<domain>`) | Vistaar staff: Admin, Sales, Accounts | Signups and leads, account types (Internal, Test, Free, Trial, Paid, Comped), trial and Free control, activate / renew / suspend, bills before payment, payment links, autopay, offline-payment verification, TDS, reminders, bulk import and setup, health score, staff roles with 2FA and audit |

Both halves send messages through **one messaging hub**:
- a `Message` model that replaces the Outbox;
- templates;
- channels: email, WhatsApp, in-app;
- retry and fallback;
- a delivery log;
- opt-in and STOP handling.

The hub is built once. Folio reminders, Console billing reminders, task alerts and the morning brief all use it.

## 2. WhatsApp: the two senders (conflict resolved)

There are two different WhatsApp senders. The two specs were describing different ones, so they do not actually conflict.

| | **A. Flowbit's own number** | **B. The customer's own number** |
|---|---|---|
| Who sends | Flowbit (Console) | A workspace (Folio, Orbit, team alerts) |
| To whom | Workspace owners and admins who opted in | The workspace's own clients and team |
| What | OTP, Flowbit bills, payment links, renewal and due reminders | Invoices, quotes, receipts, thank-you, reminders, task alerts, brief |
| How | Meta Cloud API directly, on Flowbit's own account. Flowbit pays Meta. Two numbers: one for OTP, one for everything else. | Through a BSP partner (Gupshup proposed). The customer recharges a Flowbit wallet and pays per use. "Bring your own Meta account" for large clients. |
| Cost to customer | Included | Wallet, pay as you use. **Not included in the Free plan.** |
| Needs first | Meta business verification of the LLP, a new number, the domain | Meta verification, a signed BSP partner deal, Tech Provider registration, the CA's view on wallet GST |
| Spec | console.md §10 | notifications-v2.md §0b and §2 |

**What both owner statements agree on:** the customer's own number is **paid** (wallet), not free. The only open question was *when* it ships (section 4).

## 3. Shared foundations (build once, before both halves)

1. **`entitlements(org, now)`** plus the `isTrial()` fix (console.md §6).
   - It is the single place for plans, limits and add-ons.
   - The WhatsApp wallet and any free message allowance will also read from it.
2. **Messaging hub core:**
   - `Message` model and enqueue;
   - retry and Resend webhook;
   - templates;
   - Messages log;
   - contacts, consent and the STOP list.

   It starts with email and in-app; WhatsApp plugs in later through a `WhatsAppProvider` interface.
3. **`UsageEvent` recording**, which feeds the health score and wallet metering.
4. **Public document link** `/d/[token]` and **payment links**.
   - Customer invoices and Flowbit's own bills both use them.
   - One Razorpay integration, two uses.
5. **Importer framework** (`ImportBatch` with undo).
   - Used by Console setup (staff) and by the self-serve importer in every workspace.

## 4. Order of work (proposed)

| # | By | What | Track |
|---|---|---|---|
| 0 | **Before 12 Oct** (launch "The Tab Tax") | **Positioning copy:** remove the "GST billing" framing from site meta, the home page, OG image, footer, CTA and Folio copy (V2-AUDIT §1). Small, but the campaign goes live on it. | Marketing |
| 1 | 17 Oct | Console P1 as in console.md §12: entitlements + isTrial fix, account types, email OTP + duplicate check, Free or Trial by seat count, signup → Orbit lead, Day 0 email, UsageEvent, legal name fix | Foundation + Console |
| 2 | 31 Oct | **Hub core:** Message model (built 8 Oct), retry (built 8 Oct), Messages log (built 8 Oct), consent and STOP (built 8 Oct: suppression list, unsubscribe, consent log; inbound WhatsApp STOP comes with step 8), notification preferences (built 8 Oct). **Team alerts by email:** task assigned, mention, due and overdue; approvals; leave (built 8 Oct). **Morning brief builder** (email + in-app) (built 8 Oct). | Customer |
| 3 | 1 Nov | Free limits, Free/trial expiry flow, Day 1/3/7 emails, export while read-only. These are sent through the hub. (built 8 Oct) | Console |
| 4 | 15 Nov | **Public document link + payment links** (Razorpay / UPI QR, automatic receipt, thank-you automatic, reminders stop once paid). Automation engine with the money and team recipes, delivered by email. (built 8 Oct) | Customer |
| 5 | Mid Nov | Console host + staff roles + 2FA + audit, accounts list and detail, health score, importers + undo + consent/DPA, handover checklist and Setup guide (built 8 Oct) | Console |
| 6 | Nov (alongside) | **Mobile pass:** 375 px screenshot audit first, then kanban touch, hover-only buttons, calendar agenda views, timesheet day form, quick check-in, touch targets, safe area, bottom-sheet dialogs, installable PWA (built 8 Oct) | Customer |
| 7 | Mid Dec | Console billing: due bills, autopay, offline verify, TDS, credit notes, renewal and due reminders. **WhatsApp A (Flowbit's own number)** goes live once Meta verification is through. (built 8 Oct; WhatsApp waits on Interakt keys, approved templates and Meta verification) | Console |
| 8 | Jan 2027 | **WhatsApp B (customer's own number):** BSP partner, connect panel (Embedded Signup v4 + coexistence), templates, wallet with Razorpay recharge and GST invoice, Send on WhatsApp, WhatsApp pay, automatic reminders and thank-you, delivery ticks (built 8 Oct — BYO mode; managed mode awaits Interakt partner deal) | Customer |
| 9 | Feb 2027 | Shared WhatsApp inbox (built 8 Oct, step 8; canned replies and attach invoice/quote built 8 Oct), approve by WhatsApp or email (built 8 Oct), employee WhatsApp bot (built 8 Oct), lead sources (IndiaMART (built 8 Oct, beta), JustDial via the lead webhook (built 8 Oct), web form (built 8 Oct), click-to-WhatsApp ads (built 8 Oct)), quote e-accept (built 8 Oct: online in step 4, Accept button on WhatsApp in 9a), compliance calendar (built 8 Oct), Sales and People recipes, custom automations, bell filter and grouping, leave-day hold, branded client email (built 8 Oct), Console sales and finance reports (built 8 Oct, step 9b: funnel, money, team, marketing with UTM, CSV export) | Both |
| 10 | Before May 2027 (target Nov 2026) | DPDP pieces: DPA in the terms (built 8 Oct: /legal/dpa, accepted in Settings → Support access), export/delete per contact (built 8 Oct, step 9b), retention (built 8 Oct, step 9b: logs pruned after 395 days, dry run until switched on), breach runbook (built 8 Oct, step 9b: docs/BREACH-RUNBOOK.md and Console → Incidents) | Both |

**Why WhatsApp B is in January and not October:**
- It cannot go live before Meta verification and a BSP partner deal exist.
- The hub, payment links and automations it depends on are steps 2–4.
- **Everything in the customer-side plan works by email first.** WhatsApp is then added as one more channel.
- If the BSP deal and Meta verification move faster, step 8 can move up to December.

## 5. One build line, not two

The Console session and the v2 session would change the same files:
- `lib/mail.ts`, Outbox / Message
- `lib/plans.ts`, `subscription/*`
- Folio `MessageLog` and reminders
- `modules/platform`

Two builds running at once would undo each other's work. **So v2 runs as one build line in the order above, with one workflow at a time.** Each step ends with:
- tests;
- a 10-role crawl;
- a 375 px check of the new screens;
- a clean build.

This also follows the Mac limit: one browser at a time.

## 6. Owner checklist

**Off-code tasks to start now:**
- Domain.
- Meta business verification of Sanskaar Webx Services LLP.
- New WhatsApp numbers (OTP and messages).
- Terms, Privacy, Refund and DPA pages.
- Razorpay UPI Autopay fee in writing.
- BSP partner talk (Gupshup).

**Decisions still open:**
1. Expiry flow: 30 days read-only → blocked → delete after 90 days (console §13.1).
2. Domain.
3. List price from Jan 2027, and how the campaign's ₹149 claim stays true.
4. BSP for the wallet: Gupshup?
5. Wallet rates and packs (notifications-v2 §0b pricing guide). Free plan: no WhatsApp.
6. CA: SAC code for message credits, and credit expiry and refund terms.
7. Is the order in section 4 OK? In particular: positioning copy before 12 Oct, and WhatsApp B in January.

## 7. Owner answers (7 Oct, night)

**Decided:**
- Domain: **useflowbit.com**. Code defaults are now:
  - `no-reply@useflowbit.com`
  - `support@useflowbit.com`
  - legal name Sanskaar Webx Services LLP
  - footer line "Flowbit is a brand of Sanskaar Webx Services LLP"
- Expiry flow approved: 30 days read-only → blocked → data deleted 90 days later.
  - Legal pages and FAQ updated to match.
- Price stays at **₹149** for now.
- Order of work approved. The positioning copy is **done** (7 Oct).
- **WhatsApp BSP: Interakt** (not Gupshup).
- Legal pages: terms, privacy and refunds updated; a new **/legal/dpa** page added. All are drafts for the lawyer.
- CA questions are drafted in `docs/CA-QUESTIONS.md`.

**Interakt facts** (interakt.shop, checked 7 Oct):
- **Plans:**
  - Starter is free but has **no API**.
  - Growth costs ₹2,239–2,799 a month and includes API (300 requests/min) and webhooks.
  - Advanced costs ₹3,039–3,799 a month.
- **Per message, Growth plan:**

  | Category | ₹ per message |
  |---|---|
  | Marketing | 0.958 |
  | Utility | 0.150 |
  | Authentication | 0.128 |
  | Service | 0.128, after 1,000 free a month per number (this confirms the 1 Oct 2026 Meta change) |

- **Wallet:**
  - Prepaid, with 18% GST charged on recharge.
  - The balance is **non-refundable and non-transferable**.
  - At zero balance, every send fails.
- **API:**
  - `POST https://api.interakt.ai/v1/public/message/` (Basic auth with the API key).
  - Supports PDF headers, dynamic URL buttons, quick-reply payloads and `callbackData`.
  - Webhooks for sent, delivered, read and failed, plus inbound messages.
  - No public endpoint for creating templates.
  - Coexistence is supported.
- **Use A (Flowbit's own number):** Interakt Growth, billed yearly. ✔ Works as is.
- **Use B (each customer's own number):**
  - A retail Interakt account per customer would cost every customer ₹2,239+ a month, which **breaks the model**.
  - The **White Label / ISV partnership** is needed. Owner to apply on interakt.shop/partner-program and get these in writing:
    - (a) one Flowbit wallet can fund many client numbers;
    - (b) Flowbit sets its own prices;
    - (c) the per-number platform fee;
    - (d) a sub-account / Embedded Signup API and template management;
    - (e) coexistence on client numbers.
  - If Interakt can't do this, fall back to 360dialog or Gupshup.
  - The code keeps a `WhatsAppProvider` interface, so the provider can change.

**Flowbit wallet rate card (proposed, excluding GST; the Console can change it):**

| Category | Flowbit price | Interakt cost | Margin |
|---|---|---|---|
| Utility | ₹0.25 | ₹0.15 | 40% |
| Authentication | ₹0.20 | ₹0.128 | |
| Service | ₹0.20 | ₹0.128 | |
| Marketing | ₹1.25 | ₹0.958 | 23% |

- **Packs:** ₹500, ₹1,000, ₹2,500 (+5% bonus), ₹5,000 (+10%), ₹10,000 (+12%).
- **Minimum recharge:** ₹500.
- **Auto top-up:** below ₹200.
- **Paid credits:** expire after 12 months (to be confirmed by the CA).
