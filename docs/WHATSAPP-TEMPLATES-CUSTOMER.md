# WhatsApp templates for a workspace's own number (WhatsApp B)

**8 Oct 2026.** This is the Flowbit template pack for workspaces that send from **their own** WhatsApp number (Settings → Integrations → WhatsApp). Flowbit's own number (bills to owners, OTP) has a separate pack in `docs/WHATSAPP-TEMPLATES.md`.

Give this page to the workspace owner, or share the relevant templates with them.

## Before you start

1. **Interakt account on the Growth plan or higher.** The Starter plan has no API, so Flowbit cannot send through it.
2. **Your number is connected in Interakt** and your Meta business is verified. Without verification Meta lets a number start conversations with only 250 new people a day.
3. In Flowbit, open **Settings → Integrations → WhatsApp**:
   - paste the **API key** (Interakt → Settings → Developer Settings);
   - make up a long **webhook secret** (16+ random characters) and paste it;
   - enter the display name and the number;
   - copy the **webhook URL** shown and paste it in Interakt's webhook settings with your secret at the end: `https://app.useflowbit.com/api/webhooks/whatsapp/<key>?token=<your secret>`. Tick message status (sent, delivered, read, failed) and incoming messages.
4. **Create the templates below** in Interakt (Templates → New) and submit them to Meta. Interakt has no public API for this, so each one is created by hand. Approval usually takes minutes to a day.
5. Back in Flowbit, under **Templates**, check each one's exact **name**, **language** (`en` or `hi`), **category**, and the **variables in the order** of `{{1}}, {{2}}…`. If you keep the names below, nothing needs to change except the language for Hindi.
6. **Send a test** from the same page.

## How Flowbit fills them

- **Body variables.** `{{1}}`, `{{2}}`… are filled from the variable list in your mapping, in that order. The defaults below match the English and Hindi texts on this page.
- **Document header (PDF).** Invoices, quotes, credit notes, receipts and statements carry the PDF. Meta fetches it from the document's public link: `https://app.useflowbit.com/d/<token>/pdf`. Flowbit also sends a file name such as `Invoice-INV-2026-27-0042.pdf`.
- **URL button.** Every URL button uses the same **dynamic URL**: `https://app.useflowbit.com/{{1}}`. Flowbit sends the rest of the path as the button value:
  - a document's online page: `d/<token>`;
  - a page inside Flowbit (task, approval, payslips): for example `app/work/tasks/<id>`.
  - If your Flowbit runs on another domain, use that domain in the button URL.
- **Quick-reply buttons (added 8 Oct, step 9a).** Some templates also carry quick-reply buttons after the URL button. Add them in Interakt in the order listed (the URL button first, then the quick replies). Flowbit sends a payload with each one (Interakt `buttonPayload`, keyed by the button's position: the URL button is 0, the first quick reply 1, the second 2). When someone presses the button, the payload comes back on your webhook and Flowbit acts on it at once:
  - **Approve / Reject** (`fb_approval_pending`): a signed one-time action for the person the alert went to, from their own number only. A rejection asks for the reason in the next message. The same checks as the app apply (role, approval stage, locked months).
  - **Mark done / Snooze 1 day** (`fb_task_due`): marks the task done, or moves its due date one day on.
  - **Accept** (`fb_quote_share`): accepts the quote, recorded as accepted on WhatsApp from that number.
  - **I've paid** (invoice and reminders): Flowbit asks for the UTR, then creates the "verify payment" task as the online page does.
  - The payload format is `fb1:<action>:<token>`; never edit it. A press without a payload (an old template) gets the reply "Open Flowbit".
  - **Beta:** Interakt's public docs do not show the webhook field for a button press. Flowbit reads `button_payload` and the other usual spellings; check with a real press after you create the templates (Settings → Messages log and the inbox).
- **Callback data.** Flowbit's message id goes in callback data, so delivery ticks reach the right document timeline.
- **Values never contain line breaks.** WhatsApp refuses them, so Flowbit flattens them.
- **One language per template.** In Interakt you can create the same template name in English and Hindi. Flowbit sends the language set in your mapping (`en` or `hi`).

## What it costs

- **Your own Interakt account (today):** Interakt bills you for Meta's charge per message (Growth plan, 7 Oct 2026: utility ₹0.15, authentication ₹0.128, service ₹0.128, marketing ₹0.958, plus GST). Flowbit adds only the platform fee from its rate card, ₹0 unless announced, charged from your WhatsApp wallet (Settings → Billing → WhatsApp wallet).
- **Flowbit-managed (coming soon):** no Interakt account needed; every message is charged from the wallet at Flowbit's rate card (utility ₹0.25, marketing ₹1.25, plus GST).
- Free replies inside 24 hours of a customer's message (the inbox) cost nothing from Flowbit.

When Meta asks for samples, use the example values given with each template.

---

## Money (send these to clients)

### 1. `fb_invoice_share`: invoice (Utility)

- **Header:** Document (PDF)
- **Body (English, `en`):**

  ```
  Hi {{1}}, {{2}} has sent you invoice {{3}} for {{4}}, due on {{5}}. The PDF is attached. Tap View invoice to see it online or pay.
  ```

- **Body (Hindi, `hi`):**

  ```
  नमस्ते {{1}}, {{2}} की ओर से इनवॉइस {{3}} ({{4}}) भेजा गया है। भुगतान की अंतिम तिथि {{5}} है। PDF साथ में है। ऑनलाइन देखने या भुगतान करने के लिए View invoice दबाएँ।
  ```

- **Button:** Visit website, dynamic, text `View invoice`, URL `https://app.useflowbit.com/{{1}}`
- **Quick reply:** `I've paid` (after the URL button)
- **Variables:** `name, business, number, amount, dueDate`
- **Sample:** Ravi · Acme Studio · INV/2026-27/0042 · ₹11,800.00 · 15 Oct 2026 · button value `d/abc.def`

### 2. `fb_quote_share`: quote or proforma (Utility)

- **Header:** Document (PDF)
- **Body (`en`):**

  ```
  Hi {{1}}, {{2}} has sent you {{3}} for {{4}}, valid until {{5}}. The PDF is attached. Tap View quote to see it or accept it online.
  ```

- **Body (`hi`):**

  ```
  नमस्ते {{1}}, {{2}} की ओर से {{3}} ({{4}}) भेजा गया है, जो {{5}} तक मान्य है। PDF साथ में है। देखने या ऑनलाइन स्वीकार करने के लिए View quote दबाएँ।
  ```

- **Button:** dynamic, text `View quote`, URL `https://app.useflowbit.com/{{1}}`
- **Quick reply:** `Accept` (after the URL button)
- **Variables:** `name, business, number, amount, validUntil`
- **Sample:** Ravi · Acme Studio · quotation QT/2026-27/0007 · ₹45,000.00 · 31 Oct 2026 · `d/abc.def`

### 3. `fb_credit_note_share`: credit note (Utility)

- **Header:** Document (PDF)
- **Body (`en`):**

  ```
  Hi {{1}}, {{2}} has issued credit note {{3}} for {{4}}. The PDF is attached.
  ```

- **Body (`hi`):**

  ```
  नमस्ते {{1}}, {{2}} ने क्रेडिट नोट {{3}} ({{4}}) जारी किया है। PDF साथ में है।
  ```

- **Button:** dynamic, text `View credit note`, URL `https://app.useflowbit.com/{{1}}`
- **Variables:** `name, business, number, amount`
- **Sample:** Ravi · Acme Studio · CN/2026-27/0003 · ₹1,180.00 · `d/abc.def`

### 4. `fb_receipt_thanks`: receipt and thank-you (Utility)

Used when you send a receipt by hand and by the **Payment thank-you** and **Part payment** automations when their channel is WhatsApp.

- **Header:** Document (PDF)
- **Body (`en`):**

  ```
  Hi {{1}}, thank you. {{2}} has received {{3}} against {{4}}. Your receipt is attached.
  ```

- **Body (`hi`):**

  ```
  नमस्ते {{1}}, धन्यवाद। {{2}} को {{3}} का भुगतान {{4}} के लिए मिल गया है। रसीद साथ में है।
  ```

- **Button:** dynamic, text `View receipt`, URL `https://app.useflowbit.com/{{1}}`
- **Variables:** `name, business, amount, number`
- **Sample:** Ravi · Acme Studio · ₹5,900.00 · INV/2026-27/0042 · `d/abc.def`

### 5. `fb_reminder_before`: payment reminder before the due date (Utility)

- **Header:** none
- **Body (`en`):**

  ```
  Hi {{1}}, a reminder from {{2}}: invoice {{3}} for {{4}} is due on {{5}}.
  ```

- **Body (`hi`):**

  ```
  नमस्ते {{1}}, {{2}} की ओर से याद दिलाना: इनवॉइस {{3}} ({{4}}) की भुगतान तिथि {{5}} है।
  ```

- **Button:** dynamic, text `View and pay`, URL `https://app.useflowbit.com/{{1}}`
- **Quick reply:** `I've paid` (after the URL button)
- **Variables:** `name, business, number, amount, dueDate`
- **Sample:** Ravi · Acme Studio · INV/2026-27/0042 · ₹11,800.00 · 15 Oct 2026 · `d/abc.def`

### 6. `fb_reminder_due`: payment reminder on the due date (Utility)

- **Header:** none
- **Body (`en`):**

  ```
  Hi {{1}}, a reminder from {{2}}: invoice {{3}} for {{4}} is due today.
  ```

- **Body (`hi`):**

  ```
  नमस्ते {{1}}, {{2}} की ओर से याद दिलाना: इनवॉइस {{3}} ({{4}}) का भुगतान आज देय है।
  ```

- **Button:** dynamic, text `View and pay`, URL `https://app.useflowbit.com/{{1}}`
- **Quick reply:** `I've paid` (after the URL button)
- **Variables:** `name, business, number, amount`
- **Sample:** Ravi · Acme Studio · INV/2026-27/0042 · ₹11,800.00 · `d/abc.def`

### 7. `fb_reminder_overdue`: overdue reminder (Utility)

- **Header:** none
- **Body (`en`):**

  ```
  Hi {{1}}, a reminder from {{2}}: invoice {{3}} for {{4}} is {{5}} days overdue. Please pay, or reply if something is holding it up.
  ```

- **Body (`hi`):**

  ```
  नमस्ते {{1}}, {{2}} की ओर से याद दिलाना: इनवॉइस {{3}} ({{4}}) का भुगतान {{5}} दिन से बाकी है। कृपया भुगतान करें, या कोई दिक्कत हो तो यहीं जवाब दें।
  ```

- **Button:** dynamic, text `View and pay`, URL `https://app.useflowbit.com/{{1}}`
- **Quick reply:** `I've paid` (after the URL button)
- **Variables:** `name, business, number, amount, days`
- **Sample:** Ravi · Acme Studio · INV/2026-27/0042 · ₹11,800.00 · 12 · `d/abc.def`

Flowbit picks reminder 5, 6 or 7 by the invoice's due date, for automatic reminders (Folio → Settings → reminders with WhatsApp ticked) and for **Send reminder** in Collections.

### 8. `fb_statement`: statement of account (Utility)

- **Header:** Document (PDF)
- **Body (`en`):**

  ```
  Hi {{1}}, your statement from {{2}} as on {{3}} is attached. {{4}} is due.
  ```

- **Body (`hi`):**

  ```
  नमस्ते {{1}}, {{2}} की ओर से {{3}} तक का आपका खाता विवरण साथ में है। कुल बकाया {{4}} है।
  ```

- **Button:** dynamic, text `View statement`, URL `https://app.useflowbit.com/{{1}}`
- **Variables:** `name, business, date, amount`
- **Sample:** Ravi · Acme Studio · 8 Oct 2026 · ₹23,600.00 · `d/abc.def`

---

## Team (alerts to your own people)

People get these only after they verify their number and turn WhatsApp on (Settings → Profile), and switch WhatsApp on for that alert in My alerts. English is usually enough for team alerts.

### 9. `fb_task_alert`: task and team update (Utility)

- **Body (`en`):** `Hi {{1}}, {{2}}`
- **Body (`hi`):** `नमस्ते {{1}}, {{2}}`
- **Button:** dynamic, text `Open in Flowbit`, URL `https://app.useflowbit.com/{{1}}`
- **Variables:** `name, update`
- **Sample:** Asha · Ravi assigned you "Fix the login page", due tomorrow. · `app/work/tasks/abc`

Meta may ask for more fixed words around a two-variable body. If it is rejected, use: `Hi {{1}}, there is an update for you in Flowbit: {{2}}`.

### 9a. `fb_task_due`: task due, with buttons (Utility)

Used for "assigned to you", "due today" and "overdue" task alerts, so the person can act without opening Flowbit.

- **Body (`en`):** `Hi {{1}}, {{2}}`
- **Body (`hi`):** `नमस्ते {{1}}, {{2}}`
- **Button:** dynamic, text `Open task`, URL `https://app.useflowbit.com/{{1}}`
- **Quick replies:** `Mark done`, then `Snooze 1 day` (after the URL button)
- **Variables:** `name, task`
- **Sample:** Asha · 'Homepage copy' is due today · `app/work/tasks/abc`

### 10. `fb_approval_pending`: approval waiting (Utility)

- **Body (`en`):** `Hi {{1}}, waiting for your approval: {{2}}`
- **Body (`hi`):** `नमस्ते {{1}}, आपकी मंज़ूरी का इंतज़ार है: {{2}}`
- **Button:** dynamic, text `Review`, URL `https://app.useflowbit.com/{{1}}`
- **Quick replies:** `Approve`, then `Reject` (after the URL button). Hindi: `मंज़ूर`, `अस्वीकार`.
- **Variables:** `name, item`
- **Sample:** Asha · Ravi asked for 2 days of leave (14–15 Oct) · `app/hr/approvals`

### 11. `fb_morning_brief`: morning brief, short (Utility)

- **Body (`en`):** `Good morning {{1}}. Today: {{2}}`
- **Body (`hi`):** `सुप्रभात {{1}}। आज: {{2}}`
- **Button:** dynamic, text `Open brief`, URL `https://app.useflowbit.com/{{1}}`
- **Variables:** `name, summary`
- **Sample:** Asha · 3 tasks due, 1 meeting at 11:00, ₹45,000 to collect · `app`

### 12. `fb_meeting_reminder`: meeting reminder (Utility)

- **Body (`en`):** `Hi {{1}}, reminder: {{2}}`
- **Body (`hi`):** `नमस्ते {{1}}, याद दिलाना: {{2}}`
- **Button:** dynamic, text `Open meeting`, URL `https://app.useflowbit.com/{{1}}`
- **Variables:** `name, meeting`
- **Sample:** Asha · Client review with Acme at 4:00 pm today · `app/work/meetings/abc`

### 13. `fb_leave_decision`: leave decision (Utility)

- **Body (`en`):** `Hi {{1}}, {{2}}`
- **Body (`hi`):** `नमस्ते {{1}}, {{2}}`
- **Button:** dynamic, text `Open request`, URL `https://app.useflowbit.com/{{1}}`
- **Variables:** `name, decision`
- **Sample:** Ravi · your leave for 14–15 Oct was approved by Asha. · `app/me/leave`

### 14. `fb_payslip_ready`: payslip ready, no amounts (Utility)

Payslip contents never go by WhatsApp. This template only says that a payslip is ready; Flowbit never puts an amount or the PDF in it.

- **Body (`en`):** `Hi {{1}}, your payslip from {{2}} is ready. Open Flowbit to see it; it is also in your email.`
- **Body (`hi`):** `नमस्ते {{1}}, {{2}} की ओर से आपकी सैलरी स्लिप तैयार है। देखने के लिए Flowbit खोलें; यह आपके ईमेल में भी है।`
- **Button:** dynamic, text `Open payslips`, URL `https://app.useflowbit.com/{{1}}`
- **Variables:** `name, business`
- **Sample:** Ravi · Acme Studio · `app/me/payslips`

---

## Sales

### 15. `fb_contact_followup`: hello / follow-up (Marketing)

Sent by Orbit's **WhatsApp** button on a lead or contact, and from the inbox once the 24-hour window has closed. Meta treats it as marketing (about 7 times the price of utility, and the person must have agreed to hear from you).

- **Body (`en`):**

  ```
  Hello {{1}}, this is {{2}} from {{3}}. Following up on your enquiry: reply here and we will take it from there.
  ```

- **Body (`hi`):**

  ```
  नमस्ते {{1}}, मैं {{2}}, {{3}} से। आपकी पूछताछ के बारे में संपर्क कर रहा/रही हूँ: यहीं जवाब दें, आगे हम संभाल लेंगे।
  ```

- **Button:** none
- **Variables:** `name, sender, business`
- **Sample:** Ravi · Asha · Acme Studio

---

## Employee bot (no template needed)

When an admin turns on the employee bot (Settings → Integrations → WhatsApp), employees who verified their number and opted in can write to your number: `menu`, `check in` (Flowbit asks for a location share), `check out`, `balance`, `leave` (a guided form), `payslip` (a link that asks for a code sent to their work email and never shows an amount), or `1` to `5`. Hindi works too (`चेक इन`, `छुट्टी`, `पेस्लिप`). Replies go inside the 24-hour window the employee's own message opens, so they are free-form and need no template. `exit` stops a step; `stop` and `cancel` still opt the number out.

## STOP and START

- A person who replies **STOP** (or unsubscribe, cancel, opt out, band karo) gets no more WhatsApp messages from **your** number. Flowbit confirms it once and sends their documents and reminders by email instead.
- **START** lets them hear from you on WhatsApp again.
- STOP to your number does not affect other workspaces or Flowbit's own number.
