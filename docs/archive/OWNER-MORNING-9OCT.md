# Owner checklist, morning of 9 Oct 2026

This is one list of everything the overnight build (v2.0 lock, v2.1 steps 2–6, v2.2 steps 7–8 and the step 9 night check) needs from you. Duplicates are merged and the list is in priority order. The details for each item are in `docs/DEPLOY-VERCEL.md` (sections named in brackets) and in `docs/STATUS.md`.

**Try it first.** The night build runs locally at **http://127.0.0.1:4500** on the `flowbit_v2night` database. Ask your assistant to run `node .local-test/demo-sessions.mjs` and set the three cookies it writes to `.local-test/demo-sessions.local.json` (owner, a member, and a Console Admin). No password is needed. Your usual demo on 4400 (`flowbit_v2demo`) was not touched.

## 1. Before deploying (blocking)

1. **Review and merge the night fixes.** The 11 `fix:` commits from step 9 are listed in `docs/V2-NIGHT-CHECK.md`. Two of them change behaviour people will notice:
   - A workspace can no longer reset 2FA for someone who also belongs to another workspace. That case now goes to support.
   - Changing a password, or "sign out everywhere", now also disconnects Claude and ChatGPT.
   - Email to task now accepts mail only from the owner of each `tasks+` address (Settings → Security has "Allow teammates to email my address"), and refuses mail that fails SPF, DKIM or DMARC when the provider reports them.
   - Orbit sequence mail now carries a per-enrolment reply address; a reply stops only that lead's sequence.
2. **Set these environment variables in Vercel** (Production). Generate each secret with `openssl rand -hex 32`.

   | Variable | Needed for | Where it comes from |
   | --- | --- | --- |
   | `APP_ENCRYPTION_KEY` | Required. 2FA secrets, webhook and Slack secrets, Google tokens, GSP logins, workspace Razorpay keys | `openssl rand -hex 32`. Set it once; changing it later breaks every sealed secret. |
   | `CRON_SECRET` | Every `/api/cron/*` job (all of them return 401 without it) | `openssl rand -hex 32` |
   | `ANTHROPIC_API_KEY` | Arc AI and meeting minutes (without it, both fall back to templates) | console.anthropic.com |
   | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google sign-in, Calendar/Meet, Gmail send | [(d)] |
   | `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_SIGNING_SECRET` | Slack app | [(e4) Slack] |
   | `INBOUND_EMAIL_DOMAIN`, `INBOUND_EMAIL_SECRET` | Email to task and Orbit reply detection | [(e4) Email to task] |
   | `SARVAM_API_KEY` | Meeting transcripts | sarvam.ai dashboard |
   | `RECALL_API_KEY`, `RECALL_REGION`, `RECALL_WEBHOOK_SECRET` | Meeting notetaker bot | recall.ai dashboard |
   | `PORTAL_CNAME_TARGET` | Client portal custom domains | e.g. `portal.useflowbit.com` |
   | `VERCEL_DOMAINS_API`, `VERCEL_API_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID` | Optional: lets Verify add portal domains to Vercel | Vercel → Account → Tokens |
   | `GMAIL_REPLY_DETECTION` | Optional. Leave unset until Google's CASA assessment is done (item 13). | |
   | `MEETINGS_PURGE` | Optional. Set to `1` when recording retention should really delete (it is a dry run until then). | |
   | `KLIPY_API_KEY` | Optional. GIF search in Posts (without it the GIF button is hidden; image upload works) | partner.klipy.com → API key |
   | `FEATURE_WHATSAPP` | **Leave unset.** WhatsApp stays hidden until the Interakt and Meta setup is finished. | |

3. **Vercel plan with sub-daily crons.** `messages` and `automations` run every 5 minutes. `posts`, `sequences`, `briefs`, `lead-sources` and `meetings` run every 15 minutes. The Hobby plan runs each job only once a day, so you need **Pro**.
4. **Deploy, then run `npm run setup:prod -- --env-file=.env.setup.local` once.** One run creates every collection and index added by steps 5–8: OAuth and MCP, webhooks, Slack, sequences, bank rows, portal, meetings, tax, e-invoice and domains. Run it again after any later deploy that adds a model. The 9 Oct final polish adds `oauthrefreshtokens` and `inboundreplays` and replaces the custom-domain host index (the script drops the old one).
5. **Smoke check after deploying.**
   - `https://<APP_URL>/.well-known/oauth-authorization-server` and `/.well-known/oauth-protected-resource/mcp` return JSON.
   - `POST /mcp` without a token answers 401 with a `WWW-Authenticate` header.
   - `/manual`, `/security` and `/compare-v1-v2` load.

## 2. Accounts and DNS (this week)

6. **Google Cloud.** Use the same project as sign-in. [(d) and "Google Calendar, Meet and Gmail send"]
   - Add a second redirect URI, `https://<APP_URL>/api/integrations/google/callback`.
   - Enable the Calendar API and the Gmail API.
   - Add the scopes `calendar.events` and `gmail.send`, then submit them for sensitive-scope verification (no CASA needed). Until it is verified, add your team as test users.
7. **Slack.** [(e4) Slack]
   - Create the app from `docs/SLACK-APP-MANIFEST.yml`, with your host in place of `useflowbit.com`.
   - Copy the three secrets into Vercel.
   - Turn on public distribution if other Slack teams will install it.
8. **Inbound mail (email to task and reply detection).** [(e4) Email to task]
   - Pick a subdomain, e.g. `in.useflowbit.com`, and turn on receiving for it in Resend.
   - Add Resend's MX record at your DNS host.
   - Add a Resend webhook for `email.received` pointing at `https://<APP_URL>/api/inbound/email`. Its `whsec_…` secret is `INBOUND_EMAIL_SECRET`.
9. **Recall.ai.** Set the three `RECALL_*` variables. Add the webhook URL `https://<APP_URL>/api/webhooks/recall`, with the bot status and recording/transcript done events. Its signing secret is `RECALL_WEBHOOK_SECRET`. [Step 7 owner setup, item 5]
10. **Sarvam.** Set `SARVAM_API_KEY`. Nothing else is needed: each job gets its own callback token.
11. **R2 bucket CORS for direct recording uploads.** Add this rule (JSON in Step 7 owner setup, item 4):
    - origin `https://<APP_URL>`
    - method `PUT`
    - header `content-type`
12. **Portal domains.**
    - Point `PORTAL_CNAME_TARGET`'s host at Vercel with a CNAME to `cname.vercel-dns.com`.
    - Add it under Vercel → Domains.
    - Customer portal hosts are then added per workspace (by hand, or automatically with the `VERCEL_*` variables). [Step 8 owner setup, item 4]
13. **Gmail reply detection (optional).** It needs the restricted scope `gmail.readonly` and Google's CASA assessment. Keep the OAuth app in testing until that is done, then set `GMAIL_REPLY_DETECTION=true`. Reply detection through the reply inbox works without it.
14. **Interakt and Razorpay.**
    - **Razorpay:** no new setup since the v2 check. Keep the `payment_link.paid` event on Flowbit's own webhook. [(e)]
    - **Interakt and WhatsApp:** stay off. When you are ready: two Interakt Growth accounts, Meta Business verification, the six templates, `INTERAKT_*` and then `FEATURE_WHATSAPP=1`. [(e2), (e3)]
15. **Claude and ChatGPT.** From a paid or trial workspace:
    - Add `https://<APP_URL>/mcp` as a custom connector in Claude and in ChatGPT (developer mode).
    - Run the `update-from-notes` prompt once in each. [(e4)]
    - Directory listings are a separate submission to each.
16. **Database backups.** Move production to Atlas **M10** (automatic snapshots) before `/security` states a backup schedule.

## 3. In the Console and the app (per workspace)

17. **Add-ons** (Console → Accounts → workspace → Add-ons):
    - client portal (already part of Suite)
    - Meetings AI
    - custom domains (about ₹999 a month)
18. **Salary TDS.** Have a CA check the figures before the first live run. Then:
    - In Payroll → Statutory rates, turn on "Compute TDS each month" in a new version.
    - Set the TAN, signatory and proof window in Payroll → Salary tax.
19. **E-invoice.** Per GST entity, in Folio settings → E-invoice:
    - enter the GSP's sandbox address and login;
    - get a sandbox IRN, a cancel and an e-way bill to work end to end;
    - only then switch to Production.

    Since step 9, changing the GSP address or environment means entering the client secret and password again.
20. **Require 2FA for admins** (Settings → Security). Turn on your own 2FA first. Once it is on, owners and admins without 2FA cannot use AI apps, Slack, email to task, the workspace export or files until they set it up.
21. **Post types migration.** Run `scripts/migrate-post-types.ts` (dry run first, then `--apply`) once on production.

## 4. Reviews by people

22. **CA:**
    - the TDS worksheet (both regimes, rebate and marginal relief, HRA, 80C/80D) and the Form 138 (24Q) CSV;
    - the SAC code for subscriptions (998314 or 997331) and `FLOWBIT_WALLET_SAC`;
    - the Tally XML export, against a test company;
    - the e-invoice payload, on the GSP sandbox.
23. **Lawyer:**
    - the legal pages (`/legal/privacy`, `/legal/terms`, `/legal/refunds`, which are still drafts);
    - the meeting recording consent notice (Recall announces itself and emails attendees);
    - the location-at-check-in notice;
    - the client portal's data sharing;
    - the `/security` page's claims.
24. **Hindi speaker:** review `src/lib/i18n/hi.ts`, which is marked `review`.
25. **Your own decisions still open:**
    - the 10 items under "Decisions waiting on the owner" in `docs/STATUS.md`;
    - the screenshot for review row 33 (red "test" text);
    - retaking 7 manual screenshots: the ones that showed WhatsApp controls were removed on 9 Oct and replaced by a "being retaken" note (Profile, My alerts, Notifications, Billing, Integrations, a quote and a receipt).
    - custom roles: cancelling an e-invoice IRN is now its own permission (`einvoice.cancel`). Owner, admin and finance have it; add it to any custom role that should cancel IRNs.
## 5. Housekeeping on this Mac

26. When you are done with the night demo:
    - stop the server on port 4500;
    - run `node .local-test/demo-sessions.mjs --cleanup`;
    - delete `.next-night`;
    - drop the `flowbit_v2night` database if you no longer need it.

    The servers on 4100, 4300 and 4400 were left running.
