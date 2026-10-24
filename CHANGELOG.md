# Changelog

## 2.0.0 (9 Oct 2026)

Flowbit 2.0 follows 1.0.1. It adds a back office for the Flowbit team, new plans, a notification and automation layer, and online documents for clients. It also closes the Tier 1 items from the 8 Oct review. `docs/FEATURES.md` lists every feature, and `docs/archive/STATUS-HISTORY.md` records how each step was built and checked.

### Plans and accounts
- **New account types:** Free (5 seats for 6 months), a 15-day Trial, Paid, Comped, Internal and Test.
- **Lifecycle:** read-only, then blocked, then deletion. Reminder emails go out at each stage.
- **Settings → Billing:** pay due bills, download invoices, set up autopay, or report a bank transfer.

### Notifications and automations
- **Alert controls:** a grid of alert by channel for each person and for the workspace, with hourly or end-of-day digests, quiet hours, snooze, and holds while someone is on leave.
- **Actionable email:** emails link to their item and carry Approve / Reject or Mark done buttons. Meeting emails include a calendar invite.
- **Morning briefs:** sections for work, approvals, team, money, sales and compliance.
- **Automations:**
  - built from events, date offsets or schedules, with conditions, delays and caps
  - ready recipes for money, team, sales, people and compliance
  - a builder for your own rules
- **Messages log:** every message with its delivery timeline, retries and bounce handling.

### Clients get online documents
- **Public links** for invoices, quotes, receipts, credit notes and statements:
  - pay by UPI QR or by Razorpay link, from the workspace's own Razorpay keys
  - accept or decline quotes online
  - track the open → paid trail
- **Branding:** client emails carry the workspace's logo and colour.

### Workspace tools
- **Import:** 9 importers with a preview and a 7-day undo.
- **Export:** an owner can export the whole workspace as a ZIP.
- **DPDP:** export or erase one person's data, data-retention pruning, and the DPA.
- **Support access:** owners approve Flowbit staff access, either read-only or import-only.
- **Compliance calendar:** GST, TDS, PF/ESI and professional tax dates, with reminders.
- **Setup guide:** a handover card for new workspaces.
- **Phones:** touch boards, day lists, bottom-sheet dialogs, a quick check-in in the top bar, and an installable app.

### Console (Flowbit back office)
- **Customer accounts:** accounts, trials, billing, dunning and offline payments.
- **Support:** staff roles with two-factor sign-in, reports, alerts and incidents.
- **Settings:** prices, limits, templates and feature switches, all changed without a code change.

### WhatsApp (built, hidden for now)
- **What exists:** a WhatsApp integration (the workspace's own number and wallet), Send on WhatsApp, an inbox, WhatsApp alerts and an employee bot.
- **Why it is hidden:** it waits for the Interakt partner deal.
- **How to turn it on:** set `FEATURE_WHATSAPP=on`. The Console feature switch can turn it off again.

### The 2.0 lock (Tier 1 of the 8 Oct review)
- **Comments:**
  - comments and post replies appear instantly; notifications and activity run after the response
  - images and GIFs in posts, replies and task comments
- **Home:** "Assign to me" has an inline quick add.
- **Break types:**
  - Lunch, Power Nap, Tea/Coffee and Personal/Rest, each paid or unpaid with a daily limit
  - effective and payable hours on the daily sheet, the register and Home
- **Branding:**
  - brand colours now reach every gradient
  - the workspace logo replaces Flowbit's in the side panel and the phone top bar
- **Projects and clients:**
  - project and client logos, with client logos shown on their tasks
  - a custom project colour
- **Clients:** an Import button on the Clients page.
- **Version:** "Flowbit 2.0" shows at the foot of Settings.
