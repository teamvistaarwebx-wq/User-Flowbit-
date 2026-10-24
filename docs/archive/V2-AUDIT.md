# Flowbit v2 audit (7 Oct 2026)

This is a read-only audit of the code as it stands. Nothing in this file has been built yet.

Status marks: ✅ present · 🟡 partial · ❌ missing.

## 1. Positioning: the suite is sold as "GST billing"

The GST framing came from Folio's copy and spread to the whole suite.

**Places to change:**

| File | What it says now |
|---|---|
| `src/app/layout.tsx:12` | Site-wide meta: "…CRM and GST billing" |
| `src/app/(marketing)/page.tsx:25,26` | Home title and description ("…GST invoicing") |
| `src/app/(marketing)/page.tsx:33,35` | Proof bullets about CGST/SGST and "invoice numbers that restart each April" |
| `src/app/(marketing)/page.tsx:64` | Hero line |
| `src/app/(marketing)/page.tsx:70` | Trust line "₹ and GST built in" |
| `src/app/(marketing)/opengraph-image.tsx:9` | Eyebrow "… · GST billing" |
| `src/components/marketing/site-footer.tsx:19` | Footer line |
| `src/components/marketing/cta-band.tsx:26` | CTA band "₹ and GST built in" |
| `src/components/marketing/comparison.tsx:11` | Comparison copy |
| `src/app/(marketing)/contact/page.tsx:18` | Contact page copy |
| `src/lib/catalog.ts:223,225` | Folio descriptions start with "GST invoices…" |
| `src/modules/marketing/content/folio.ts:5,6,61` | Folio eyebrow, one-liner and SEO title |

**Proposal:**
- Position the suite as one workspace for running the business: work, people, sales and money.
- Present Folio as "billing and collections": quotes, invoices, receipts, reminders, expenses and P&L. GST becomes one feature inside it.
- The pricing line "excluding 18% GST" stays as it is.

## 2. Notifications today

**Channels**

| Channel | Status | Detail |
|---|---|---|
| In-app | ✅ | Bell polls every 30 s. Covers almost every event. |
| Email | 🟡 | Resend only. One synchronous attempt, no automatic retry, no bounce or delivery webhook. |
| WhatsApp | ❌ | Only wa.me click-to-chat links, plus a manual "Mark sent" queue in Folio collections. No Meta Cloud API. |
| Per-user preferences | ❌ | `User.prefs` holds only sound and motion. No per-channel or per-event toggles. |
| Morning brief / digest | ❌ | Crons only send per-item reminders. |

**What currently sends email**
- Auth: invite, password reset, password changed, ownership transfer.
- Payslip PDF.
- Claims: OTP and decision.
- Trial ending (3 days and 1 day before).
- Flowbit's own subscription invoice.
- Folio:
  - invoice, quote, credit note and statement (sent by hand, with the PDF);
  - automatic payment reminders.

**What is in-app only (no email)**
- **Every task event:** assigned, status change, blocked, comment, @mention, due today, overdue.
- Leave applied or approved, attendance corrections, comp-off.
- Meetings, posts, timesheet approval.
- Orbit leads, deals and follow-ups due.
- Payment failed, subscription cancelled.

## 3. Proposed WhatsApp + email model

### 3.1 Connect panel (Settings → Integrations → WhatsApp)

**Inputs from Meta Business:**
- Phone Number ID
- WhatsApp Business Account (WABA) ID
- Permanent access token (system user)
- App secret, used to verify webhooks

**Behaviour:**
- "Test connection" sends a test message.
- Tokens are stored encrypted. They are never shown again after saving.
- A webhook at `/api/whatsapp/webhook` receives sent, delivered, read and failed statuses, and incoming replies.

**Templates:**
- Message templates are synced from Meta, showing approval status and category (utility or marketing).
- Flowbit ships ready-made templates for invoice, quote, payment reminder, task alert and morning brief, with "submit to Meta".

**Meta rule that shapes this design:**
- Free text can only be sent within 24 hours of the client's last message.
- Anything Flowbit starts (sending an invoice, a reminder or "Hi, this is…") must use a template Meta has approved.
- So "Send on WhatsApp" sends a template that carries the PDF as an attachment, plus a short message.

### 3.2 Credits / recharge model

Meta charges per template message (utility and marketing cost differently). Meta bills that charge directly to the business that connected the API.

**Options:**
- **(a) Bring your own API:** the business pays Meta directly. Flowbit only applies a monthly message limit per plan. This is the simplest option.
- **(b) Flowbit wallet:** the business recharges through Razorpay, and each message deducts Meta's cost plus Flowbit's margin.
  - Needs a ledger, low-balance alerts, auto-stop at zero and GST invoices for recharges.
  - Fits the "recharge" idea.
  - Only works if Flowbit itself is the sender (a BSP or tech provider), or bills a platform fee per message on top of option (a).

**Common to both:** a usage screen showing messages per day, cost per category and failed sends.

### 3.3 "Send on WhatsApp" buttons

Each button sits next to the existing email button. The number is pre-filled from the client, and the user can edit it before sending.

| Document | Status |
|---|---|
| Folio invoice | ❌ (only the reminder dialog has a wa.me link) |
| Folio quote / proforma | ❌ |
| Folio credit note, receipt, statement | ❌ |
| Payment reminder (manual, and automatic by schedule) | 🟡 queued for a person to send by hand → send automatically |
| Orbit lead / contact message | 🟡 wa.me → real send + log in activity |

A public document link (`/d/[token]`) for viewing, downloading and paying the invoice is needed for both WhatsApp and email. ❌ today.

### 3.4 Event → channel matrix (proposal; each user can change it)

| Event | In-app | Email | WhatsApp |
|---|---|---|---|
| Task assigned / mentioned / blocked | ✅ | ➕ | ➕ (optional) |
| Task due today / overdue | ✅ | ➕ | ➕ |
| Comment on my task | ✅ | ➕ (batched) | — |
| Morning brief (my tasks today, overdue, meetings, approvals, money due) | ➕ | ➕ | ➕ (short version) |
| Pending approvals (leave, timesheet, claims, corrections) | ✅ | ➕ | ➕ |
| Leave approved / rejected | ✅ | ➕ | ➕ |
| Payslip | ✅ | ✅ | ❌ (by design: email only) |
| Letters (offer, appointment and so on) | ✅ | 🟡 manual | — |
| Invoice / quote to client | — | ✅ manual | ➕ |
| Payment reminder to client | — | ✅ auto | ➕ auto |
| Payment received (receipt to client) | — | ➕ | ➕ |
| Orbit follow-up due (to salesperson) | ✅ | ➕ | ➕ |
| Trial / plan / payment failed (to owner) | ✅ | 🟡 | ➕ |
| Meeting scheduled / moved | ✅ | ➕ (with .ics) | — |

➕ = add in v2.

**Infrastructure needed:**
- One `Message` / outbox for every channel, with a queue worker, retry and backoff, and delivery status.
- Notification preferences per user, per event and per channel, with quiet hours.
- Workspace defaults set by the admin.
- An email log that becomes a "Messages log" covering both email and WhatsApp.
- A Resend webhook for bounces.

## 4. Mobile responsiveness

**What already works:**
- Hamburger drawer and bottom nav below 768 px.
- Tables scroll sideways inside their cards and hide extra columns on mobile.
- Permission matrix has a separate mobile view.
- Marketing and login pages are ready.

**What breaks or feels bad on a phone:**

| Area | Problem | Size |
|---|---|---|
| Kanban (tasks, deals, leads) | `touch-none` on cards means a finger starts a drag instead of scrolling (`ui/kanban.tsx:59,118`) | M ✅ (fixed 8 Oct) |
| Hover-only buttons | Add, delete and reorder are hidden on touch (task-board, board-card, folder-list, checklist, Orbit activity row) | S ✅ (fixed 8 Oct) |
| Task calendar / leave calendar | 7 columns of about 48 px each are cramped. Needs an agenda/list view on mobile. | M ✅ (fixed 8 Oct) |
| Meetings week view, timesheet | 760–820 px tables scroll sideways, and editing them by touch is hard. Needs a day view and a per-day timesheet form. | M ✅ (fixed 8 Oct) |
| Time approvals | `grid-cols-7` with no breakpoint | S ✅ (fixed 8 Oct) |
| Notification popover | 360 px plus padding overflows a 375 px screen | XS ✅ (fixed 8 Oct) |
| Check-in | Only reachable through the drawer. Needs a quick check-in button on mobile Home / bottom nav. | S ✅ (fixed 8 Oct) |
| Attendance register | Cells are 22–30 px, so tap targets are small | S ✅ (fixed 8 Oct) |
| Touch targets | About 79 icon buttons are 28–32 px (guideline is 44) | S–M ✅ (fixed 8 Oct) |
| Safe area | No `viewport-fit=cover` and no bottom padding for the iPhone home bar | XS ✅ (fixed 8 Oct) |
| Dialogs | Centred modals. On phones they should open as bottom sheets. | S ✅ (fixed 8 Oct) |
| Whiteboard | Height does not account for the mobile top and bottom bars | XS ✅ (fixed 8 Oct) |

**Plus:**
- ✅ Installable PWA: manifest and icons (fixed 8 Oct). No service worker on purpose (nothing cached offline).
- ❌ Push notifications.

**Note:** this audit was done by reading code. Before the fix round, take actual screenshots at 375 px of every page, one browser at a time.

## 5. Other gaps worth adding in v2

**Money (Folio)**

| Feature | Status | Note |
|---|---|---|
| Payment link / UPI QR on invoice | 🟡 | UPI ID is printed as text only |
| Public invoice / quote link with "Accept quote" | ❌ | |
| E-invoice / e-way bill | ❌ | |
| Tally export | ❌ | |

**Sales (Orbit)**

| Feature | Status | Note |
|---|---|---|
| Website lead form / webhook (Meta lead ads, website) | ❌ | Leads come only from manual entry and CSV |
| Google Calendar sync / .ics | ❌ | |

**Work**

| Feature | Status | Note |
|---|---|---|
| Recurring tasks | ❌ | |
| Client portal (client sees their tasks, invoices, files) | ❌ | |

**Platform**

| Feature | Status |
|---|---|
| Hindi / multi-language | ❌ |
| Full workspace export / backup | 🟡 (CSV per module only) |

**Pending from specs (written after the last build):**
- `console.md`:
  - account types;
  - a Free plan instead of lockout;
  - phone OTP signup;
  - onboarding emails on Day 0/1/3/7;
  - a separate Console with health score;
  - Excel importer.
- `muster.md`:
  - sick half-day status;
  - Yesterday / Today tabs;
  - leave marks linked to the leave request;
  - month-lock check on every write;
  - holiday-in-use check.

**Open gaps from STATUS.md:**
- Payroll freshness check and reopen.
- ESI contribution period.
- Payslip bulk email that resends to people already sent.
- Duplicate retainer drafts.
- Subscription seat-count mismatch.

**Ten owner decisions are still pending:** see `STATUS.md` line 231.
