# Owner to-do (current)

The one live list of what the owner still has to do. It replaces `archive/OWNER-MORNING-9OCT.md` (9 Oct). Updated 11 Oct 2026. Tick items here as they are done; when a QA report or audit raises a new owner item, add it here.

Nothing has been deployed yet, so every account, key and DNS item below is still open. How to do each one is in [`DEPLOY-VERCEL.md`](DEPLOY-VERCEL.md); the section is given in brackets.

## A. Accounts and keys

Needed for a first launch:
- [ ] **Vercel Pro** (not Hobby: the sub-daily crons fail the deploy on Hobby). Import the repo, region `bom1`. [(f)]
- [ ] Generate `APP_SECRET`, `CRON_SECRET` and `APP_ENCRYPTION_KEY` once and keep them in the password manager. `APP_ENCRYPTION_KEY` is now required and must never change. [(f)3]
- [ ] **MongoDB Atlas**, Mumbai, user `flowbit-app`, `MONGODB_URI`. Move to **M10** before real payroll data; turn on Cloud Backup, test one restore, add alerts. [(a), (g)]
- [ ] **Cloudflare R2**: private bucket, S3 keys, the CORS rule for recordings. No delete lifecycle rules. [(b), (e5)]
- [ ] **Resend**: verify the sending subdomain, `RESEND_API_KEY`, `MAIL_FROM`, `SUPPORT_EMAIL`, and the **webhook** with `RESEND_WEBHOOK_SECRET`. [(c)]
- [ ] Run the production run order: deploy, `setup:prod`, sign in, smoke checks (`/api/health`, `.well-known` JSON, `/mcp` answers 401, `/manual` loads). [(f)7, (f)8, (e4)]
- [ ] Monitoring: UptimeRobot or Better Stack on `/api/health`; Vercel deploy-failure alerts. [(g)]

Needed to charge customers:
- [ ] **Razorpay**: live KYC, Subscriptions enabled, keys, the webhook (all subscription events plus `order.paid` and `payment_link.paid`, in test and live mode). Ask for Payment Links, UPI Autopay and e-mandate, and the Autopay fee in writing. [(e)]
- [ ] Flowbit's supplier details: `FLOWBIT_LEGAL_NAME`, `FLOWBIT_GSTIN`, `FLOWBIT_PAN`, `FLOWBIT_ADDRESS`, `FLOWBIT_STATE`, `FLOWBIT_SAC`. Until the GSTIN is set, no GST is charged and bills say "not a tax invoice". Bank and UPI details on invoices and the website. [(e)4, (e)6]

Optional, any time:
- [ ] **Google**: OAuth client, both redirect URIs, Calendar and Gmail APIs, `calendar.events` and `gmail.send` scopes, sensitive-scope verification (privacy URL, demo video, reasons). Team as test users until verified. [(d)]
- [ ] **Slack** app from `SLACK-APP-MANIFEST.yml` (your host in place of `useflowbit.com`), three secrets, public distribution if needed. [(e4)]
- [ ] **Email to task**: Resend receiving on the inbound subdomain, `email.received` webhook, `INBOUND_EMAIL_DOMAIN` and `INBOUND_EMAIL_SECRET`. [(e4)]
- [ ] **Anthropic** `ANTHROPIC_API_KEY` (Arc and AI minutes), **Sarvam** `SARVAM_API_KEY`, **Recall.ai** keys and webhook, **Klipy** `KLIPY_API_KEY`. [(f)3, (e5)]
- [ ] **GSP sandbox** per GST entity (only above ₹5 crore turnover): sandbox IRN, cancel and e-way bill before Production. [(e6)]
- [ ] **Vercel Domains API** token (only if selling portal custom domains). [(e6)]
- [ ] Claude and ChatGPT: add `/mcp` as a custom connector in each; submit to each public directory separately. [(e4)]

Dormant (keep `FEATURE_WHATSAPP` unset until all of these are done):
- [ ] Meta Business verification of the LLP; two new numbers on two Interakt Growth accounts; `INTERAKT_API_KEY`, `INTERAKT_OTP_API_KEY`, `INTERAKT_WEBHOOK_SECRET`; webhook in each account. [(e2)]
- [ ] Create the 6 templates (`WHATSAPP-TEMPLATES.md`), wait for Meta approval, confirm the names in Console → Settings, send a test bill. Customer pack: `WHATSAPP-TEMPLATES-CUSTOMER.md`.
- [ ] Decide the WhatsApp go-live date (B16).

## B. DNS

- [ ] `app.<domain>` CNAME to Vercel; set `APP_URL`; update the Google redirect URI and the Razorpay and Resend webhook URLs. [(f)5]
- [ ] `console.useflowbit.com` CNAME `cname.vercel-dns.com`, added in Vercel. [(f)5]
- [ ] Sending subdomain `mail.<domain>`: Resend's MX, SPF and DKIM records, plus DMARC `_dmarc.mail` TXT `v=DMARC1; p=none; rua=…`. [(c)]
- [ ] Inbound subdomain (e.g. `in.useflowbit.com`) MX to Resend inbound. [(e4)]
- [ ] `PORTAL_CNAME_TARGET` host (e.g. `portal.useflowbit.com`) CNAME `cname.vercel-dns.com`, added in Vercel (custom domains add-on only). [(e6)]

## C. CA and lawyer

**CA** (questions in [`qa/CA-QUESTIONS.md`](qa/CA-QUESTIONS.md), all open):
- [ ] Q1–Q16: SAC for subscriptions vs credits (`FLOWBIT_WALLET_SAC`); tax invoice vs receipt voucher at recharge; GST on bonus credits; expiry of unused credit; refunds and credit-note deadline; ITC on Interakt invoices; B2C place of supply; closed-system PPI wording; auto-recharge; TDS 2% vs 10% and the 98% settlement rule; time of supply for due bills; one `FB/` series or two; "Flowbit" as a trade name; IRN below ₹5 crore; moving to a Pvt Ltd. Also the tax wording in the message-credits terms.
- [ ] Subscription SAC 998314 or 997331.
- [ ] D8 was decided: no GST on Flowbit's bills until `FLOWBIT_GSTIN` is set ("Invoice (not a tax invoice)"). Confirm with the CA (CA question 16).
- [ ] Before the first live auto-TDS run: the TDS worksheet (both regimes, rebate, marginal relief, HRA, 80C/80D) and the Form 138 CSV.
- [ ] Tally XML export against a test company; the e-invoice payload on the GSP sandbox.
- [ ] Confirm the seeded October statutory rates (a proposal, not confirmed).

**Lawyer:**
- [ ] Legal pages are drafts: `/legal/privacy`, `/legal/terms`, `/legal/refunds`, `/legal/dpa`.
- [ ] `BREACH-RUNBOOK.md`: timelines, CERT-In, the DPDP start date.
- [ ] Erasure rules (what is kept by law), tied to D4.
- [ ] Notices: meeting recording consent (Recall), location at check-in, client portal data sharing, the claims on `/security`.
- [ ] Cookies: whether `fb_utm` needs consent.
- [ ] Refund policy wording: confirm or replace.

## D. Owner decisions still open

Decided on 11 Oct and built: yearly = 10 × monthly with 50% off the first year (D1); "Start free: 5 people or fewer get 6 months free, bigger teams get a 15-day trial" (D2); Free gets no paid add-ons (D9); the separate 14-day product trial is dropped (D2); owner-deleted workspaces are purged after 30 days and deletion and log pruning run for real in production, with `false` as kill switch (D4); one trial per business (D5); no GST until the GSTIN (D8). Campaign decks, PDFs and the `gs-pricing.jpg` screenshot still show the old "2 months free" wording (R2 17.4).

- [ ] **D3** Console Admin staff see salary, bank and PAN unmasked. Keep, or mask for everyone?
- [ ] **D6** HR executive and salaries: check the final permission list after the 11 Oct change, and make the docs match.
- [ ] **D7** **Folio's 3-user limit** (`FOLIO_INCLUDED_USERS = 3`) cannot be raised: a 4th user with any Folio permission is refused and pushed to Suite. Count only invoice writers, sell a per-user add-on, or state the rule plainly?
- [ ] **R1 4.5 Manager-away approvals.** Approvals wait while the approver is away (the email is held until they are back). Who decides meanwhile: a delegate, or HR at the manager stage?
- [ ] **R1 4.4** Escalation covers leave only. Should corrections, comp-offs, timesheets and claims escalate too?
- [ ] **HR at the manager stage:** hr_admin can sign the manager stage (`approvals.escalated`); Muster spec §1.3 says only the real manager signs. Choose one.
- [ ] **R1 7.8** Automated sequence mails unlock "Contacted" on a lead. Keep or change?
- [ ] **R3 L-25c** Credit-note e-invoice (CRN): build now or later?
- [ ] **B22** Require sign-in for every emailed approval link?
- [ ] **B28** Freeze the public numbers in the Console, or render the site from Console settings?
- [ ] Past-due grace: 7 days full access, then 30 read-only; `subscription.halted` makes the workspace read-only at once. Confirm.
- [ ] Duplicate breadcrumbs on about 65 pages: remove everywhere, or keep on deep pages only?
- [ ] Marketing: say that Arc uses Claude?
- [ ] Brand colours on Suite and trial only, or every paid plan?
- [ ] Finance-style custom roles: give them `expenses.read` / `expenses.write`?
- [ ] hr_exec can no longer fix work-email typos. Confirm.
- [ ] The wording at Free's 2-firm limit.
- [ ] Campaign: the BRIEF's never-claim list (B31), the ₹999 + ₹199 pricing from January 2027 and the founding offer (B37), the launch dates (B38).
- [ ] R2 11.1 global grey-text colour sweep; R2 16.4 paginate the FAQ.

## E. Content and checks

- [ ] Look in a browser: the punch dial morph and break animations (30 px phone size, reduced motion) and the visual polish listed in `qa/NIGHT-11OCT-VERIFY.md` §6.
- [ ] Hindi review of `src/lib/i18n/hi.ts` and `src/modules/automations/recipes-hi.ts` (marked draft).
- [ ] Manual: retake 7 screenshots (Profile, My alerts, Notifications, Billing, Integrations, a quote, a receipt).
- [ ] Gmail reply detection: keep `gmail.readonly` in testing until Google's CASA assessment; then `GMAIL_REPLY_DETECTION=true`.
- [ ] Per workspace: add-ons (portal, Meetings AI, custom domains), auto TDS with TAN, signatory and proof window (after the CA), your own 2FA then "require for admins", `einvoice.cancel` on custom roles that cancel IRNs.
- [ ] `/security`: state the backup schedule after the move to M10.
- [ ] Console → Reports: check the numbers with real data.

## F. This Mac (housekeeping)

- [ ] When the 4500 demo is no longer needed: stop it, delete `.next-night9b`, run `demo-sessions.mjs --cleanup`, drop `flowbit_v2night`.
- [ ] Drop the unused `flowbit_v2demo` database (the 8 Oct demo; nothing serves it).
- [ ] Old zips in `~/Downloads` you can delete (keep only the latest handover, `flowbit-v2-developer-handover-20261011-0149.zip`, until a new one is made):
  - `flowbit-deploy.zip` (3 Oct), `flowbit-main.zip` (8 Oct), `flowbit-v2-build-20261010.zip` (10 Oct);
  - reference-app zips from before Flowbit: `vistaarhrm-main-20260928.zip`, `vistaarhrm-main-20260929.zip`, `vistaarhrm-main-20260929-roles.zip`, `vistaarhrm-main-20261001-flows.zip`, `vistaarhrm-main (1).zip`, `vistaar-muster-handover.zip`, `vistaarpeopleoshandover.zip`;
  - the folder `flowbit-pre-tutorial-backup-20261006`.
- [ ] The next handover zip should include the repo's `HANDOVER.md` and `docs/START-HERE.md` (the 0149 zip's HANDOVER still points to `OWNER-MORNING-9OCT`).
