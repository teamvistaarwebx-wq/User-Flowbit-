# WhatsApp templates for Flowbit's own number (WhatsApp A)

**8 Oct 2026.** Paste these into Interakt and submit them to Meta. Interakt has no public API for creating templates, so the owner creates each one by hand.

- Create the **utility** templates in the Interakt account of the **messages** number (`INTERAKT_API_KEY`).
- Create the **authentication** template in the Interakt account of the **OTP** number (`INTERAKT_OTP_API_KEY`).
- Marketing goes by email only. Never submit a marketing template for these numbers.

Once a template is approved, open **Console → Settings → WhatsApp templates** and check three things:

- the **name** is exactly the one you created;
- the **language** matches (`en` unless you chose another);
- the **variables** are in the order of `{{1}}, {{2}}…` in your body.

The names below are already the defaults, so if you keep them nothing needs to change.

## How Flowbit fills them

- **Body variables.** Flowbit fills `{{1}}`, `{{2}}`… from the variable list in Console Settings, in that order.
- **Document header.** The PDF is fetched by Interakt/Meta from a public Flowbit link: `https://<app>/api/public/bill/<token>/pdf`. Flowbit also sends the file name, for example `Flowbit-FB-2026-27-0004.pdf`.
- **URL button.** Every URL button uses the same **dynamic URL**: `https://app.useflowbit.com/{{1}}`. Flowbit sends the rest of the path as the button value:
  - a bill: `bill/<token>`;
  - the billing page: `app/settings/billing`.
  - If the app runs on another domain, use that domain in the button URL.
- **Callback data.** Flowbit's message id goes in callback data, so the delivery ticks (sent, delivered, read, failed) land on the right message in Console → Messages.

When Meta asks for samples, use the example values given with each template.

---

## Buttons (8 Oct, step 9a)

Flowbit's own templates keep their single URL button; none carries quick-reply buttons. Quick replies (Approve / Reject, Mark done / Snooze, Accept, I've paid) belong to a workspace's own number, because the people who press them are that workspace's team and clients: see `docs/WHATSAPP-TEMPLATES-CUSTOMER.md` ("Quick-reply buttons"). If a template here ever gets a quick reply, its payload must use the same `fb1:<action>:<token>` form.

## 1. `flowbit_bill_pdf`: bill with PDF (Utility)

- **Header:** Document (PDF)
- **Body:**

  ```
  Hi {{1}}, your Flowbit bill {{2}} for {{3}} is due on {{4}}. The bill is attached. You can pay online with the button below, or pay by bank transfer and share the UTR in Flowbit → Settings → Billing.
  ```

- **Footer (optional):** `Flowbit is a brand of Sanskaar Webx Services LLP`
- **Button:** Visit website, **dynamic**, text `View and pay`, URL `https://app.useflowbit.com/{{1}}`
- **Variables in Console:** `name, number, amount, dueDate`
- **Sample:** Asha · FBB/2026-27/0001 · ₹1,758.00 · 15 Oct 2026 · button value `bill/abc.def`

## 2. `flowbit_payment_link`: payment link (Utility)

- **Header:** none
- **Body:**

  ```
  Hi {{1}}, here is the payment link for your Flowbit bill {{2}} of {{3}}. Tap Pay now to pay with UPI, card or net banking. Your GST invoice follows as soon as the payment arrives.
  ```

- **Button:** Visit website, **dynamic**, text `Pay now`, URL `https://app.useflowbit.com/{{1}}`
- **Variables in Console:** `name, number, amount`
- **Sample:** Asha · FBB/2026-27/0001 · ₹1,758.00 · button value `bill/abc.def`

## 3. `flowbit_renewal_reminder`: renewal reminder and pre-debit notice (Utility)

- **Header:** none
- **Body:**

  ```
  Hi {{1}}, a reminder about your Flowbit plan for {{2}}: it renews on {{3}} for {{4}}. If autopay is on, the amount is debited on that date. To pay or change how you pay, open Billing.
  ```

- **Button:** Visit website, **dynamic**, text `Open billing`, URL `https://app.useflowbit.com/{{1}}`
- **Variables in Console:** `name, workspace, date, amount`
- **Sample:** Asha · Acme · 8 Nov 2026 · ₹1,758.00 · button value `app/settings/billing`

Flowbit uses this template for the 15, 7, 3 and 1-day renewal reminders and for the autopay **pre-debit notice** sent 24–48 hours before each debit. The email of the same notice carries the full RBI wording, including the ₹15,000 approval note.

## 4. `flowbit_due_reminder`: due and overdue reminder (Utility)

- **Header:** none
- **Body:**

  ```
  Hi {{1}}, your Flowbit bill {{2}} for {{3}} was due on {{4}}. Please pay it to keep your workspace fully open. Already paid by bank transfer? Share the UTR in Flowbit → Settings → Billing.
  ```

- **Button:** Visit website, **dynamic**, text `View and pay`, URL `https://app.useflowbit.com/{{1}}`
- **Variables in Console:** `name, number, amount, dueDate`
- **Sample:** Asha · FBB/2026-27/0001 · ₹1,758.00 · 15 Oct 2026 · button value `bill/abc.def`

One wording covers both "due on" (before the date) and "was due on" (after it). If Meta rejects the past tense for reminders sent before the date, change it to "is due on {{4}}".

## 5. `flowbit_payment_received`: payment received with the tax invoice (Utility)

- **Header:** Document (PDF)
- **Body:**

  ```
  Hi {{1}}, thank you. We received {{2}}. Your GST tax invoice {{3}} is attached and your Flowbit plan is active.
  ```

- **Button:** none
- **Variables in Console:** `name, amount, number`
- **Sample:** Asha · ₹1,758.00 · FB/2026-27/0004

## 6. `flowbit_otp`: verification code (Authentication, on the OTP number)

Create this one as an **Authentication** template with a **Copy code** button. Meta fixes the body text for authentication templates; pick these options:

- **Body:** Meta's standard text, `{{1}} is your verification code.`
- **Security recommendation:** on ("For your security, do not share this code.")
- **Expiry:** 10 minutes
- **Button:** Copy code
- **Variables in Console:** `code`
- **Sample:** 123456

Flowbit sends the code as the body variable and as the copy-code button value.

---

## Rate card (Console → Settings → WhatsApp rate card)

These are Interakt Growth costs, ₹ per message excluding GST, checked 7 Oct 2026 (V2-PLAN §7). Each WhatsApp message records its cost from this card, so update it when Interakt or Meta change their prices.

| Category | ₹ per message |
|---|---|
| Utility | 0.150 |
| Authentication | 0.128 |
| Service | 0.128 (after 1,000 free a month per number) |
| Marketing | 0.958 (not used) |

## Checklist for the owner

1. Finish Meta Business verification for Sanskaar Webx Services LLP. The display name is "Flowbit"; the website footer already says "Flowbit is a brand of Sanskaar Webx Services LLP".
2. Get two new numbers that are not on the WhatsApp app, and connect each one to its own Interakt Growth account: one for messages, one for OTP.
3. Create templates 1–5 in the messages account and template 6 in the OTP account. Wait for Meta's approval.
4. Set these environment variables:
   - `INTERAKT_API_KEY` (messages account);
   - `INTERAKT_OTP_API_KEY` (OTP account);
   - `INTERAKT_WEBHOOK_SECRET` (`openssl rand -hex 32`).
5. In **each** Interakt account, open **Developer Settings → Webhooks**:
   - URL: `https://app.useflowbit.com/api/webhooks/interakt?token=<INTERAKT_WEBHOOK_SECRET>`;
   - events: message sent, delivered, read, failed, and message received.
6. Open Console → Settings → WhatsApp templates and confirm the names. Then send yourself a bill from a test workspace: verify your phone in Profile and turn WhatsApp on first.
