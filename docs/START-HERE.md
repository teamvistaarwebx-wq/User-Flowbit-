# Start here

Read this page first. It says what Flowbit is, how to run it, how to deploy it, and which docs are current.

## 1. What Flowbit is

One SaaS for Indian teams of 6 to 150 people, with four products on one login, one workspace and one subscription: **Flowbit Work** (tasks and projects), **Muster** (HR and payroll), **Orbit** (CRM) and **Folio** (GST billing). Around them: the staff-only **Console** (`console.useflowbit.com`), the **client portal** (`/portal/<workspace>`), an **MCP server** for Claude and ChatGPT (`/mcp`), and the marketing site with help centre, FAQ and manual. Flowbit is a brand of **Sanskaar Webx Services LLP** (not "Flowbit Technologies").

## 2. If you are the developer

Run locally (details in `README.md`):
1. MongoDB 7+ **as a replica set** (`rs0`); transactions need it.
2. `cp .env.example .env.local`, then set `APP_SECRET` (`openssl rand -base64 48`). Everything else has a local default.
3. `npm install`, `npm run db:seed` (logins go to `seed-logins.local.md`), `npm run dev` → http://127.0.0.1:4100.

Checks before you commit:
```bash
NODE_OPTIONS=--max-old-space-size=3072 npx tsc --noEmit
npm test -- --maxWorkers=2
npx eslint
npm run check:hex
NODE_OPTIONS=--max-old-space-size=3072 NEXT_DIST_DIR=.next-check npx next build   # then delete .next-check
```

Five rules the whole codebase follows (details in `FOUNDATION.md`):
- **Tenancy:** every product document has `orgId`; read and write through `ctx.db(Model)`.
- **Catalog:** `src/lib/catalog.ts` is the one list of products, pages, nav and permissions.
- **Actions:** server actions go through `action(schema, fn, { perm, product })` in `src/lib/actions.ts`.
- **Money** is integer paise everywhere.
- **Dates** for days are `YYYY-MM-DD` strings in Asia/Kolkata.

This Next.js (16) differs from older versions; read `node_modules/next/dist/docs/` before framework-level changes (`AGENTS.md`).

## 3. If you are deploying

Read [`DEPLOY-VERCEL.md`](DEPLOY-VERCEL.md). In short:
- **Vercel Pro is required.** `vercel.json` has 21 cron entries, 7 of them every 5 or 15 minutes; on Hobby the deployment fails.
- Services: Vercel Pro, MongoDB Atlas (Mumbai), Cloudflare R2, Resend. Everything else is optional; the services table is at the top of DEPLOY.
- **Production run order** (DEPLOY (f) step 7): set the env, deploy, `setup:prod`, sign in. On a restored or older database also run `storage:migrate`, `migrate-staff` (v1 only), `migrate-account-types`, `migrate-post-types` and `folio-long-series`. Every data script needs `--env-file` (or `--db`) and is a dry run until `--apply`.
- Re-run `setup:prod` after any deploy that adds a model or an index.

## 4. Environments

| Role | Port | Database | Note |
|---|---|---|---|
| Developer | 4100 | `flowbit` | `npm run dev` |
| Owner demo | 4500 | `flowbit_v2night` | `.local-test/serve-night9.sh` serves `.next-night9b` (launch config `flowbit-demo`) |
| Test scratch | none | `flowbit_v2dev` | created and dropped by smoke tests |
| Production | Vercel | Atlas `flowbit` | not deployed yet |

Never run `db:seed` against production.

## 5. Secrets you must never rotate casually

- **`APP_SECRET`** signs sessions, OTP hashes, approval links, every email-to-task address and the self-host Folio cron token. Rotating it signs everyone out and changes every `tasks+…` address.
- **`APP_ENCRYPTION_KEY`** (required in production) seals Google and Slack tokens, webhook secrets, GSP logins, workspace Razorpay and Interakt keys and Console staff TOTP secrets. Rotating it makes all of them unreadable.

## 6. Switches that stay off at launch

| Flag | Default | Turn on when |
|---|---|---|
| `FEATURE_WHATSAPP` | off | The Interakt accounts, Meta verification and templates are done |
| `MEETINGS_PURGE` | dry run | When recording retention should really delete |
| `GMAIL_REPLY_DETECTION` | off | After Google's CASA assessment |
| `VERCEL_DOMAINS_API` | off | When portal custom domains are sold |

The other way round: workspace deletion (`LIFECYCLE_DELETE_ENABLED`) and log pruning (`RETENTION_PRUNE_ENABLED`) are **on** in deployed production and a dry run everywhere else. Set either to `false` as a kill switch.

## 7. Dormant code

- **WhatsApp** (about 80 files): built on **Interakt**, bring your own account, hidden behind `FEATURE_WHATSAPP` and the Console → Settings → Features switch. The public site says "coming soon".
- **Flowbit-managed WhatsApp mode** (`MANAGED_MODE_AVAILABLE = false`): needs an Interakt partner deal.
- **Gmail reply detection** (`gmail.readonly`): needs CASA.

## 8. Where things are

Current:
- `README.md`: stack, run locally, scripts, env summary, folder layout.
- `CHANGELOG.md`: release notes.
- `docs/START-HERE.md`: this page.
- `docs/STATUS.md`: current state, latest checks, open items (short).
- `docs/OWNER-TODO.md`: the owner's live checklist (keys, DNS, CA, lawyer, decisions).
- `docs/DEPLOY-VERCEL.md`: services, env table, crons, production run order.
- `docs/FEATURES.md`: what is built.
- `docs/SPEC.md`: v1 product spec (baseline). v2 changes: `docs/specs/console.md`, `notifications-v2.md`, `mcp.md`.
- `docs/DESIGN.md`: visual spec (wins over SPEC §3). `docs/design/`: Figma captures and screens as built.
- `docs/FOUNDATION.md`: shared APIs for agents and developers.
- `docs/migrations/`: one note per data migration.
- `docs/BREACH-RUNBOOK.md`: breach process (draft for the lawyer; linked from Console → Incidents).
- `docs/SLACK-APP-MANIFEST.yml`: the Slack app.
- `docs/WHATSAPP-TEMPLATES.md`, `docs/WHATSAPP-TEMPLATES-CUSTOMER.md`: template packs (dormant).
- `docs/qa/`: test and review reports (`TEST-10OCT-R1..R3`, `NIGHT-11OCT-VERIFY`, the `CONFLICTS-*` audits, `CA-QUESTIONS`). Each finding has a status column.

History (never act on it): `docs/archive/` holds the full build log (`STATUS-HISTORY.md`), the v2 plan, audit, research and reviews, the 8–10 Oct checks, `OWNER-MORNING-9OCT.md`, the porting inventories of the reference apps (`porting/`) and the 1 Oct build workflows (`_workflows/`).

## 9. Open items

See [`STATUS.md`](STATUS.md) "Open items" and [`OWNER-TODO.md`](OWNER-TODO.md). The QA reports hold the detail.

## 10. Gotchas

- **Stray `.next-*` folders:** never leave them in the project (Tailwind scans untracked files). `tsconfig.json` excludes them from `tsc`, but a build into `NEXT_DIST_DIR=.next-x` still appends `.next-x/types/**/*.ts` to the tsconfig `include`: run `git checkout tsconfig.json next-env.d.ts` afterwards.
- **Broken Turbopack cache** (`next/font` errors, missing CSS): delete the dist folder and rebuild.
- **`next start` locally** does not build indexes (`autoIndex` is off in production): run `npm run setup:prod -- --env-file=.env.local --allow-local` once.
- **Small machines (8 GB):** run one heavy process at a time (`tsc`, `next build`, `next dev`/`start`); tests with `--maxWorkers=2`.
- **External services** are tested with mocks only. Check each with real keys before relying on it.
