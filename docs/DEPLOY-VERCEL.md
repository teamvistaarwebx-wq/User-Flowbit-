# Deploy Flowbit on Vercel

This guide takes Flowbit from this laptop to a live address such as `https://app.yourdomain.in`. It is written for the owner, not a developer: every step says where to click and what to paste. Plan on two to three hours the first time, most of it spent waiting for DNS and account checks.

> **Vercel Pro is required.** `vercel.json` schedules 21 cron entries, and 7 of them run every 5 or 15 minutes. On the Hobby plan Vercel refuses any cron that runs more than once a day, so **the whole deployment fails** on Hobby. Hobby is also for non-commercial use only. Buy Pro (about US$20 a month per seat) before step (f).

Order of work:

1. Create the accounts and keys in (a) to (e6). Only (a), (b) and (c) are needed for a first launch; the rest are optional.
2. Put the code on Vercel and set the environment variables: (f) steps 1 to 3.
3. Add the domains: (f) step 5.
4. Prepare the database with the **production run order** in (f) step 7.
5. Sign in and check: (f) step 8.

Prices below are approximate (October 2026) and in US dollars, the currency these services bill in; check each pricing page before you commit.

Keep a private note open while you work (a password manager is best). You will collect about fifteen values and paste them into Vercel at step (f). Never paste them into chat, email or a GitHub file.

## Services at a glance

"Required" means a launch does not work without it. "Optional" can be added any time. "Hidden" is built but switched off at launch.

| Service | What it does | Env vars | Inbound URL (webhook or callback) | Status | Setup |
|---|---|---|---|---|---|
| Vercel **Pro** | Hosting, functions, cron | `CRON_SECRET`; Vercel's own system vars | `/api/cron/*` (Vercel calls them) | **Required** | (f) |
| MongoDB Atlas | All data (replica set) | `MONGODB_URI`, `MONGODB_DB` | none | **Required** (M10 for backups) | (a) |
| Cloudflare R2 (or AWS S3) | Uploaded and generated files | `STORAGE_DRIVER=s3`, `S3_*` | Bucket CORS: `PUT` from `APP_URL` (recordings) | **Required** on Vercel | (b) |
| Resend (sending) | Every email | `RESEND_API_KEY`, `MAIL_FROM`, `RESEND_WEBHOOK_SECRET` | `/api/webhooks/resend` | **Required** for real use | (c) |
| Resend (inbound) | Email to task, sequence replies | `INBOUND_EMAIL_DOMAIN`, `INBOUND_EMAIL_SECRET` | `/api/inbound/email` | Optional | (e4) |
| Resend (domains API) | Workspaces' own sending domains | `RESEND_API_KEY` | none | Optional add-on | (e6) |
| Google OAuth | Sign in with Google | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | `/api/auth/google/callback` | Optional | (d) |
| Google Calendar and Gmail | Meet links, Gmail send, reply detection | the Google vars + `APP_ENCRYPTION_KEY`; `GMAIL_REPLY_DETECTION` | `/api/integrations/google/callback` | Optional; `gmail.readonly` **hidden** until CASA | (d) |
| Razorpay (Flowbit's own) | Subscriptions, due bills, wallet recharges | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `FLOWBIT_*` | `/api/subscription/razorpay/webhook` | Required to charge | (e) |
| Razorpay (each workspace's own) | Payment links on Folio invoices | stored per workspace, sealed with `APP_ENCRYPTION_KEY` | `/api/webhooks/razorpay/<key>` | Optional per workspace | (f)4 notes |
| Interakt (Flowbit's numbers) | WhatsApp bills, reminders, OTP | `INTERAKT_API_KEY`, `INTERAKT_OTP_API_KEY`, `INTERAKT_WEBHOOK_SECRET` | `/api/webhooks/interakt?token=…` | **Hidden** (`FEATURE_WHATSAPP` off) | (e2) |
| Interakt (a workspace's own number) | Workspace WhatsApp, inbox, bot | per workspace, sealed | `/api/webhooks/whatsapp/<key>?token=…` | **Hidden** | (e3) |
| Anthropic | Arc drafts with Claude | `ANTHROPIC_API_KEY` | none | Optional | (f)3 |
| Sarvam | Meeting transcription | `SARVAM_API_KEY` | `/api/webhooks/sarvam` (per-job token) | Optional (Meetings AI add-on) | (e5) |
| Recall.ai | Meeting notetaker bot | `RECALL_API_KEY`, `RECALL_REGION`, `RECALL_WEBHOOK_SECRET` | `/api/webhooks/recall` | Optional | (e5) |
| Slack | `/flowbit` command, shortcuts | `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_SIGNING_SECRET` | `/api/slack/commands`, `/api/slack/interactions`, `/api/integrations/slack/callback` | Optional | (e4) |
| Klipy | GIF search in Posts | `KLIPY_API_KEY` | none (proxy `/api/work/gifs`) | Optional | (f)3 |
| IndiaMART | Lead pull (beta) | `INDIAMART_API_URL` (leave unset); per-workspace key | none (`lead-sources` cron pulls) | Optional | (f)3 |
| GSP (e-invoice) | IRN, e-way bill | per GST entity, sealed | none | Optional, sandbox first | (e6) |
| Vercel Domains API | Certificates for portal custom domains | `VERCEL_DOMAINS_API`, `VERCEL_API_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID` | none | Optional | (e6) |
| Lead capture | Website form, lead webhook | none (per-workspace key) | `/api/public/leads/<key>`, `/api/webhooks/leads/<key>`, `/embed.js` | Built in | (f)4 notes |
| Claude and ChatGPT (MCP) | AI apps read and act in Flowbit | none | `/mcp`, `/oauth/*`, `/.well-known/*` | Built in | (e4) |
| Outbound webhooks | Zapier, Make and others | none (`APP_ENCRYPTION_KEY`) | none (Flowbit posts out) | Built in | (e4) |

Every external service is tested in code with mocks only. Check each one with real keys before you rely on it.

> **Two secrets you must never rotate casually.**
> - `APP_SECRET` signs sessions, OTP hashes, approval links, every email-to-task address and the self-host Folio cron token. Changing it signs everyone out and changes every `tasks+…` address.
> - `APP_ENCRYPTION_KEY` seals Google and Slack tokens, webhook secrets, GSP logins, workspace Razorpay and Interakt keys, and Console staff TOTP secrets. Changing it makes all of them unreadable: workspaces must enter their keys again and every Console staff member needs "Reset sign-in".

---

## (a) MongoDB Atlas

1. Go to **cloud.mongodb.com** and sign up (Google sign-in is fine).
2. **Create a project.** Top left, the project menu → **New Project** → name it `Flowbit` → **Next** → **Create Project**.
3. **Create a cluster.** Click **Create** (or **Build a Database**).
   - To start: choose **M0 (Free)**. Provider **AWS**, region **Mumbai (ap-south-1)**. Name it `flowbit`. Click **Create Deployment**.
   - For production with paying customers: choose **M10** (dedicated, about US$57–60 a month in Mumbai). M10 gives you automatic backups (snapshots), more storage and steadier speed. M0 has **no backups**, 512 MB of storage, and is meant for trying things out. You can upgrade later from the cluster's **⋯ → Edit Configuration** without losing data.
4. **Create the database user.** Atlas shows a "Connect to cluster" window; if it doesn't, open **Security → Database Access → Add New Database User**.
   - Authentication: **Password**. Username: `flowbit-app`. Click **Autogenerate Secure Password** and copy it into your note. (Autogenerated passwords have only letters and digits, which matters because some symbols break the connection string.)
   - Database User Privileges: **Specific Privileges → Add Specific Privilege → readWrite**, database `flowbit`. (Or the built-in role **Read and write to any database** if you prefer.)
   - **Add User**.
5. **Network access.** **Security → Network Access → Add IP Address → Allow Access from Anywhere** (`0.0.0.0/0`) → **Confirm**.
   - Why: Vercel's servers do not have fixed IP addresses, so Atlas cannot be told "only Vercel". The trade-off is that anyone on the internet can *try* to connect, so the strong autogenerated password and Atlas's TLS encryption are what keep the data safe. Never reuse that password, and rotate it (Database Access → Edit → Edit Password, then update `MONGODB_URI` in Vercel) if it ever leaks. Fixed IPs exist only on Vercel's Enterprise plan (Secure Compute).
6. **Copy the connection string.** **Database → Clusters → Connect → Drivers**. Copy the string that looks like:
   ```
   mongodb+srv://flowbit-app:<db_password>@flowbit.ab1cd.mongodb.net/?retryWrites=true&w=majority&appName=flowbit
   ```
   Replace `<db_password>` with the password from step 4. Make sure it contains `?retryWrites=true&w=majority`; add it if missing. This whole line is **`MONGODB_URI`**. The database name is set separately: **`MONGODB_DB=flowbit`**.

Atlas is always a replica set, so payroll, invoices and receipts (which use transactions) work exactly as they do on this laptop.

## (b) Cloudflare R2 (file storage)

R2 stores files privately and charges nothing for downloads. The first 10 GB are free each month.

1. Go to **dash.cloudflare.com**, sign up, and open **R2 Object Storage** in the left menu. Cloudflare asks for a payment method once to turn R2 on, even on the free allowance.
2. **Create bucket** → name `flowbit-files` → Location: **Automatic** (or the hint **Asia-Pacific**) → Default storage class **Standard** → **Create bucket**.
3. Leave **Public access** off (bucket **Settings → Public access: Disabled**, and no custom domain). Flowbit never needs a public bucket.
4. Create the key: back on the R2 overview page, **Manage API tokens** (under "Account details" / "API") → **Create API token** (choose the **Account API token** type).
   - Name: `flowbit-production`.
   - Permissions: **Object Read & Write**.
   - Specify bucket(s): **Apply to specific buckets only → flowbit-files**.
   - TTL: **Forever**. Client IP filtering: leave empty (Vercel IPs change).
   - **Create API Token**. The next screen shows the values only once. Copy:
     - **Access Key ID** → `S3_ACCESS_KEY_ID`
     - **Secret Access Key** → `S3_SECRET_ACCESS_KEY`
     - **S3 endpoint** for your account, `https://<account-id>.r2.cloudflarestorage.com` → `S3_ENDPOINT` (only the part up to `.com`, without the bucket name)
5. The remaining values: `STORAGE_DRIVER=s3`, `S3_REGION=auto`, `S3_BUCKET=flowbit-files`. Leave `S3_FORCE_PATH_STYLE` empty.

**AWS S3 instead of R2** (also fine): in the AWS console create a bucket in **Asia Pacific (Mumbai) ap-south-1** with **Block all public access** on. In IAM create a user `flowbit-app` with an inline policy allowing `s3:GetObject`, `s3:PutObject` and `s3:DeleteObject` on `arn:aws:s3:::<bucket>/*` and `s3:ListBucket` on `arn:aws:s3:::<bucket>`, then create an access key for it. Set `STORAGE_DRIVER=s3`, `S3_REGION=ap-south-1`, `S3_BUCKET=<bucket>`, the two keys, and leave `S3_ENDPOINT` empty. AWS charges for downloads (about US$0.11 per GB out of Mumbai), so R2 is usually cheaper.

## (c) Resend (email)

1. Go to **resend.com** and sign up.
2. **Domains → Add Domain.** Use a sub-domain you own, for example `mail.yourdomain.in` (a sub-domain keeps your main domain's email reputation separate). Region: the closest offered (for example Tokyo or Singapore).
3. Resend lists DNS records (an MX and a TXT for SPF on `send.mail…`, a TXT for DKIM). Add each one exactly at your domain's DNS provider (GoDaddy, Hostinger, Cloudflare DNS…). Also add a DMARC record if you don't have one: name `_dmarc.mail`, type TXT, value `v=DMARC1; p=none; rua=mailto:you@yourdomain.in`.
4. Back in Resend click **Verify DNS Records**. It can take from minutes to a few hours.
5. **API Keys → Create API Key** → name `flowbit-production`, permission **Sending access**, domain `mail.yourdomain.in` → **Add**. Copy it: **`RESEND_API_KEY`**.
6. **`MAIL_FROM`** = `Flowbit <no-reply@mail.yourdomain.in>` (any name before the `@`, the domain must be the verified one). The built-in default `no-reply@useflowbit.com` only works if you verified that exact domain; otherwise Resend refuses every message, and the build log warns you. Set **`SUPPORT_EMAIL`** to the inbox customers should write to.
7. **Webhook (delivery ticks, bounces, spam complaints).** **Webhooks → Add Webhook** → URL `https://app.yourdomain.in/api/webhooks/resend` → events `email.sent`, `email.delivered`, `email.opened`, `email.bounced`, `email.complained` → **Add**. Open it and copy the **Signing secret** (`whsec_…`): that is **`RESEND_WEBHOOK_SECRET`**. Without it Flowbit refuses these events, so the Messages log never shows "delivered" and bounced addresses keep getting mail.

Without Resend nothing is emailed: messages only appear in Settings → Messages log.

## (d) Google sign-in (optional)

1. Go to **console.cloud.google.com** → project menu → **New Project** → `Flowbit` → **Create**, then select it.
2. **APIs & Services → OAuth consent screen** (now called **Google Auth Platform**) → **Get started**. App name `Flowbit`, user support email, Audience **External**, contact email → **Create**.
3. **Branding**: add your logo if you like, and under **Authorised domains** add `yourdomain.in`. **Audience → Publish app** (status "In production"). Sign-in asks only for name, email and profile picture, so Google does not need to review the app for it (Calendar and Gmail, below, do need a short review).
4. **Clients → Create client** → Application type **Web application** → name `Flowbit production`.
   - Authorised JavaScript origins: `https://app.yourdomain.in`
   - Authorised redirect URIs: `https://app.yourdomain.in/api/auth/google/callback` (exactly; no trailing slash)
   - Add a second authorised redirect URI for Calendar and Gmail connections (v2.1): `https://app.yourdomain.in/api/integrations/google/callback`.
   - **Create**. Copy **Client ID** → `GOOGLE_CLIENT_ID` and **Client secret** → `GOOGLE_CLIENT_SECRET`.

#### Google Calendar, Meet and Gmail send (v2.1, optional)

Each person connects their own Google Calendar and, if they like, Gmail in **Settings → Google**. Same client and env vars as sign-in, plus `APP_ENCRYPTION_KEY` (the refresh tokens are sealed with it). No new env var.

1. **APIs & Services → Library**: enable **Google Calendar API** and **Gmail API** in the same project.
2. **Google Auth Platform → Data access → Add or remove scopes**: add `https://www.googleapis.com/auth/calendar.events` and `https://www.googleapis.com/auth/gmail.send`. Flowbit asks for one of them at a time, never more.
3. Both are **sensitive** scopes (not restricted), so Google wants a short **verification** (privacy policy URL, a demo video of the consent and the feature, the reason for each scope), but no CASA security audit. Until it is verified, people see an "unverified app" screen and at most 100 users can connect; add your own team as **Test users** meanwhile.
4. Check: Settings → Integrations shows both redirect URIs; Settings → Google shows the Connect buttons once `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `APP_ENCRYPTION_KEY` are set.

Google sign-in works only on the address in `APP_URL`: Flowbit always sends Google the `APP_URL` callback, so adding a `*.vercel.app` redirect URI here does nothing. Once your domain is live, Flowbit sends page visits on any `*.vercel.app` address to `APP_URL` on its own (see (f) step 5). If you test before the domain is ready, use the `vercel.app` address as `APP_URL` and in Google, then switch both.

## (e) Razorpay (subscription payments, optional until you charge)

1. **dashboard.razorpay.com** → complete KYC so live mode is activated. Ask Razorpay support to enable **Subscriptions** on the account if it is not on (Flowbit creates plans and subscriptions through it).
2. **Account & Settings → API Keys → Generate Key** (switch the top toggle to **Live** for real money; use **Test** first if you want to try). Copy **Key Id** → `RAZORPAY_KEY_ID` (`rzp_live_…`) and **Key Secret** → `RAZORPAY_KEY_SECRET` (shown only once).
3. **Account & Settings → Webhooks → Add New Webhook**:
   - Webhook URL: `https://app.yourdomain.in/api/subscription/razorpay/webhook`
   - Secret: make one with `openssl rand -hex 32` in Terminal (or any long random string) → that is `RAZORPAY_WEBHOOK_SECRET`
   - Alert email: yours
   - Active events: `subscription.authenticated`, `subscription.activated`, `subscription.charged`, `subscription.pending`, `subscription.halted`, `subscription.cancelled`, `subscription.completed`, `payment.failed`, `order.paid`, `payment_link.paid` (due bills from the Console; added 8 Oct)
   - **Create Webhook**. Test and live mode have separate webhooks; add one in each mode you use.
4. Fill in Flowbit's own supplier details for its GST invoices: `FLOWBIT_LEGAL_NAME`, `FLOWBIT_GSTIN`, `FLOWBIT_PAN`, `FLOWBIT_ADDRESS`, `FLOWBIT_STATE` (2 letters, e.g. `MP`), `FLOWBIT_SAC` (confirm 998314 or 997331 with your CA). Until `FLOWBIT_GSTIN` is set, Flowbit charges no GST and its bills are titled "Invoice (not a tax invoice)".

Without Razorpay keys a deployed Flowbit has no checkout; the "Simulate payment" button exists only on a developer's laptop and can never appear on Vercel.

5. **Console billing (8 Oct).** The same keys and webhook serve the bills staff create in Console → Billing:
   - payment links on due bills;
   - UPI Autopay / e-mandate (a Razorpay subscription with an approval link);
   - refunds to the original payment.

   Ask Razorpay to enable **Payment Links**, **UPI Autopay** and **e-mandate**, and get the Autopay fee in writing.
6. **Bank transfers.** Give customers your bank account and UPI ID on your invoices and website. They report a transfer with its UTR in Settings → Billing, and Accounts verifies it in Console → Billing → Verify payments. The person who records a payment cannot verify it.

## (e2) WhatsApp A: Flowbit's own numbers through Interakt (hidden; skip at launch)

> WhatsApp is built but **hidden** behind `FEATURE_WHATSAPP` (off). Leave the `INTERAKT_*` variables unset at launch. Do this section only when you decide to switch WhatsApp on.

Bills, reminders and receipts also go on WhatsApp to the owners and admins who verified their number and turned WhatsApp on in Profile. Without these variables, everything goes by email only. The full owner checklist and the template text are in **docs/WHATSAPP-TEMPLATES.md**. In short:

1. **Two Interakt Growth accounts**, each on a new number that is not on the WhatsApp app:
   - one for messages: its API key (Developer Settings) → `INTERAKT_API_KEY`;
   - one for OTP: its API key → `INTERAKT_OTP_API_KEY`.

   Both need Meta Business verification of the LLP.
2. **Templates:** create and approve the six templates in docs/WHATSAPP-TEMPLATES.md, then check their names in Console → Settings.
3. **Webhook:**
   - `INTERAKT_WEBHOOK_SECRET` = `openssl rand -hex 32`;
   - in **each** Interakt account, Developer Settings → Webhooks → URL `https://app.yourdomain.in/api/webhooks/interakt?token=<that secret>`;
   - events: sent, delivered, read, failed, message received.

   Interakt's docs describe no signature we could confirm, so the secret in the URL authenticates the calls; an `interakt-signature` HMAC header is also accepted.
4. Inbound replies land in Console → Messages. STOP suppresses the number at once. Unassigned chats get one auto-reply a day pointing to email.

## (e3) WhatsApp B: each workspace's own number, and the wallet (hidden; skip at launch)

Nothing to set on the server beyond `APP_ENCRYPTION_KEY` (it seals each workspace's Interakt key and webhook secret) and, for wallet recharges, Flowbit's own `RAZORPAY_*` keys from (e).

- **Today ("bring your own Interakt account"):** a workspace on Interakt's Growth plan (Starter has no API) pastes its API key and a webhook secret in **Settings → Integrations → WhatsApp**, adds the shown URL `https://<APP_URL>/api/webhooks/whatsapp/<random key>?token=<its secret>` in its Interakt webhook settings, creates the template pack from **docs/WHATSAPP-TEMPLATES-CUSTOMER.md**, maps the names, and sends a test. Interakt bills the workspace for Meta's messages; Flowbit charges the platform fee set in Console → Settings (₹0 by default).
- **Later ("Flowbit-managed"):** needs the Interakt White Label / partner deal (one Flowbit wallet funding many numbers). The code path exists (`modules/whatsapp/provider.ts`); it shows "Coming soon" until `MANAGED_MODE_AVAILABLE` is switched on with the real adapter.
- **Wallet recharges** go through Flowbit's Razorpay (a payment link) and the existing Flowbit webhook (`payment_link.paid`); each one gets a GST tax invoice in the FB series with `FLOWBIT_WALLET_SAC` (empty = `FLOWBIT_SAC`; the CA is to confirm). Without Razorpay keys, recharge is off in production (simulated locally).
- **Expiry:** `/api/cron/billing` also expires paid credit 12 months after each recharge.

## (e4) AI apps, Slack, email to task and webhooks (optional)

**Claude and ChatGPT (MCP).** Nothing to set: Flowbit is its own OAuth server. After deploying, check `https://<APP_URL>/.well-known/oauth-authorization-server` and `https://<APP_URL>/.well-known/oauth-protected-resource/mcp` return JSON, and that `POST https://<APP_URL>/mcp` without a token answers 401 with a `WWW-Authenticate` header. Then, as a member of a paid or trial workspace:

- **Claude** (claude.ai or the desktop app): Settings → Connectors → Add custom connector → name `Flowbit`, URL `https://<APP_URL>/mcp` → Add → Connect. Flowbit's sign-in and consent screen opens: pick the workspace, untick what Claude should not do, Allow. Team/Enterprise owners add it once under Organization settings → Connectors.
- **ChatGPT:** Settings → Apps & Connectors → Advanced settings → turn on **Developer mode** → Create. Name `Flowbit`, MCP server URL `https://<APP_URL>/mcp`, Authentication **OAuth** (dynamic registration, no client id needed) → Create, then connect and approve the same way. Workspace (Business/Enterprise) admins publish it for their members.
- Both register themselves through `/oauth/register`. Connections show in **Settings → Integrations → Connected apps**, where an admin can also switch AI apps off for the workspace.
- Free workspaces cannot connect (paid plans and the trial can). Listing Flowbit in Claude's and ChatGPT's public directories is a separate submission to each.

**Slack.**
1. https://api.slack.com/apps → Create New App → From an app manifest → paste `docs/SLACK-APP-MANIFEST.yml` with `useflowbit.com` replaced by your APP_URL host.
2. Basic Information: copy Client ID, Client Secret and Signing Secret into `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_SIGNING_SECRET`. `APP_ENCRYPTION_KEY` must be set (it seals each workspace's bot token).
3. Manage Distribution → Activate public distribution if workspaces other than your own Slack will install it.
4. Each Flowbit workspace admin: Settings → Integrations → Slack → Add to Slack. Members then use `/flowbit task …`, `/flowbit my day` and a message's ⋯ menu → Create Flowbit task. Slack users are matched to members by email.

**Email to task.**
1. Pick a subdomain for inbound mail, e.g. `in.useflowbit.com`, and set `INBOUND_EMAIL_DOMAIN` to it.
2. **Resend inbound (recommended):** in Resend → Domains add the subdomain with receiving on, and add the MX record Resend shows (`in.useflowbit.com MX 10 inbound-smtp.<region>.amazonaws.com` or what Resend lists) at your DNS host. In Resend → Webhooks add `https://<APP_URL>/api/inbound/email` for the `email.received` event and put its signing secret (`whsec_…`) in `INBOUND_EMAIL_SECRET`. `RESEND_API_KEY` must be set (Flowbit fetches the body and attachments from Resend's receiving API).
3. **Any other provider:** forward each mail as a JSON POST to `https://<APP_URL>/api/inbound/email` with `{ "from", "to", "subject", "text" or "html", "message_id", "attachments": [{ "filename", "content_type", "content" (base64) }] }` and the header `X-Flowbit-Signature: t=<unix>,v1=<hex HMAC-SHA256 of "t.body" with INBOUND_EMAIL_SECRET>`. Providers that hand over the whole message (Cloudflare Email Workers, SES, Mailgun "raw MIME") can post `{ "raw": "<base64 MIME>", "to": ["<envelope recipient>"] }` (or `"mime"` as text) instead; Flowbit parses it with postal-mime, reads Authentication-Results from the message, and an `auth: { spf, dkim, dmarc }` object in the JSON overrides it.
4. Each member finds their own address (`tasks+<workspace>-<token>@in.useflowbit.com`) in Settings → Profile. Only the address owner may send to it (an admin can allow teammates in Settings → Security). When the provider reports SPF, DKIM or DMARC, each must pass. Changing `APP_SECRET` changes every address.

**Outbound webhooks** need nothing on the server beyond `APP_ENCRYPTION_KEY` (secrets) and the `/api/cron/messages` cron (retries). Admins add them in Settings → Integrations → Webhooks; receivers verify `X-Flowbit-Signature` (`t=…,v1=HMAC-SHA256(secret, "t.body")`, reject if older than 5 minutes).

## (e5) Meetings AI and the client portal (optional)

1. **Add-ons:** Console → Accounts → a workspace → Add-ons switches on the client portal (already included in Suite) and Meetings AI. Trials and Internal/Test workspaces get both.
2. **Client portal:** nothing to configure; the portal lives at `https://<APP_URL>/portal/<workspace-slug>`. Clients sign in with an emailed code, so `RESEND_API_KEY` must be set.
3. **Direct recording uploads (R2/S3):** add a CORS rule on the bucket allowing `PUT` from `https://<APP_URL>` with the `Content-Type` header, e.g. R2 → bucket → Settings → CORS: `[{"AllowedOrigins":["https://<APP_URL>"],"AllowedMethods":["PUT"],"AllowedHeaders":["content-type"],"MaxAgeSeconds":3600}]`. Without S3 storage, recordings go through the 4 MB form upload.
4. **Sarvam:** set `SARVAM_API_KEY` (transcription, about ₹45 an hour; AI minutes also need `ANTHROPIC_API_KEY`). **Recall.ai:** set the three `RECALL_*` variables and add the webhook `https://<APP_URL>/api/webhooks/recall`. The `/api/cron/meetings` job (every 15 minutes) picks up missed callbacks.
5. **Two-factor sign-in** for workspace users uses `APP_ENCRYPTION_KEY` (required anyway). Owners can require it for admins in Settings → Security.

## (e6) Salary TDS, e-invoice and custom domains (optional)

1. **Salary TDS (Muster):** in Salary structures → Statutory rates, propose and confirm a version with "Compute TDS each month" on. Each workspace then sets its TAN, signatory and proof window in Payroll → Salary tax. The FY 2026-27 slabs are built in; when a Finance Act changes them, edit the JSON in **Console → Settings → Salary TDS rules** (no deploy). Have a CA review the figures before the first live run.
2. **E-invoice (Folio):** per GST entity in Folio settings → E-invoice: tick the turnover box (above ₹5 crore), enter the GSP's API address and login (client ID, secret, username, password; sealed with `APP_ENCRYPTION_KEY`), and start in **Sandbox**. Switch to Production only after a sandbox IRN, cancel and e-way bill work end to end with your GSP. The generic adapter speaks the common NIC-style GSP API (`/eivital/v1.04/auth`, `/eicore/v1.03/Invoice`, `/eicore/v1.03/Invoice/Cancel`, `/eiewb/v1.03/ewaybill`); a GSP with another shape needs its own adapter behind `GspProvider`.
3. **Custom domains add-on (about ₹999 a month):** Console → Accounts → a workspace → Add-ons → Custom domains.
   - **Sending domain:** the workspace adds it in Settings → Domains; Flowbit creates it at Resend (needs `RESEND_API_KEY`) and shows the SPF, DKIM and return-path records to publish, then Verify. Once verified, invoices, quotes, statements, reminders and portal mail go from `billing@<their domain>`.
   - **Portal domain:** set `PORTAL_CNAME_TARGET` (for example `portal.useflowbit.com`) and point that host at Vercel (CNAME `cname.vercel-dns.com`, add it in Vercel → Project → Settings → Domains). The workspace adds `portal.<their domain>` as a CNAME to it and presses Verify (a `node:dns` CNAME lookup). Then add the workspace's host in **Vercel → Project → Settings → Domains** so Vercel issues its certificate, or set `VERCEL_DOMAINS_API=true` with `VERCEL_API_TOKEN`, `VERCEL_PROJECT_ID` (and `VERCEL_TEAM_ID` for a team) to have Verify add it automatically.
4. **Orbit reply detection:** with `INBOUND_EMAIL_DOMAIN` and `INBOUND_EMAIL_SECRET` set (e4), Flowbit-sent sequence mail carries the enrolment's own signed reply address (`reply+<enrolment>-<signature>@…`) as Reply-To, and a reply there stops only that enrolment. Gmail reply detection is optional and **hidden at launch**: set `GMAIL_REPLY_DETECTION=true`, add `https://www.googleapis.com/auth/gmail.readonly` to the OAuth consent screen and keep the app in testing (test users only) until Google's CASA assessment for restricted scopes is complete.
5. **Security page:** `/security` says backups depend on the database tier. Move production to Atlas **M10** (automatic snapshots) and, if you like, state the schedule on the page (`src/modules/marketing/content/security.ts`).
6. A Hindi speaker should review `src/lib/i18n/hi.ts` (marked `review`).

## (f) Vercel

> **Pro plan required.** Upgrade the Vercel team to **Pro** before the first deploy. `vercel.json` has sub-daily crons, and on Hobby Vercel refuses the deployment with "Hobby accounts are limited to daily cron jobs". There is no Hobby fallback.

### 1. Put the code on GitHub

The simplest way without the command line is **GitHub Desktop**:

1. Create a free account on **github.com**, then install **GitHub Desktop** (desktop.github.com) and sign in.
2. **File → Add Local Repository** → choose the `flowbit` folder → it offers to **create a repository** → name `flowbit`, set **Git ignore** to **None** (the project already has its own `.gitignore`) → **Create Repository**.
3. Check the left panel before committing: it must **not** list `.env.local`, `seed-logins.local.md`, `storage/`, `.next/` or `node_modules/`. The project's `.gitignore` already leaves them out. If you see any of them, stop and ask your developer.
4. Write "First commit" in the summary box → **Commit to main** → **Publish repository** → keep **Keep this code private** ticked → **Publish**.

(Alternative for a developer: `npx vercel` from the folder deploys without GitHub. The project's `.vercelignore` keeps `storage/`, `.env*` files, `*.local.md` logins and build folders out of the upload; check it is there before running it.)

### 2. Import the project

1. **vercel.com** → sign in → make sure the team is on **Pro** → **Add New… → Project** → **Continue with GitHub** and allow access to the `flowbit` repository → **Import**.
2. Configure:
   - Framework Preset: **Next.js** (detected).
   - Root Directory: `./` (the repository is the `flowbit` folder).
   - Build Command: leave the default (`npm run build`). Install Command: default (`npm install`; the committed `.npmrc` handles Excalidraw's peer dependencies). Output Directory: default.
   - Expand **Environment Variables** and add the rows of the table below. You can paste a block of `NAME=value` lines into the first key field, but build that block from the table, **not** from `.env.example`: the example holds local values (`MONGODB_URI` on 127.0.0.1, `APP_URL` on 127.0.0.1, `STORAGE_DRIVER=local`) that the production check refuses.
3. **Deploy.** The first build takes 5–10 minutes. The production address will be something like `flowbit-xxxx.vercel.app` until the domain is added.

Then, in the project:

- **Settings → Build and Deployment → Node.js Version: 22.x** (also set by `package.json`).
- **Settings → Functions**: region **Mumbai, India (bom1)** is set by `vercel.json`, next to the Atlas cluster. Keep **Fluid compute** on (the default).

### 3. Environment variables

This is the one list of every variable. Add them under **Settings → Environment Variables** for the **Production** environment (and Preview if you use preview deployments with a separate test database). After any change, redeploy (**Deployments → ⋯ on the latest → Redeploy**). `.env.example` has the same variables with a comment each.

Kinds:
- **Required**: the build and the server refuse to start without it (or with a wrong value).
- **Real use**: Flowbit starts without it, prints a warning, and something important silently does nothing.
- **Conditional**: required only for the feature named.
- **Optional**: leave unset unless you want the feature.
- **Flag**: a switch that must stay **off at launch**. Each one accepts only the values shown.

| Variable | Kind | Default when unset | What to set |
|---|---|---|---|
| `MONGODB_URI` | Required | local replica set (refused when deployed) | The Atlas string from (a) step 6 |
| `MONGODB_DB` | Required | `flowbit` | `flowbit` |
| `APP_SECRET` | Required | none | `openssl rand -base64 48`. At least 32 random characters. Never rotate casually (box above) |
| `APP_URL` | Required | the project's production `https://….vercel.app` address on Vercel | `https://app.yourdomain.in` once the domain works (step 5). Must be https |
| `APP_ENCRYPTION_KEY` | Required | none | `openssl rand -base64 32` (64 hex characters also work). Must decode to 32 bytes. Without it Console staff cannot sign in (two-factor) and Google, Slack, webhooks, e-invoice and workspace Razorpay keys cannot be saved. Never rotate casually |
| `CRON_SECRET` | Required | none (cron routes answer 503) | `openssl rand -hex 32` (16 characters at least). Vercel sends it to the scheduled jobs |
| `STORAGE_DRIVER` | Required | `local` (refused on Vercel) | `s3` |
| `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Required with `s3` | empty | From (b): `auto` (R2) or `ap-south-1` (AWS), `flowbit-files`, the two keys |
| `S3_ENDPOINT` | Required for R2 | empty (AWS S3) | `https://<account-id>.r2.cloudflarestorage.com` |
| `S3_FORCE_PATH_STYLE` | Optional | empty | Leave unset (MinIO only) |
| `STORAGE_DIR` | Optional | `./storage` | Leave unset on Vercel (local driver and `storage:migrate` only) |
| `MAX_UPLOAD_MB` | Optional | 4 on Vercel, 10 elsewhere | Leave unset. A value above 4 stops a Vercel build |
| `RESEND_API_KEY` | Real use | empty: mail is only stored in Settings → Messages log | From (c) |
| `RESEND_WEBHOOK_SECRET` | Real use | empty: delivery, bounce and spam events are refused | The `whsec_…` signing secret of the Resend webhook, (c) step 7 |
| `MAIL_FROM` | Real use | `Flowbit <no-reply@useflowbit.com>` (warned: Resend refuses unless that domain is verified) | `Flowbit <no-reply@mail.yourdomain.in>`, on your verified domain |
| `SUPPORT_EMAIL` | Optional | `support@useflowbit.com` | Your support inbox (shown on invoices and legal pages) |
| `CONSOLE_HOST` | Optional | `console.useflowbit.com` | Leave unset unless the Console uses another host (step 5) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Optional | empty: Google sign-in and Calendar are off | From (d) |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Conditional: charging | empty: no checkout in production | From (e) |
| `FLOWBIT_LEGAL_NAME` | Conditional: charging | `Sanskaar Webx Services LLP` | The registered name |
| `FLOWBIT_GSTIN`, `FLOWBIT_PAN`, `FLOWBIT_ADDRESS`, `FLOWBIT_STATE` | Conditional: charging | empty: no GST charged, bills say "not a tax invoice" | From (e) step 4 |
| `FLOWBIT_SAC` | Conditional: charging | `998314` | Confirm with the CA |
| `FLOWBIT_INVOICE_PREFIX` | Optional | `FB` | A new GSTIN needs a new prefix. Credit notes print `FB` → `FBC` |
| `FLOWBIT_WALLET_SAC` | Optional (dormant: WhatsApp wallet) | `FLOWBIT_SAC` | CA to confirm 998315 or 998319 |
| `FLOWBIT_HOUSE_ORG_SLUG` | Optional | empty: skipped | The slug of Vistaar's own workspace; each signup and demo request becomes a Lead in its Orbit |
| `ANTHROPIC_API_KEY` | Optional | empty: Arc uses templates | Lets Arc draft with Claude. Monthly caps per account type in Console → Settings → Arc AI (Free 0, Trial 50, paid 500) |
| `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_SIGNING_SECRET` | Optional | empty: Slack hidden, `/api/slack/*` refuses | From (e4) |
| `INBOUND_EMAIL_DOMAIN`, `INBOUND_EMAIL_SECRET` | Optional | empty: no task address, `/api/inbound/email` answers 503 | From (e4) |
| `KLIPY_API_KEY` | Optional | empty: no GIF button (image upload stays) | partner.klipy.com → API key |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Optional | empty: the office editor asks for latitude and longitude | A Google Cloud browser key (billing on) restricted to your domains and to only Maps JavaScript API and Places API (New). Built into the page: redeploy after changing it. Never enable the Geolocation API: check-in uses the device's own location |
| `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` | Optional | `DEMO_MAP_ID` | Not a key. Google Maps Platform → Map management → Create map ID (JavaScript). Needed for production use of the draggable pin and dark map |
| `GOOGLE_GEOCODING_API_KEY` | Optional | empty: no "Find" or "Pin near" in the office editor | A separate server key restricted to the Geocoding API only, with a daily quota. Never exposed to the browser |
| `SARVAM_API_KEY` | Optional | empty: transcription off | From (e5) |
| `RECALL_API_KEY`, `RECALL_WEBHOOK_SECRET` | Optional | empty: "Send notetaker" hidden | From (e5) |
| `RECALL_REGION` | Optional | `us-west-2` | Your Recall workspace's region |
| `INDIAMART_API_URL` | Optional | IndiaMART's documented pull API | Leave unset (sandbox or proxy only) |
| `PORTAL_CNAME_TARGET` | Optional | `portal.useflowbit.com` | From (e6), custom domains add-on |
| `VERCEL_API_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID` | Optional | empty | From (e6), with `VERCEL_DOMAINS_API` |
| `INTERAKT_API_KEY`, `INTERAKT_OTP_API_KEY`, `INTERAKT_WEBHOOK_SECRET` | Optional (dormant) | empty | Leave unset at launch: WhatsApp is hidden. See (e2) |
| `PLATFORM_ADMIN_EMAILS` | Scripts only | empty | Not needed on Vercel. Read only by `migrate-staff --all` on a restored v1 database |
| `FEATURE_WHATSAPP` | Flag | off | Leave unset. `on`, `true`, `1` or `yes` shows WhatsApp everywhere (Console → Settings → Features can still switch it off). Turn on only after the Interakt, Meta and template work in (e2) |
| `LIFECYCLE_DELETE_ENABLED` | Kill switch | **on** in deployed production; dry run locally, in dev and on previews | Leave unset. `false` (or `0`, `off`, `no`) stops all workspace deletion at once. See "Workspace deletion" |
| `RETENTION_PRUNE_ENABLED` | Kill switch | **on** in deployed production; dry run elsewhere | Leave unset. `false` stops log pruning (logs older than 13 months). See "Log retention" |
| `MEETINGS_PURGE` | Flag | dry run | Leave unset. `1`, `true`, `yes` or `on` lets the 15-minute meetings job delete recordings past each workspace's retention |
| `GMAIL_REPLY_DETECTION` | Flag | off | Leave unset until Google's CASA assessment. Exactly `true` offers `gmail.readonly` |
| `VERCEL_DOMAINS_API` | Flag | off | Exactly `true` adds verified portal hosts to Vercel automatically (e6) |

Not read by the app (pass them in the shell when a script needs them): `FIRST_OWNER_EMAIL` and `FIRST_OWNER_NAME` (`setup:prod`), `SEED_ALLOW_DB` (`db:seed`), `NEXT_DIST_DIR` (build folder). Vercel sets `VERCEL`, `VERCEL_ENV`, `VERCEL_URL`, `VERCEL_PROJECT_PRODUCTION_URL` and `VERCEL_GIT_COMMIT_SHA` itself.

Every production build checks the Required rows first. If one is missing or wrong, the build stops with a plain list of what to fix (for example "APP_URL must start with https://" or "APP_ENCRYPTION_KEY is not set"), and the previous deployment keeps serving, so a typo never takes the site down. Preview builds only print the list. The "Real use" rows are printed as warnings in the build log and in **Logs**. The server checks the same list again when it starts.

### 4. Scheduled jobs (Cron)

`vercel.json` registers **21 cron entries**: 7 jobs that run every 5 or 15 minutes, 7 daily jobs, and a daily catch-up (`?resume=1`) for each daily job. This is why **Vercel Pro is required**. Vercel runs them on the production deployment only, and sends `Authorization: Bearer <CRON_SECRET>` so nobody else can trigger them. Times are UTC; IST is 5½ hours ahead.

| # | Job | Schedule (UTC) | IST | What it does |
|---|---|---|---|---|
| 1 | `/api/cron/messages` | every 5 min | every 5 min | Message retries (1 m, 5 m, 30 m, 2 h), emails held for quiet hours or digests, Outbox rows into the Messages log |
| 2 | `/api/cron/automations` | every 5 min | every 5 min | Delayed automation runs and date-based recipes (quote follow-ups, overdue alerts, approval and meeting reminders, monthly statement) |
| 3 | `/api/cron/posts` | every 15 min | every 15 min | Publishes scheduled posts in Work → Posts |
| 4 | `/api/cron/sequences` | every 15 min | every 15 min | Gmail reply detection (when on), then the next step of every due Orbit sequence |
| 5 | `/api/cron/briefs` | every 15 min | every 15 min | Personal briefs that are due |
| 6 | `/api/cron/lead-sources` | every 15 min | every 15 min | IndiaMART pulls into Orbit (beta) |
| 7 | `/api/cron/meetings` | every 15 min | every 15 min | Missed transcription callbacks, notetaker pick-ups and the recording retention purge (dry run unless `MEETINGS_PURGE`) |
| 8 | `/api/cron/health` | 20:00 | 01:30 | Console health score: Green/Amber/Red per workspace from usage events |
| 9 | `/api/cron/task-reminders` | 02:30 | 08:00 | Task due today / overdue notifications (Work) |
| 10 | `/api/cron/follow-up-reminders` | 02:45 | 08:15 | Orbit follow-ups due today / overdue |
| 11 | `/api/cron/folio` | 03:30 | 09:00 | Folio overdue reminders to clients and retainer drafts |
| 12 | `/api/cron/billing` | 03:45 | 09:15 | Flowbit's own billing: due-bill and renewal reminders (15/7/3/1 days before, on the day, 1/3/7 after), autopay pre-debit notices, ends provisional access of offline payments not verified in 7 days, expires WhatsApp wallet credit after 12 months |
| 13 | `/api/cron/trial-reminders` | 04:00 | 09:30 | Free ends in 30/7/1 days, trial ends in 3/1 days, read-only, blocked, deletion in 30/7/1 days (owner email and bell) |
| 14 | `/api/cron/lifecycle` | 04:30 | 10:00 | Ended trials trimmed to 5 people go back to Free; Day 1/3/7 onboarding emails; workspace deletion (unpaid, and 30 days after an owner deletes) and log pruning (on in production, kill switches below) |
| 15–21 | the 7 daily jobs above with `?resume=1` | 3 hours after each (health 23:00, task-reminders 05:30, follow-up-reminders 05:45, folio 06:30, billing 06:45, trial-reminders 07:00, lifecycle 07:30) | 04:30 to 13:00 | Catch-up: finishes any workspaces the main run left, otherwise does nothing |

Each job is safe to run twice: a reminder or draft is never repeated, and the in-app retainer buttons wait for the daily job (and the other way round) so a period is never drafted twice. A job stops starting new workspaces after 4 minutes, to finish inside the 5-minute function limit; the catch-up finishes the rest. See them under **Settings → Cron Jobs** (it lists 21 entries) and run one by hand with its **Run** button.

A self-hosted server (not Vercel) can call the same `/api/cron/*` routes on the same schedule with the `CRON_SECRET` bearer, or run `npm run cron:folio` for the Folio job.

#### Payment links, public links and lead capture

- **Each workspace's own Razorpay** (Settings → Integrations → Razorpay) needs `APP_ENCRYPTION_KEY`. The workspace pastes its key id, key secret and a webhook secret; Flowbit shows it a webhook URL `https://<APP_URL>/api/webhooks/razorpay/<random key>` to add in its Razorpay dashboard with the event `payment_link.paid`. This is separate from Flowbit's own `RAZORPAY_*` subscription keys.
- **Public document links** live at `/d/<token>` and need no sign-in; they use `APP_URL`, so set it to the public domain before emailing documents.
- **Other public endpoints:** `/a/<token>` (approve by email), `/p/<token>` (payslip link, code by email), `/api/public/leads/<key>` and `/embed.js` (website form, origin allow-list and rate limits), `/api/webhooks/leads/<key>` (lead webhook, token), `/api/public/brand/<key>/logo` (logo in client email).

#### Workspace deletion (`LIFECYCLE_DELETE_ENABLED`)

When a Free plan, trial or paid plan ends without payment, the workspace is read-only for 30 days, then blocked (only Subscription and Export open), and its data is deleted 90 days after blocking. The owner gets emails 30, 7 and 1 days before. A workspace the owner deletes is purged 30 days after deletion (reminder 7 days before, confirmation after). `/api/cron/lifecycle` does the deletion:

- **On in production.** On a deployed production server the job really deletes (owner decision D4, 11 Oct). Locally, in dev and on Vercel previews it is a dry run: it deletes nothing For each workspace that is due it writes one line to the log, for example `[lifecycle] <orgId>: would delete 1234 rows and 12 files … (dry run: set LIFECYCLE_DELETE_ENABLED=true to apply)`, and its JSON result shows `"deletionEnabled": false`.
- **Kill switch.** To stop deletions at once, set `LIFECYCLE_DELETE_ENABLED=false` and redeploy. Remove it to resume.
- **What is deleted:** every record of the workspace in every collection (Work, Muster, Orbit, Folio, members, clients, files in the bucket, notifications, usage events), filtered by its id only; no other workspace is touched.
- **What is kept:** Flowbit's own GST invoices and credit notes to the workspace (6 years by law); a tombstone workspace record (status `deleted`, `deletedAt`, no name, address, GSTIN or billing details); audit-log and message-log rows from the last year with names, addresses and message bodies removed (older rows are deleted); payment events with the payload removed.
- **Never deleted:** Internal and Test workspaces, Comped workspaces before their end date, and workspaces Flowbit staff disabled.
- The owner can download a full export (Settings → Export: JSON and CSV per module plus files, as a ZIP) in every state, blocked included.

#### Log retention (`RETENTION_PRUNE_ENABLED`)

DPDP asks for message logs to be kept at least a year, and no longer than needed. The same daily `/api/cron/lifecycle` job prunes, across all workspaces, rows older than **13 months (395 days)** in: `Message` (message and delivery log), `Outbox`, Folio's message log, `AutomationRun`, workspace and Console WhatsApp chat messages, and `PaymentEvent` (webhook processing). Audit logs, Flowbit's invoices and billing events, document timelines and usage events (their own 400-day expiry) are not touched.

- **On in production, dry run elsewhere.** Outside deployed production the job only counts and logs `[retention] would delete rows older than … (dry run …)`; the JSON result has `retention.apply: false`.
- **Kill switch.** `RETENTION_PRUNE_ENABLED=false` stops pruning. At most 50,000 rows per collection go per run (batches of 2,000); a backlog clears over the following days.

### 5. Domain and DNS

1. **Settings → Domains → Add Domain** → `app.yourdomain.in` → **Add**.
2. Vercel shows a DNS record, normally a **CNAME** for `app` pointing at a `…vercel-dns…com` value. Add exactly that record at your DNS provider.
3. Wait until Vercel shows **Valid Configuration** (minutes to an hour). It issues the HTTPS certificate on its own.
4. Set `APP_URL=https://app.yourdomain.in` in Environment Variables and **Redeploy**. Update the Google redirect URI and the Razorpay and Resend webhook URLs if you used the `vercel.app` address earlier.
5. From then on, opening any page on the `….vercel.app` address takes you to `https://app.yourdomain.in`, where sessions and Google sign-in live. Scheduled jobs, webhooks and `/api/health` keep answering on both addresses.

#### Console host: `console.useflowbit.com`

The same deployment serves the Flowbit Console (staff only) on its own host. `src/proxy.ts` sees the host and serves everything under `/console`; product pages and product APIs answer 404 there, and the staff cookie (`__Host-fb_console`, host-only, SameSite=Strict) never reaches the product host, nor does `fb_session` reach the Console.

1. **Settings → Domains → Add Domain** → `console.useflowbit.com` → **Add** (same project, no redirect).
2. At the DNS provider add the record Vercel shows, normally `CNAME console → cname.vercel-dns.com` (or the project-specific `…vercel-dns…com` value). Wait for **Valid Configuration**; Vercel issues the certificate.
3. Leave `CONSOLE_HOST` unset (it defaults to `console.useflowbit.com`), or set it if you use another host name. `APP_ENCRYPTION_KEY` must be set (it is required): staff TOTP secrets are sealed with it.
4. Redeploy. `https://console.useflowbit.com` should show the Console sign-in. `https://app.useflowbit.com/platform` and `/console` now redirect there.
5. **Staff.** You do not need a separate step: `setup:prod` in step 7 makes the first owner the first Console Admin and prints a one-time Console setup link (48 hours). Add other staff later in Console → Staff (they get emailed setup links). Everyone enrols an authenticator app and saves 10 recovery codes on first sign-in. `scripts/migrate-staff.ts` is only for a database restored from v1 (see step 7).
6. Optional hardening: protect the Console host with Vercel's IP allow-list or Cloudflare Access; the app does not depend on it.

Locally, `http://127.0.0.1:4100/console` serves the Console on the same host (loopback only); set `CONSOLE_HOST=console.localhost:4100` and open `http://console.localhost:4100` to try the host routing.

### 6. Move existing local data and files (optional; before anyone signs in)

Do this only if you want the data now on this laptop (the local `flowbit` database and the `storage` folder) to be the starting point in production. Otherwise skip to step 7 and start fresh.

**Order matters.** Restore into an **empty** Atlas database, **before** `setup:prod` and before anyone signs in. `setup:prod` and the first sign-in create a new owner account and workspace; restoring on top of them skips your laptop's copy of that account (its email is already taken), so the restored workspace ends up with no owner.

1. **Copy the database** (needs the MongoDB Database Tools: `brew install mongodb-database-tools`):
   ```
   mongodump --uri "mongodb://127.0.0.1:27017/?replicaSet=rs0" --db flowbit --out ./dump
   mongorestore --uri "<the Atlas string>" --nsInclude "flowbit.*" ./dump
   rm -rf ./dump
   ```
   Passwords keep working. Everyone has to sign in again, because sessions do not carry over to the new `APP_SECRET`.
   - If Atlas is **not** empty, add `--drop` to `mongorestore`. It replaces every collection with the laptop's copy and **erases what is in Atlas now**.
   - `mongorestore` should end with `0 document(s) failed to restore`. Any "duplicate key" line means Atlas was not empty: run it again with `--drop`.
2. **Copy the files** into the bucket with `npm run storage:migrate` (step 7, item 2).

### 7. Production run order

Every data script needs an explicit target: `--env-file=.env.setup.local` (or `--db=<name>` for a database on this laptop). Without one it stops and changes nothing; no script falls back to `.env.local`. Every script that writes is a **dry run** until you add `--apply` (except `setup:prod`, which is always safe to repeat).

First create `.env.setup.local` in the `flowbit` folder on this laptop (git-ignored; Next.js never loads this name, so it cannot leak into a local build):

```
MONGODB_URI=<the Atlas string>
MONGODB_DB=flowbit
APP_URL=https://app.yourdomain.in
APP_SECRET=<the same value as in Vercel>
APP_ENCRYPTION_KEY=<the same value as in Vercel>
RESEND_API_KEY=<from Resend>
MAIL_FROM=Flowbit <no-reply@mail.yourdomain.in>
# only for step 2 (file copy):
STORAGE_DIR=./storage
S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
S3_REGION=auto
S3_BUCKET=flowbit-files
S3_ACCESS_KEY_ID=…
S3_SECRET_ACCESS_KEY=…
```

Do not name it `.env.production.local`: Next.js loads that name automatically, so a local `npm run build` or `npm run start` would then use the production database.

| # | Step | Fresh, empty database | Restored or older database (upgrade) |
|---|---|---|---|
| 0 | Set the Vercel env (step 3), deploy. The build runs the env check | Yes | Yes |
| 1 | Restore the laptop data into an empty Atlas (step 6) | No | Only when moving laptop data |
| 2 | `npm run storage:migrate -- --env-file=.env.setup.local`, read the list, then add `--apply`. Skips files already in the bucket (`--overwrite` replaces them) | No | Only when moving laptop files |
| 3 | `FIRST_OWNER_EMAIL=you@yourdomain.in npm run setup:prod -- --env-file=.env.setup.local`. Creates every index, the first owner and the first Console Admin | **Yes** | Yes (it finds your existing account) |
| 4 | `npx tsx scripts/migrate-staff.ts --env-file=.env.setup.local --founder=you@yourdomain.in`, then add `--apply`. Turns old v1 `isPlatformAdmin` users into Console staff | No (step 3 already did it) | Only for a v1 database whose users still carry `isPlatformAdmin` |
| 5 | `npx tsx scripts/migrate-account-types.ts --env-file=.env.setup.local`, then `--apply`. Stores the account type on workspaces made before it existed | No (nothing to change) | Yes, for data from before 9 Oct |
| 6 | `npx tsx scripts/migrate-post-types.ts --env-file=.env.setup.local`, then `--apply`. Old `discussion`/`idea` posts become `question` | No | Yes, for data from before 10 Oct |
| 7 | `npx tsx scripts/folio-long-series.ts --env-file=.env.setup.local` (read-only). Lists Folio series whose numbers pass 16 characters; shorten each in Folio settings → Series (`docs/migrations/2026-10-folio-16-char-numbers.md`) | No | Yes, for any database with Folio data |
| 8 | Delete `.env.setup.local` (keep the values in your password manager) | Yes | Yes |
| 9 | Sign in and check (step 8) | Yes | Yes |

On a fresh database steps 1, 2, 4, 5, 6 and 7 do nothing, so the whole run is: deploy, `setup:prod`, sign in.

**After every later deploy** that adds a model or an index, run step 3 again (`setup:prod`, without `FIRST_OWNER_EMAIL`); your developer will say so. Production servers do not build indexes on their own (that would slow every cold start). Running it again is always safe.

**Never** run `npm run db:seed` against production. It refuses an Atlas database unless forced with `--force-demo`, and `--reset` drops the whole database.

About step 3: it never sets or prints a password. For a new account it emails a one-time "choose your password" link (valid 24 hours, works once; printed instead when Resend is not set, so don't share it), and a separate one-time Console setup link (48 hours). For an account restored in step 6 it tells you to sign in with your usual password. Without `FIRST_OWNER_EMAIL` it only creates indexes and explains how to sign up.

### 8. First sign-in

1. Restored data: sign in at `https://app.yourdomain.in/login` with your usual email and password. Fresh start: open the emailed link → choose a password → you land on **Create your workspace** → fill in the name and team size. A team of 5 or fewer starts on **Free for 6 months**; a bigger team starts a **15-day trial**.
2. Open `https://console.useflowbit.com` with the Console setup link from step 7 (its own password and two-factor sign-in) to see the workspaces.
3. Check `https://app.yourdomain.in/api/health`. It should show `"ok": true`, `"db": "reachable"`, `"storage": "s3"`, `"storageStatus": "reachable"` and `"email": "resend"`.
4. Upload a small logo in Settings → Company profile, then open it again: that proves R2 works. Send yourself an invite to prove email works, and check Settings → Messages log shows it as delivered (that proves the Resend webhook).

## (g) Backups and monitoring

**Backups**

- **Atlas M10 and above:** **Backup** in the cluster menu → turn on **Cloud Backup** (snapshots every few hours, kept for days to weeks; set the retention policy) and consider **Continuous Cloud Backup** for point-in-time restore. Test a restore into a new cluster once.
- **Atlas M0:** there are no backups. Until you move to M10, run `mongodump --uri "<Atlas string>" --db flowbit --out ./backup-YYYY-MM-DD` weekly and keep the folder somewhere safe (encrypted disk or private drive).
- **R2:** files are only deleted when Flowbit deletes them. In the bucket's **Settings → Object lifecycle rules**, keep only the default rule that aborts incomplete multipart uploads after 7 days; do **not** add rules that delete or expire objects, since the database still points at them. For a second copy, sync the bucket to another bucket or drive monthly with a tool like rclone.
- Back up the database and the bucket on the same day, so files and records match.

**Monitoring**

- **Uptime:** add `https://app.yourdomain.in/api/health` to a free monitor (UptimeRobot or Better Stack) every 5 minutes. It answers 503 when the database or the file bucket is unreachable, and shows `"email": "outbox"` if email is off.
- **Errors:** Vercel **Logs** (filter by "error") and **Observability**. Turn on email alerts for failed deployments in Vercel's notification settings.
- **Database:** Atlas **Alerts** (on by default for connections and disk); add your phone or email.
- **Jobs:** **Settings → Cron Jobs** shows each run; a 500 or 401 there needs attention. A run that answers `"complete": false` ran out of time and the catch-up run finishes it.
- **Email:** Resend dashboard → bounces and complaints.

## (h) Costs

Monthly, approximate, at about ₹85 to the dollar. A customer here is one workspace of 10–30 people.

| | 10 customers | 20 customers |
|---|---|---|
| Vercel **Pro** (1 seat; Hobby is for non-commercial use only) | $20 | $20 (usage stays inside the included credit at this size) |
| MongoDB Atlas **M10**, Mumbai | ~$57 | ~$57 (storage auto-grows; a few dollars more) |
| Cloudflare R2 (receipts, documents, PDFs; ~5–20 GB) | $0 (10 GB free) | ~$0.20 |
| Resend **Pro** (50,000 emails; the free plan stops at 100 a day, which payslip days can pass) | $20 | $20 |
| Domain (~₹1,000 a year) | ~$1 | ~$1 |
| **Total** | **~$98 (≈ ₹8,300)** | **~$99 (≈ ₹8,400)** |

To start cheaper while you test with one or two customers: Atlas M0 (free, no backups) and Resend free bring it to about $21 (≈ ₹1,800) a month. Move to M10 before you hold real payroll data you cannot lose. Razorpay charges per transaction (about 2% on cards and UPI), not monthly. Arc with Claude is billed by Anthropic per use and is off unless `ANTHROPIC_API_KEY` is set.

## (i) Troubleshooting

**The build fails on Vercel**
- `ERESOLVE could not resolve`: the `.npmrc` file (with `legacy-peer-deps=true`) is missing from GitHub. Make sure it was committed.
- A TypeScript error: the same error shows on this laptop with `npm run typecheck`; send it to your developer.
- `[check-env] Build stopped: fix these environment variables`: set what the list says (**Settings → Environment Variables**) and redeploy. The site keeps running the previous deployment meanwhile.
- Every page errors and **Logs** say "Flowbit cannot start": a variable was changed after the build. Fix it and redeploy.

**"413" or "Request Entity Too Large" when uploading**
- Vercel refuses request bodies over about 4.5 MB. Set `MAX_UPLOAD_MB=4` and redeploy; Flowbit then stops larger files in the browser with a clear message. Files larger than that would need uploads straight from the browser to the bucket (signed upload URLs), which Flowbit does not have yet.

**Pages or downloads time out ("504", `FUNCTION_INVOCATION_TIMEOUT`)**
- Heavy work (payroll, payslip and letter PDFs, invoice emails, imports, exports, scheduled jobs) may run for up to 300 seconds (`maxDuration` in those files). On Pro the limit can be raised to 800 seconds by changing `maxDuration`.
- Publishing payslips for a very large team (well over 100 people) can pass that limit. Press **Publish payslips** again: it carries on with the people not yet emailed and never emails anyone twice. (**Re-send** after publishing deliberately emails everyone again.)
- Check the Vercel region is **bom1** and the Atlas cluster is in **Mumbai**; a far-away database makes every step slow.
- `MongoServerSelectionError` in Logs: wrong password in `MONGODB_URI`, Network Access missing `0.0.0.0/0`, or an M0 cluster paused after a long idle period (resume it in Atlas).

**Scheduled jobs don't run**
- **Settings → Cron Jobs** must list 21 entries (see (f) step 4); if not, `vercel.json` is missing from GitHub.
- The deployment fails with "Hobby accounts are limited to daily cron jobs": the team is on Hobby. Upgrade to **Pro** and redeploy; there is no Hobby fallback.
- A run shows 503 "CRON_SECRET is not set": add `CRON_SECRET` and redeploy. 401: the value changed; redeploy so Vercel and the app agree.
- Jobs run only on the production deployment, never on previews.
- Try one by hand: `curl -H "Authorization: Bearer <CRON_SECRET>" https://app.yourdomain.in/api/cron/folio`.

**Emails land in spam or never arrive**
- The domain in `MAIL_FROM` must be the one verified in Resend, with SPF and DKIM showing "Verified" and a DMARC record in place.
- Settings → Messages log shows each message and the provider's answer. Resend's dashboard shows bounces.
- New sending domains build reputation slowly: send a few real messages first and avoid bulk sends on day one.

**Other**
- Files show "missing from storage": the files were not copied to the bucket (run `storage:migrate` with `--apply`, (f) step 7) or the S3 values are wrong.
- Google says `redirect_uri_mismatch`: the redirect URI in Google must be exactly `https://app.yourdomain.in/api/auth/google/callback` and `APP_URL` must match it.
- Razorpay webhook deliveries show 400 "bad signature": `RAZORPAY_WEBHOOK_SECRET` in Vercel differs from the secret on the webhook (test and live have separate webhooks).
- A data script says it "needs an explicit target and will not fall back to .env.local": add `--env-file=.env.setup.local` (or `--db=<name>` for a database on this laptop).
- Console sign-in says two-factor is not available: `APP_ENCRYPTION_KEY` is missing (a deployed build now refuses to start without it).
