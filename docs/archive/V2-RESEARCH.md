# Flowbit v2: research check (7 Oct 2026)

This page records what three web research passes found: Meta's WhatsApp platform, competitors, and Indian law and tax. These facts drive the changes in `docs/specs/notifications-v2.md` (draft 3).

How to read the labels:
- **[M]** = checked on Meta's own pages today.
- **[S]** = taken from a reseller (BSP) site or a blog. Treat it as unverified.
- Legal points are not legal advice. The CA or a lawyer should confirm the items marked "CA".

## 1. Meta WhatsApp: what is actually possible

### 1.1 How Meta charges

- **Per delivered template message.** This has been the model since 1 Jul 2025, and the price depends on the message category. [M] https://developers.facebook.com/docs/whatsapp/pricing
- **What is free today:**
  - service (free-form) replies inside the 24-hour window;
  - utility templates sent inside that window;
  - 72 hours after a click-to-WhatsApp ad.

  [M]
- **⚠ This may have changed.** Several BSPs (YCloud, Gupshup, AiSensy) say that from **1 Oct 2026** Meta charges for service replies after 1,000 free per number per month, and for utility templates inside the window. Meta's public page still says they are free. [S]
  - **Design rule:** keep the rate card as data, never hard-code it.
- **India rates (approximate):**

  | Category | Rate per message | Approx. USD |
  |---|---|---|
  | Marketing | ₹0.86 | ~$0.0107 |
  | Utility / authentication | ₹0.115 | ~$0.0014 |

  Add 18% GST to both. Utility messages get cheaper at higher monthly volumes. [S]
- **India billing currency.** Every Indian WhatsApp account must be billed in INR by **31 Dec 2026**. From 1 Jan 2027, Meta stops delivering for accounts that are not on INR. [M]

### 1.2 Who pays Meta, and the wallet

Meta offers three ways to set this up. [M]

| Model | Who pays Meta | Can Flowbit run an all-in wallet? |
|---|---|---|
| Tech Provider | Each client adds their own card in Meta | ❌ No. Flowbit can only charge its own fee on top. |
| Solution Partner (BSP) | The BSP's credit line | ✅ Yes |
| Multi-partner (Tech Provider + BSP) | The BSP's credit line is shared with Flowbit's clients | ✅ Yes, under Flowbit's own brand |

**BSP options for a Flowbit wallet:**

| BSP | Terms | Source |
|---|---|---|
| Gupshup | Partner API, prepaid wallet checkable by API, about $0.001 per message platform fee | [S] |
| 360dialog | "Partner Paid" model: $500–1,000 a month plus a fee per number; Meta's charges passed through with no markup | [S] |
| AiSensy, Interakt | White-label or ISV programmes | [S] |

**Embedded Signup ("Connect with Meta" button):**
- Build only on **v4**. v2 is switched off on 15 Oct 2026. [M]

**Tech Provider onboarding:**
- Steps: business verification → App Review (two demo videos) → access verification.
- Until verified, Flowbit can onboard only **10 new clients a week**; after verification, 200 a week. [M]

**Coexistence (one number in both the WhatsApp Business app and Flowbit):**
- The business keeps using the app on its phone, and Flowbit sends through the API on the same number. Messages sent from the app stay free.
- Limits: 20 messages a second; groups do not sync.
- India support is reported only by a BSP. [S]
- This is a strong fit for small businesses.

### 1.3 Limits and rules

- **Daily limit on new people a number can message:** 250 → 2,000 → 10,000 → 100,000 → unlimited. A client's business needs Meta verification to go past 250. [M]
- **Templates:**
  - Meta reviews them within 24 hours.
  - Each template has a quality rating, and a low-quality template can be paused.
  - **Birthday or greeting messages count as marketing:** they cost more and need an explicit opt-in.
- **Per-user caps on marketing messages:** India was the pilot. A blocked message returns error 131049; wait 24 hours before trying again. [M]
- **WhatsApp Payments in India:**
  - An "invoice" message that the client pays by UPI inside WhatsApp.
  - Works through UPI Intent with any gateway, or a deeper integration with Razorpay or PayU.
  - Available to Tech Providers, so a SaaS like Flowbit can use it. [M]

## 2. Competitors: what the market already offers

| Area | Feature | Who offers it |
|---|---|---|
| Billing | Reminders that carry a UPI/pay link and stop automatically once paid | Vyapar, Refrens, myBillBook |
| Billing | Pay link that marks the invoice paid by itself and sends a receipt | Zoho Books (Razorpay/ICICI), Swipe |
| Billing | Quote accepted and e-signed in a client portal | Zoho Books |
| Billing | WhatsApp sending with pay link + QR | TallyPrime, ₹1,300 a year |
| Billing | e-invoice / e-way bill in one tap | Vyapar, myBillBook |
| Billing | Tally export | Vyapar |
| HR | Approve leave, timesheet and regularisation inside WhatsApp | Zoho People |
| HR | Payslips sent over WhatsApp | Razorpay Payroll, Pocket HRMS |
| HR | Password-protected payslip PDFs | greytHR |
| HR | Selfie + geofence attendance | greytHR, Keka |
| HR | WhatsApp attendance / leave bots | Smaller players |
| CRM | IndiaMART and JustDial lead capture | Kylas, Zoho CRM |
| CRM | Deal stage change sends a WhatsApp message | Bitrix24 |
| CRM | Shared inbox that turns chats into leads | Pipedrive |
| Tasks | Daily summary email | ClickUp |
| Tasks | Reply to an email to add a comment; email turned into a task | ClickUp, Asana |
| Tasks | 5 pm check-in ("What did you work on today?") | Basecamp |

**WhatsApp add-on prices in the market:**

| Provider | Price |
|---|---|
| Interakt | ₹2,799–3,799 a month; utility about ₹0.14–0.16 per message, marketing about ₹0.95 |
| AiSensy | Utility ₹0.145, marketing ₹1.09 |
| Wati | From ₹2,499 a month |

BSP markups run about 10–40% over Meta's rate.

**Flowbit's advantage:** one owner brief that covers all four products (cash, absent staff, deals, slipping tasks). No single-product competitor can offer this.

## 3. India: law and tax

### RBI (prepaid wallet)

- A wallet whose credit can be spent only on Flowbit's own service, with no cash-out and no transfers, is a **closed-system PPI**. It is outside RBI licensing.
- Refunds go back only to the original payment source.
- Expiry and refund terms must be shown at purchase.

### GST

- Rate: 18%. SAC: 998315 or 998319 — the CA to confirm which.
- **Simplest safe treatment: raise a tax invoice on every recharge.**
- Free or promo credits:
  - no GST, because nothing is paid for them;
  - keep them in a separate ₹0 balance.
- Refunds go through a section 34 credit note.

### DPDP Act and Rules 2025

- **Deadlines:**
  - The main obligations apply from **13 May 2027**.
  - MeitY proposed moving this to 13 Nov 2026, but it has not been notified. Target Nov 2026 to be safe.
- **Roles:**
  - For its own customers' account data, Flowbit is the **Data Fiduciary**.
  - For its customers' clients and employees, Flowbit is the **Data Processor**. This requires a data processing agreement (DPA) in the terms.
- **What the product must have:**
  - a consent log;
  - a STOP/unsubscribe suppression list;
  - export and delete on request;
  - retention rules;
  - message logs kept for at least 1 year;
  - a breach process that tells the customer immediately, so they can meet the 72-hour rule.
- **Consent by message type:**
  - Employee messages: lawful under "legitimate use"; no consent needed.
  - Invoices and reminders: defensible.
  - Birthday or marketing messages: need consent.

### TRAI / DLT

- These rules cover SMS and voice only, not WhatsApp or email.
- If SMS is added later, it will need a DLT entity, header and template IDs. Keep those fields in the data model.

### Payslips

- The Wages (Central) Rules 2026 allow electronic payslips.
- **Best practice:** never put salary figures in WhatsApp.
  - Email a password-protected PDF.
  - Optionally send a WhatsApp alert "payslip ready" with an OTP-protected link.

### Statutory due dates (FY 2026-27)

| Item | Due date |
|---|---|
| GSTR-1 | 11th; QRMP filers quarterly by the 13th |
| GSTR-3B | 20th; QRMP filers 22nd or 24th depending on the state |
| PMT-06 (QRMP tax payment) | 25th |
| TDS deposit | 7th (30 Apr for March) |
| TDS returns | 31 Jul, 31 Oct, 31 Jan, 31 May |
| PF and ESI | 15th |
| Advance tax | 15 Jun, 15 Sep, 15 Dec, 15 Mar |
| Professional tax | Varies by state |

The government extends these dates often, so keep them editable.
