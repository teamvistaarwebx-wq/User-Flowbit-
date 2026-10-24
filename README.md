# Flowbit

Flowbit is one SaaS for Indian teams of 6 to 150 people. It has four products that share one login, one workspace, one design and one subscription:

| Product | Route | What it does |
|---|---|---|
| Flowbit Work | `/app`, `/app/work/*`, `/app/arc` | Tasks (list, board, calendar), spaces, projects, teams, meetings, posts, time tracking and timesheets, Excalidraw whiteboards, reports, and the Arc assistant |
| Muster | `/app/hr/*`, `/app/me/*`, `/c/[slug]` | HR and payroll: people, attendance register, leave, reimbursement claims (with a public claim form), payroll with PF/ESI/PT/LWF, HR letters, reports, employee self-service |
| Orbit | `/app/orbit/*`, `/app/clients/*` | CRM: leads with stage guards, deals board, contacts, activities and follow-ups, pipeline reports. Owns the shared Clients pages |
| Folio | `/app/folio/*` | GST billing: invoices, quotes and proformas, receipts and allocation, credit notes, retainers, client ledger, aging and GST reports |

Around them sit the marketing site (`/`, `/pricing`, `/products/*`, `/contact`, `/legal/*`), sign-up and onboarding, the app shell, settings (members, roles, modules, subscription, audit log, Messages log), notifications, and the staff-only Flowbit Console (`console.useflowbit.com`, `/console` locally; own sign-in with 2FA).

Arc follows one rule: AI reads, people decide. It searches and drafts. Nothing is created or changed until a person clicks Apply.

**New here? Read [docs/START-HERE.md](docs/START-HERE.md) first.** It maps every doc and says which ones are history.

To put Flowbit online (Vercel **Pro**, MongoDB Atlas, Cloudflare R2, Resend), follow **[docs/DEPLOY-VERCEL.md](docs/DEPLOY-VERCEL.md)**. **The Vercel Pro plan is required:** `vercel.json` has 21 cron entries, 7 of them every 5 or 15 minutes, and Vercel refuses the whole deployment on Hobby.

The binding product spec is `docs/SPEC.md` (v1 baseline; v2 changes are in `docs/specs/console.md`, `notifications-v2.md` and `mcp.md`). The visual spec, measured from the Figma, is `docs/DESIGN.md`; it wins over SPEC §3 where they differ. The shared API reference is `docs/FOUNDATION.md`. What is built is in `docs/FEATURES.md`; the current state and open items are in `docs/STATUS.md`; the owner's open tasks are in `docs/OWNER-TODO.md`.

## Stack

Next.js 16 (App Router, Turbopack), React 19, TypeScript strict, MongoDB through Mongoose 9, Tailwind CSS v4, Radix primitives, sonner, lucide-react, motion, dnd-kit, date-fns, zod v4, @react-pdf/renderer, bcryptjs, papaparse, Resend (optional), Excalidraw. Charts are hand-written SVG components. Tests use Vitest.

Note: this Next.js version differs from older ones (for example `src/proxy.ts` replaces middleware). Check `node_modules/next/dist/docs/` before changing framework-level code.

## Run it locally

### 1. Requirements

- Node.js 22 (tested on 22.18).
- MongoDB 7 or later, **running as a replica set**. Payroll, invoicing, receipts and other writes use transactions, and transactions need a replica set.

### 2. Start MongoDB as a single-node replica set

With Homebrew on macOS, make sure the config has:

```yaml
# /opt/homebrew/etc/mongod.conf
replication:
  replSetName: rs0
```

Then start it and initialise the set once:

```bash
nohup mongod --config /opt/homebrew/etc/mongod.conf &
mongosh --eval 'rs.initiate({ _id: "rs0", members: [{ _id: 0, host: "127.0.0.1:27017" }] })'   # first time only
```

(On this Mac, `brew services` and `mongod --fork` do not work; use the `nohup` line above, including after a reboot.)

Local development uses the database `flowbit`. Other local databases are demo or QA copies: `flowbit_v2night` (the demo on port 4500) and `flowbit_v2dev` (created and dropped by smoke tests). Never point a script at one of them by accident: the data scripts need an explicit `--db=<name>` or `--env-file`.

### 3. Create `.env.local`

```bash
cp .env.example .env.local
openssl rand -base64 48   # paste the result into APP_SECRET
```

The app refuses to start if `APP_SECRET` is shorter than 32 characters or looks like a placeholder. Everything else has a working default for local use. See [Environment variables](#environment-variables).

### 4. Install, seed, run

```bash
npm install
npm run db:seed            # creates the demo workspace; refuses if it already exists
npm run db:seed -- --reset # drops the MONGODB_DB database (flowbit) first, then seeds
npm run dev                # http://127.0.0.1:4100
```

The seed creates one workspace, **Vistaar WebX** (slug `vistaar`), on an active Suite plan with 25 seats and demo data for every product: 16 members, 20 employees, about 50 tasks, 6 projects, September payroll published and October open, 148 leads, 10 deals, 22 issued invoices, 15 receipts, and more. Dates sit around October 2026.

### 5. Logins

The seed writes every login to **`seed-logins.local.md`** in the project root. The file is git-ignored and readable only by you. Each run of the seed makes new passwords, so read the file again after a reset. There is one login per built-in role: owner (also the first Console Admin; the Console at `/console` has its own sign-in with 2FA), admin, hr_admin, hr_exec, finance, manager, sales, member, plus a custom "BD executive" role and some demo members.

Sign-in is rate limited: 8 attempts per account from one IP, and 30 per account from all IPs, in any 15 minutes. Attempts count whether or not the password is right. Counts live in MongoDB (`ratelimits`, deleted when the window ends) with an in-memory first check, so they hold across server instances. To clear them locally: `mongosh flowbit --eval 'db.ratelimits.deleteMany({})'` and restart the server.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on 127.0.0.1:4100 |
| `npm run build` | Production build (also typechecks) |
| `npm run start` | Production server on 127.0.0.1:4100 (run `build` first) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Vitest, all unit tests (`src/**` and `scripts/**`). On small machines: `npm test -- --maxWorkers=2` |
| `npm run check:hex` | Ratchet on raw `[#hex]` Tailwind classes (use colour tokens) |
| `npm run db:seed` | Seed the demo workspace (`-- --reset` to wipe the `MONGODB_DB` database first). Never against production |
| `npm run cron:folio` | Self-hosted servers only: run Folio's daily job once (overdue reminders and retainer drafts) |
| `npm run setup:prod -- --env-file=<file>` | Production database: create indexes, the first owner (`FIRST_OWNER_EMAIL`) and the first Console Admin. Safe to repeat; run again after any deploy that adds an index. `--allow-local` builds indexes on a local database |
| `npm run storage:migrate -- --env-file=<file>` | Copy files from `STORAGE_DIR` into the S3/R2 bucket, keeping every key. Dry run unless `--apply` |
| `npx tsx scripts/migrate-staff.ts --env-file=<file> --founder=<email>` | Restored v1 databases only: old platform admins become Console staff. Dry run unless `--apply` |
| `npx tsx scripts/migrate-account-types.ts --env-file=<file>` | Upgrades: store `subscription.accountType` on old workspaces. Dry run unless `--apply` |
| `npx tsx scripts/migrate-post-types.ts --env-file=<file>` | Upgrades: old `discussion`/`idea` posts become `question`. Dry run unless `--apply` |
| `npx tsx scripts/folio-long-series.ts --env-file=<file>` | Read-only: Folio series whose numbers pass 16 characters |
| `npx tsx scripts/perf-clients.ts` | Clients page timing (`--bulk` writes 2,000 synthetic clients: use `MONGODB_DB=flowbit_v2dev`) |
| `npx tsx scripts/manual-img-720.ts` | 720 px manual screenshots |

The data scripts (`migrate-*`, `storage:migrate`, `folio-long-series`) refuse to run without `--env-file=<file>` or `--db=<name>`; they never fall back to `.env.local`. The production run order (which scripts, fresh vs upgrade) is in [docs/DEPLOY-VERCEL.md](docs/DEPLOY-VERCEL.md) (f) step 7.

`npm run start` on this machine (`NODE_ENV=production`) does not build indexes on its own (`autoIndex` is off in production). Run `npm run setup:prod -- --env-file=.env.local --allow-local` once first.

On a machine with little memory, run only one of `tsc`, `next build` and `next dev`/`start` at a time. `NODE_OPTIONS=--max-old-space-size=3072` helps with `tsc` and `build`.

To check a production build while `npm run start` serves `.next`, build into another folder: `NEXT_DIST_DIR=.next-deploy npx next build`, then delete `.next-deploy`. `tsconfig.json` excludes every `.next-*` folder, so stray build folders never reach `tsc`. Next.js still appends `.next-deploy/types/**/*.ts` to the tsconfig `include` and may rewrite `next-env.d.ts` on such a build (it always does for a non-default `distDir`); put both back with `git checkout tsconfig.json next-env.d.ts`. Never leave stray `.next-*` folders in the project: Tailwind scans untracked files.

## Folder layout

```
flowbit/
  docs/START-HERE.md      start here: map of every doc, environments, gotchas
  docs/DEPLOY-VERCEL.md   production deploy: services, env table, crons, run order
  docs/STATUS.md          current state and open items (short); docs/OWNER-TODO.md for the owner
  docs/FEATURES.md        what is built
  docs/SPEC.md            product spec (v1 baseline; v2 deltas in docs/specs/)
  docs/DESIGN.md          visual spec measured from the Figma (overrides SPEC §3)
  docs/FOUNDATION.md      shared APIs: ctx, actions, models, UI kit, recipes
  docs/specs/             console.md, notifications-v2.md, mcp.md
  docs/migrations/        one note per data migration
  docs/qa/                test and review reports (open items live in their status columns)
  docs/archive/           superseded docs and the full build log (history; never act on it)
  docs/design/            Figma captures, brand kit, and after/ (screens as built)
  scripts/                seed, setup-prod, data migrations, checks (see Scripts above)
  scripts/lib/env-file.ts --env-file / --db handling for every data script
  vercel.json             Vercel region (bom1) and the 21 cron entries (Pro plan required)
  storage/                uploaded files with STORAGE_DRIVER=local (STORAGE_DIR), git-ignored
  src/
    proxy.ts              host routing (Console host, portal custom domains) and the session-cookie gate for /app
    instrumentation.ts    refuses to start a deployed server with missing or unsafe env (lib/env-check)
    app/
      (marketing)/        landing, pricing, products, contact, legal, help, faq, manual, status
      (auth)/             login, signup, forgot/reset password, invite, onboarding, 2FA
      app/                the signed-in product; app/layout.tsx is the shell
        page.tsx          Home dashboard
        arc/ work/        Flowbit Work
        hr/ me/           Muster (HR side and self-service)
        orbit/ clients/   Orbit and shared client pages
        folio/            Folio
        settings/ notifications/ whatsapp/ locked/
      console/            Flowbit Console (staff only; console.useflowbit.com)
      portal/             client portal (/portal/<workspace>)
      mcp/ oauth/         MCP server for Claude and ChatGPT, and its OAuth server
      a/ bill/ c/ d/ p/   public link pages: approve, Flowbit bill, claim form, document, payslip
      api/                route handlers (auth, files, PDFs, exports, webhooks, cron/*, health)
    components/
      ui/ charts/ shell/  design system, SVG charts, app shell
      <product>/          product components
    lib/                  db, auth, ctx, catalog, permissions, plans, billing, audit, notify,
                          mail, files, money, dates, sequence, pdf, sound, toast, validation, env, env-check
    models/               core models; models/<product>/ product models
    modules/<product>/    server actions, queries, domain logic, seed per product
```

Key ideas:

- **Tenancy.** Every product document has `orgId`. Code reads and writes through `ctx.db(Model)`, which injects it.
- **Catalog.** `src/lib/catalog.ts` is the single list of products, pages, nav and permissions. The shell, route guards, modules page and pricing page all read it.
- **Actions.** Server actions go through `action(schema, fn, { perm, product })` in `src/lib/actions.ts`. It validates with zod, checks permission, product and workspace state, and turns errors into `{ ok: false }`.
- **Money** is integer paise everywhere. **Dates** for days are `YYYY-MM-DD` strings in Asia/Kolkata.

## Environment variables

`.env.example` lists every variable with a comment. The full table (what to set in production and why) is in [docs/DEPLOY-VERCEL.md](docs/DEPLOY-VERCEL.md) (f) step 3. Summary:

| Kind | Variables | Default when unset |
|---|---|---|
| **Required** (a deployed server refuses to start without it) | `MONGODB_URI`, `MONGODB_DB`, `APP_SECRET`, `APP_URL`, `APP_ENCRYPTION_KEY`, `CRON_SECRET`, `STORAGE_DRIVER=s3` with `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` (+ `S3_ENDPOINT` for R2) | local replica set, `flowbit`, none, `http://127.0.0.1:4100` (Vercel: its production URL), none, none, `local` |
| **Real use** (warning only; something silently does nothing) | `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `MAIL_FROM` | mail stored only; webhook refused; `Flowbit <no-reply@useflowbit.com>` |
| **Conditional: charging** | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `FLOWBIT_LEGAL_NAME`, `FLOWBIT_GSTIN`, `FLOWBIT_PAN`, `FLOWBIT_ADDRESS`, `FLOWBIT_STATE`, `FLOWBIT_SAC` | no checkout in production; LLP name; no GST and "not a tax invoice" without the GSTIN; SAC `998314` |
| **Optional** | `SUPPORT_EMAIL`, `CONSOLE_HOST`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `FLOWBIT_INVOICE_PREFIX`, `FLOWBIT_WALLET_SAC`, `FLOWBIT_HOUSE_ORG_SLUG`, `ANTHROPIC_API_KEY`, `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_SIGNING_SECRET`, `INBOUND_EMAIL_DOMAIN`, `INBOUND_EMAIL_SECRET`, `KLIPY_API_KEY`, `SARVAM_API_KEY`, `RECALL_API_KEY`, `RECALL_REGION`, `RECALL_WEBHOOK_SECRET`, `INDIAMART_API_URL`, `PORTAL_CNAME_TARGET`, `VERCEL_API_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID`, `S3_FORCE_PATH_STYLE`, `STORAGE_DIR`, `MAX_UPLOAD_MB` | feature off; `support@useflowbit.com`, `console.useflowbit.com`, `FB`, `= FLOWBIT_SAC`, `us-west-2`, `portal.useflowbit.com`, `./storage`, 10 MB (4 on Vercel) |
| **Optional, dormant** (WhatsApp is hidden) | `INTERAKT_API_KEY`, `INTERAKT_OTP_API_KEY`, `INTERAKT_WEBHOOK_SECRET` | WhatsApp skipped |
| **Feature flags** (all off at launch) | `FEATURE_WHATSAPP` (`on`/`true`/`1`/`yes`), `MEETINGS_PURGE` (`1`/`true`/`yes`/`on`), `GMAIL_REPLY_DETECTION`, `VERCEL_DOMAINS_API` (each exactly `true`) | off or dry run |
| **Kill switches** (on in deployed production, dry run elsewhere) | `LIFECYCLE_DELETE_ENABLED`, `RETENTION_PRUNE_ENABLED` (`false`/`0`/`off`/`no` stops them) | on in production |
| **Scripts only** | `PLATFORM_ADMIN_EMAILS` (`migrate-staff --all`), `FIRST_OWNER_EMAIL`, `FIRST_OWNER_NAME` (`setup:prod`), `SEED_ALLOW_DB` (`db:seed`), `NEXT_DIST_DIR` (build folder) | empty |

Locally only `APP_SECRET` must be set (the app refuses a weak one); everything else has a working default. Two secrets must never be rotated casually: `APP_SECRET` (sessions, OTP hashes, every email-to-task address) and `APP_ENCRYPTION_KEY` (every sealed key and staff TOTP secret).

## AI apps (Claude, ChatGPT) and connectors

Flowbit is a remote MCP server at `${APP_URL}/mcp` with its own OAuth 2.1 server (dynamic client registration, PKCE S256, rotating refresh tokens); nothing to configure.

- **Claude:** Settings → Connectors → Add custom connector → URL `${APP_URL}/mcp` → Connect, sign in to Flowbit, pick the workspace and scopes.
- **ChatGPT:** Settings → Apps & Connectors → Advanced → Developer mode → Create → URL `${APP_URL}/mcp`, OAuth → connect the same way.
- Locally you can try it with the MCP Inspector: `npx @modelcontextprotocol/inspector`, transport Streamable HTTP, URL `http://127.0.0.1:4100/mcp` (http is allowed for localhost redirect URIs only).
- Settings → Integrations → Connected apps lists connections, history with undo, and the admin switch. Free workspaces cannot connect. Spec and what was built: `docs/specs/mcp.md`.
- Slack, email to task and outbound webhooks: Settings → Integrations; setup in `docs/DEPLOY-VERCEL.md` (e4) and `docs/SLACK-APP-MANIFEST.yml`.

## Deployment notes

The step-by-step guide for Vercel + MongoDB Atlas + Cloudflare R2 + Resend is **[docs/DEPLOY-VERCEL.md](docs/DEPLOY-VERCEL.md)**. In short:

- **Vercel (serverless).** Files go to a private bucket (`STORAGE_DRIVER=s3`) and stream back through `/api/files/[id]` after the access checks; nothing is written to the function's disk. Rate limits are shared through MongoDB. The Mongo connection is cached per instance with a small pool (10). Heavy routes and pages (payroll, PDFs, invoice email, imports, exports, cron) allow 300 s.
- **Startup check.** On Vercel, or in production with a public `APP_URL`, the server refuses to start until `MONGODB_URI`, a strong `APP_SECRET`, an https `APP_URL`, a 32-byte `APP_ENCRYPTION_KEY`, the S3 variables and `CRON_SECRET` are right, and says which one is wrong. `npm run start` on this machine (local `APP_URL`) is not affected.
- **Scheduled jobs (Vercel Pro required).** `vercel.json` has 21 cron entries: 7 sub-daily jobs (`messages` and `automations` every 5 minutes; `posts`, `sequences`, `briefs`, `lead-sources` and `meetings` every 15 minutes), 7 daily jobs (`health`, `task-reminders`, `follow-up-reminders`, `folio`, `billing`, `trial-reminders`, `lifecycle`, 01:30–10:00 IST) and a `?resume=1` catch-up three hours after each daily job. Vercel Hobby refuses sub-daily crons, so the deployment fails there. The full table is in DEPLOY-VERCEL (f) step 4. A self-hosted server can call the `/api/cron/*` routes with the bearer `CRON_SECRET`, or run `npm run cron:folio`.
- **Uploads.** Vercel refuses request bodies over ~4.5 MB: leave `MAX_UPLOAD_MB` unset (4 on Vercel). The browser refuses larger files before sending, and the server checks again. Bigger files would need direct-to-bucket uploads.
- **Health.** `GET /api/health` returns the version, whether MongoDB answers and the storage driver (503 when the database is down).
- **Security headers** (`next.config.ts`): `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options: SAMEORIGIN` with `frame-ancestors 'self'`, `Permissions-Policy`, and HSTS on https. Cookies are `Secure` whenever `APP_URL` is https and always on Vercel.
- **Simulated payments** exist only in development with a local `APP_URL`; never in production or on Vercel.
- **Seeding.** `npm run db:seed` refuses a non-local database or production settings unless `--force-demo`. `--reset` drops the whole database. Use `npm run setup:prod` for a production database instead.
- **Self-hosting on one server** still works: `STORAGE_DRIVER=local`, `npm run build && npm run start` behind an HTTPS proxy that sets `X-Forwarded-For` (rate limits read its right-most hop). Back up the `flowbit` database and the files together.
- **Payments.** Set the Razorpay keys and webhook secret, and point the Razorpay webhook at `${APP_URL}/api/subscription/razorpay/webhook`. Fill in the `FLOWBIT_*` supplier details before issuing real subscription invoices.
