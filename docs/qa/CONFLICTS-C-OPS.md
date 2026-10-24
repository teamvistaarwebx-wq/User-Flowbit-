# Conflicts audit C: developer, ops and config (11 Oct 2026)

This was a read-only audit. No code or other doc was changed. It answers one question: what will confuse the developer who gets the handover zip, and the owner who deploys?

Sources read:
- `README.md`, every file under `docs/`, `.env.example`, `src/lib/env.ts`, `src/lib/env-check.ts`, `scripts/*`, `vercel.json`, `package.json`, `next.config.ts`, `.gitignore`, `.vercelignore` and `tsconfig.json`;
- `HANDOVER.md` from `~/Downloads/flowbit-v2-developer-handover-20261011-0149.zip`;
- `../.claude/launch.json`;
- the processes and MongoDB databases running on this Mac, checked read-only on 11 Oct at about 02:00 IST.

Code is at commit `81870e2`.

Severity: **H** = will cause a failed deploy, data risk or a wrong production setting. **M** = will mislead or waste hours. **L** = untidy.

---

## 1. Doc inventory

"Replaced by" names the doc to read instead. "Archive" means move to `docs/archive/` (see section 7).

| Doc | Lines | Status | Replaced by / note | Action |
|---|---|---|---|---|
| `README.md` | 214 | **Current, with stale parts** | Has 6 stale statements (C-01, C-08, C-09, C-17, C-18, C-24). It is the only setup doc for developers. | Keep; fix |
| `HANDOVER.md` (only in the zip) | ~110 | **Current, with stale parts** | Points to `OWNER-MORNING-9OCT` as "every setup still pending" (stale). It claims DEPLOY-VERCEL has "migrations in order", which it does not (C-05). | Fold into `START-HERE.md` |
| `CHANGELOG.md` | 60 | Current | 2.0.0 release notes (9 Oct). The 10–11 Oct fix rounds are not in it. | Keep; add 2.0.1 |
| `AGENTS.md`, `CLAUDE.md` | — | Current | Next.js agent rules; written by `next dev` | Keep |
| `docs/DEPLOY-VERCEL.md` | 465 | **Current, with significant errors** | The owner's deploy guide. Its cron section, Hobby advice, env table, staff step and `MAIL_FROM` note are wrong (C-02, C-03, C-04, C-06, C-07, C-10, C-11). Steps 7 and 8 of v2.2 sit after Troubleshooting. | Keep; rewrite sections (f)3, (f)4, (f)5, (f)7 |
| `docs/STATUS.md` | 1,164 | **Current but unusable as a reference** | Header still says "As of 3 Oct 2026". The 3 Oct summary sits above 11 Oct entries. Its "Deploying to Vercel" env table and cron list are stale (C-12). It names zip `-0145`, which does not exist (the real one is `-0149`). | Split: top 60 lines become `docs/STATUS.md`; the step log moves to `archive/BUILD-LOG-1-11OCT.md` |
| `docs/FEATURES.md` | 395 | Current | Says "as built, 8 Oct" but was edited 11 Oct; it still uses the name "Email log" | Keep; fix header |
| `docs/SPEC.md` | 305 | **Superseded in part** | v1 build spec. Says "Flowbit Technologies" (the legal name is Sanskaar Webx Services LLP), "platform admin" and `/platform`, "Email log". v2 behaviour is in `specs/console.md`, `specs/notifications-v2.md` and `specs/mcp.md`. | Keep, with a banner "v1 baseline; v2 deltas in specs/*" |
| `docs/DESIGN.md` | 701 | Current | Visual spec; it wins over SPEC §3 | Keep |
| `docs/FOUNDATION.md` | 770 | **Partly stale** | API reference for agents (7 Oct). 10 mentions of `/platform`, "platform admin", "Flowbit Technologies" and `flowbit.app` | Keep; fix the platform and console section |
| `docs/BREACH-RUNBOOK.md` | 64 | Current (a draft for the lawyer) | Linked from the Console incidents page | Move to `docs/legal/` |
| `docs/CA-QUESTIONS.md` | 67 | Current (open questions) | Referenced by `.env.example` and `env.ts` (`FLOWBIT_WALLET_SAC`) | Move to `docs/legal/` (fix the 2 references) |
| `docs/SLACK-APP-MANIFEST.yml` | 42 | Current | Used by DEPLOY (e4) and the Slack settings page | Keep (or move to `docs/setup/`) |
| `docs/WHATSAPP-TEMPLATES.md` | 143 | Current but **dormant** (WhatsApp is hidden) | WhatsApp A template pack (Interakt) | Move to `docs/whatsapp/` |
| `docs/WHATSAPP-TEMPLATES-CUSTOMER.md` | 316 | Current but **dormant** | WhatsApp B template pack | Move to `docs/whatsapp/` |
| `docs/migrations/2026-10-folio-16-char-numbers.md` | 37 | Current | The only migration note. Uses `.env.prod.local`, while DEPLOY uses `.env.setup.local` (C-15). | Keep; becomes the model for `docs/migrations/` |
| `docs/specs/console.md` | 257 | Current (approved 7 Oct) | Replaces the platform-admin parts of `specs/platform.md`. Mentions "Cloud API" for WhatsApp; the code uses Interakt. | Keep |
| `docs/specs/notifications-v2.md` | 460 | **Stale header** | Says "Draft 2 … Nothing is built yet", but it is built. Its WhatsApp default is "BSP partner (Gupshup or 360dialog)"; the code uses Interakt (C-20). | Keep; add a "Built; the provider is Interakt" banner |
| `docs/specs/mcp.md` | 245 | Current | Built 9 Oct | Keep |
| `docs/specs/work.md`, `muster.md`, `orbit.md`, `folio.md` | 847 / 759 / 939 / 1,310 | **Historical** (porting inventories from the reference apps) | They describe the reference code, not Flowbit. They are useful only for "why". | Archive (`archive/porting/`) |
| `docs/specs/platform.md` | 2,082 | **Superseded** | Platform-admin and settings porting inventory (1 Oct). Replaced by `specs/console.md` and the code. | Archive |
| `docs/V2-AUDIT.md` | 226 | Superseded | 7 Oct "nothing built yet" audit; replaced by `FEATURES.md` | Archive |
| `docs/V2-PLAN.md` | 188 | Superseded | Master order of work for v2; everything in it is built or deferred, see `STATUS.md` | Archive |
| `docs/V2-RESEARCH.md` | 173 | Historical | Meta, competitor and law research behind notifications-v2 | Archive |
| `docs/V2-REVIEW.md` | 178 | Superseded | 8 Oct review of 8 commits, all fixed. Replaced by `V2-NIGHT-CHECK`, then `V2-RECHECK-10OCT`, then `TEST-10OCT-R*`. | Archive |
| `docs/V2-CHECK.md` | 100 | Superseded | 8 Oct check on 4400 / `flowbit_v2demo`; replaced by later checks | Archive |
| `docs/REVIEW-8OCT.md` | 77 | Superseded | The owner's 8 Oct list. "Done 9 Oct" marks it as closed by the v2.0 lock. | Archive |
| `docs/REVIEW-8OCT-PLAN.md` | 100 | Superseded | Plan for that list; built as steps 2–8 | Archive |
| `docs/OWNER-MORNING-9OCT.md` | 119 | **Stale but still the only owner to-do list** | It says 4500 runs `.next-night` and that 4100/4300/4400 run (all false now). It says to generate `APP_ENCRYPTION_KEY` with `-hex 32` (DEPLOY says `-base64 32`; both work). It says `CRON_SECRET` missing gives 401 (the code gives 503). Its items 2–25 are still the real pending list. | Replace with `docs/OWNER-TODO.md` (current); archive this one |
| `docs/BROWSER-CHECK-9OCT.md` | 44 | Superseded | One browser pass on 4500; replaced by `NIGHT-11OCT-VERIFY` | Archive |
| `docs/V2-NIGHT-CHECK.md` | 214 | Superseded | 9 Oct check; replaced by `V2-RECHECK-10OCT`, then `NIGHT-11OCT-VERIFY` | Archive |
| `docs/V2-RECHECK-10OCT.md` | 273 | Superseded | 10 Oct recheck; replaced by `TEST-10OCT-R*` and `NIGHT-11OCT-VERIFY` | Archive |
| `docs/TEST-10OCT-R1.md`, `R2.md`, `R3.md` | 283 / 230 / 552 | **Current (open items live here)** | Each finding has a status column; "Owner decision" and "Skipped" rows are still open | Keep in `docs/qa/` until the open rows move to one list |
| `docs/NIGHT-11OCT-VERIFY.md` | 147 | Current (latest verification) | Says 4500 serves `.next-night7`; it now serves `.next-night8` (C-25) | Keep in `docs/qa/` |
| `docs/PORT-ZIP-PERF-PROMPT.md` | 100 | **Done; a prompt, not a doc** | The 5 Oct performance port it asks for is done (STATUS v2.1 step 4, `perf-clients.ts`). Uses `flowbit.app` and "Flowbit Technologies". | Archive (or delete) |
| `docs/_workflows/phase*.js` | 6 files | Internal (1 Oct build orchestration) | Kept out of Vercel uploads by `.vercelignore`, but in git | Archive or delete |
| `docs/design/**` | ~120 PNG/SVG | Current reference assets | Figma captures and screens as built | Keep |

Totals: 34 docs (excluding images). 9 are current and clean, 6 are current but need fixes, 15 are superseded or historical, 4 are dormant or legal. A newcomer sees 25 top-level files in `docs/` with no index.

---

## 2. Env-var matrix

Legend:
- **ex** = in `.env.example`; **README** = in the README env table; **DEP** = in the DEPLOY-VERCEL (f)3 table (an asterisk means only in a later section of DEPLOY).
- **Prod** values: **R** = required (the build or startup refuses without it); **R\*** = required for real use (only a warning without it); **C** = conditional on a feature; **O** = optional; **X** = must stay unset or off at launch.
- `env.ts` uses `z.string().default('')` for almost everything, so a blank value is never an error, except for `APP_SECRET` and `APP_URL`.

| Variable | env.ts default | ex | README | DEP | Prod | Read by / note |
|---|---|---|---|---|---|---|
| `MONGODB_URI` | local rs0 | ✓ | ✓ | ✓ | R | env-check refuses a local URI when deployed |
| `MONGODB_DB` | `flowbit` | ✓ | ✓ | ✓ | R | `.env.example` says "always flowbit", but 3 local DBs exist (C-24) |
| `APP_SECRET` | none (min 32, entropy) | ✓ | ✓ | ✓ | R | Also keys the email-to-task addresses, the Folio self-host cron token, OTP hashes and the 2FA challenge. Rotating it does far more than "sign everyone out" (C-13) |
| `APP_URL` | `http://127.0.0.1:4100` (Vercel: the production `*.vercel.app` URL) | ✓ | ✓ | ✓ | R | https is required when deployed |
| `CRON_SECRET` | '' | ✓ | ✓ | ✓ | R | At least 16 characters, or the build stops. Unset gives 503 (OWNER-MORNING says 401) |
| `STORAGE_DRIVER` | `local` | ✓ | ✓ | ✓ | R (`s3` on Vercel) | |
| `STORAGE_DIR` | `./storage` | ✓ | ✓ | ✓ | X on Vercel | Also the source for `storage:migrate` |
| `S3_ENDPOINT` | '' | ✓ | ✓ | ✓ | C (R2) | |
| `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | '' | ✓ | ✓ | ✓ | R with s3 | |
| `S3_FORCE_PATH_STYLE` | '' | ✓ | ✓ | ✓ | O (MinIO only) | |
| `MAX_UPLOAD_MB` | not in env.ts; read by `next.config.ts` | ✓ | ✓ | ✓ | O (≤4 on Vercel) | The only var outside the schema. `.env.example` sets `10`; copying the example to Vercel would stop the build (C-14) |
| `RESEND_API_KEY` | '' | ✓ | ✓ | ✓ | R\* | Warning only |
| `RESEND_WEBHOOK_SECRET` | '' | ✓ | ✓ | **✗** | R\* | Missing from the DEPLOY table and from DEPLOY (c) (C-10) |
| `MAIL_FROM` | `Flowbit <no-reply@useflowbit.com>` | ✓ | ✓ | ✓ | R\* | env-check warns only for `@flowbit.app`, which is no longer the default (C-07) |
| `SUPPORT_EMAIL` | `support@useflowbit.com` | ✓ | ✓ | ✓ | O | |
| `PLATFORM_ADMIN_EMAILS` | '' | ✓ | ✓ | ✓ | O | Read only by `migrate-staff.ts --all` |
| `CONSOLE_HOST` | '' (code: `console.useflowbit.com`) | ✓ | ✓ | ✓ | O | |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | '' | ✓ | ✓ | ✓ | O | |
| `GMAIL_REPLY_DETECTION` | '' | ✓ | ✓ | \* (step 8) | X until CASA | Exactly `true` |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | '' | ✓ | ✓ | ✓ | C (billing) | |
| `FLOWBIT_LEGAL_NAME` | LLP name | ✓ | ✓ | ✓ | C (billing) | |
| `FLOWBIT_GSTIN`, `FLOWBIT_PAN`, `FLOWBIT_ADDRESS`, `FLOWBIT_STATE` | '' | ✓ | ✓ | ✓ | C (billing) | Without the GSTIN, invoices print DRAFT |
| `FLOWBIT_SAC` | `998314` | ✓ | ✓ | ✓ | C | CA to confirm |
| `FLOWBIT_WALLET_SAC` | '' (= `FLOWBIT_SAC`) | ✓ | ✓ | ✓ | dormant (WhatsApp) | |
| `FLOWBIT_INVOICE_PREFIX` | `FB` | ✓ | ✓ | ✓ | O | |
| `FLOWBIT_HOUSE_ORG_SLUG` | '' | ✓ | **✗** | **✗** | O | Signups become Leads in Vistaar's Orbit. Undocumented outside `.env.example` (C-10) |
| `APP_ENCRYPTION_KEY` | '' | ✓ | ✓ | ✓ | **R in practice** | It is only a warning in env-check, yet Console 2FA (staff cannot sign in to the Console without TOTP), Google, Slack, webhooks, GSP and workspace Razorpay all need it. Docs disagree: "for payment links" (DEPLOY) vs "Required" (OWNER-MORNING) (C-16) |
| `ANTHROPIC_API_KEY` | '' | ✓ | ✓ | ✓ | O | |
| `FEATURE_WHATSAPP` | '' (off) | ✓ | **✗** | **✗** (OWNER-MORNING only) | X | Accepts on/true/1/yes (C-19) |
| `INTERAKT_API_KEY`, `INTERAKT_OTP_API_KEY`, `INTERAKT_WEBHOOK_SECRET` | '' | ✓ | ✓ | ✓ | dormant | DEPLOY lists them as "for WhatsApp" with no "keep off" warning |
| `LIFECYCLE_DELETE_ENABLED` | '' (dry run) | ✓ | ✓ | ✓ | X at launch | Exactly `true` |
| `RETENTION_PRUNE_ENABLED` | '' (dry run) | ✓ | **✗** | ✓ | X at launch | Exactly `true` |
| `MEETINGS_PURGE` | '' (dry run) | ✓ | ✓ | ✓ | X at launch | Accepts 1/true/yes/on. The docs say "daily purge", but it runs in the 15-minute meetings cron (C-19) |
| `INDIAMART_API_URL` | '' | ✓ | ✓ | ✓ | O (leave unset) | |
| `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_SIGNING_SECRET` | '' | ✓ | ✓ | ✓ | O | |
| `INBOUND_EMAIL_DOMAIN`, `INBOUND_EMAIL_SECRET` | '' | ✓ | ✓ | ✓ | O | |
| `KLIPY_API_KEY` | '' | ✓ | **✗** | ✓ | O | The `.env.example` header puts it under "Meetings AI" (wrong section) |
| `SARVAM_API_KEY` | '' | ✓ | ✓ | ✓ | O | |
| `RECALL_API_KEY`, `RECALL_WEBHOOK_SECRET` | '' | ✓ | ✓ | ✓ | O | |
| `RECALL_REGION` | `us-west-2` | ✓ | ✓ | ✓ | O | |
| `PORTAL_CNAME_TARGET` | `portal.useflowbit.com` | ✓ | ✓ | \* (step 8) | O | |
| `VERCEL_DOMAINS_API`, `VERCEL_API_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID` | '' | ✓ | ✓ | \* (step 8) | O | `VERCEL_PROJECT_ID` and `VERCEL_TEAM_ID` are close to Vercel's own system variables (`VERCEL_PROJECT_PRODUCTION_URL`, `VERCEL_URL`); a prefix such as `FLOWBIT_VERCEL_*` would avoid confusion |

Variables read **outside** `env.ts` (scripts or tooling only, none in `.env.example`):
- `FIRST_OWNER_EMAIL` and `FIRST_OWNER_NAME`: read by `setup-prod`.
- `SEED_ALLOW_DB`: read by `seed`.
- `NEXT_DIST_DIR`: read by `next.config.ts`.
- `VERCEL`, `VERCEL_ENV`, `VERCEL_URL`, `VERCEL_PROJECT_PRODUCTION_URL` and `VERCEL_GIT_COMMIT_SHA`: Vercel system variables.

The README should list the first four in a short "script and tooling variables" table.

**Duplicates and near-duplicates**
- `APP_SECRET` vs `APP_ENCRYPTION_KEY`. These are different jobs: `APP_SECRET` is an HMAC signing key, `APP_ENCRYPTION_KEY` is the AES key for secrets at rest. Neither doc says plainly that both are needed and that neither can be rotated casually. Rotating `APP_SECRET` changes every `tasks+` address and signs everyone out. Rotating `APP_ENCRYPTION_KEY` bricks every sealed secret and staff 2FA. One "Secrets you can never rotate casually" box should cover both.
- `CRON_SECRET` (Vercel cron) vs HMAC(`APP_SECRET`, `folio:cron`) (self-host `/api/folio/cron`). These are two auth schemes for the same Folio job (C-21).
- `MAIL_FROM` default domains: `useflowbit.com` in env.ts, `flowbit.app` in `setup-prod.ts` and `env-check.ts` (C-07).
- Truthy parsing differs between flags: `FEATURE_WHATSAPP` and `MEETINGS_PURGE` accept `1/true/yes/on`; `LIFECYCLE_DELETE_ENABLED`, `RETENTION_PRUNE_ENABLED`, `GMAIL_REPLY_DETECTION` and `VERCEL_DOMAINS_API` accept only `true`. OWNER-MORNING tells the owner `FEATURE_WHATSAPP=1` and `MEETINGS_PURGE=1`. Someone who then sets `LIFECYCLE_DELETE_ENABLED=1` gets a silent dry run. That fails safe, but it is confusing.

**Unused vars:** none. Every schema key is read somewhere: the `FLOWBIT_*` supplier fields through `flowbitSupplier()`, and `PLATFORM_ADMIN_EMAILS` only by a script.

**Feature and dry-run flags at launch**

| Flag | Default | Set at launch? | Turn on when |
|---|---|---|---|
| `FEATURE_WHATSAPP` | off | No | The Interakt deal, Meta verification and templates are done |
| `LIFECYCLE_DELETE_ENABLED` | dry run | No | After several days of `[lifecycle] would delete` lines have been checked |
| `RETENTION_PRUNE_ENABLED` | dry run | No | After the `[retention]` counts have been checked |
| `MEETINGS_PURGE` | dry run | No | When recording retention should really delete |
| `GMAIL_REPLY_DETECTION` | off | No | After Google's CASA assessment |
| `VERCEL_DOMAINS_API` | off | Optional | When portal custom domains are sold |

---

## 3. Scripts and their run order

| Script | npm alias | Default mode | Env loaded | Purpose | Danger if run wrongly |
|---|---|---|---|---|---|
| `check-env.ts` | part of `build` | n/a | process env (Vercel) | Stops a Vercel production build when the env is invalid | None |
| `check-hex-classes.ts` | `check:hex` | read-only | none | CI ratchet on `[#hex]` Tailwind classes | None. It is not in the README, and nothing runs it in CI (there is no CI config) |
| `seed.ts` | `db:seed` | writes; `--reset` **drops the whole DB** | `.env.local` | Demo workspace `vistaar` | **H.** `--reset` drops `MONGODB_DB` (refuses anything other than `flowbit` unless `SEED_ALLOW_DB`, and refuses non-local unless `--force-demo`). Its log always says `Dropped database "flowbit"` even when it dropped `flowbit_v2night`. The README says `--reset` "drops the flowbit database", but it drops whatever `MONGODB_DB` is |
| `setup-prod.ts` | `setup:prod` | writes (indexes, owner, Console Admin); idempotent | **only** `--env-file` or the shell (never `.env.local`) | Indexes, first owner and first Console Admin | M. Refuses a local URI unless `--allow-local`, which the QA docs use to build local indexes. The password link is valid 24 h; the Console link 48 h |
| `migrate-staff.ts` | — | **dry run** (`--apply`) | `--env-file`, else `.env.local` | Turns old `isPlatformAdmin` users into Console staff | **H.** Without `--env-file` it runs against the **local** DB, so the owner can "apply" to the wrong database. It overlaps `setup-prod` (which already makes the founder the Console Admin). It is only needed for a DB restored from v1 (C-06) |
| `migrate-account-types.ts` | — | **dry run** (`--apply`) | `--env-file`, else `.env.local` | Stores `subscription.accountType` on old orgs | M. It falls back to `.env.local` in the same way. Not in DEPLOY or README |
| `migrate-post-types.ts` | — | **dry run** (`--apply`) | `--env-file`, else `.env.local` | `discussion`/`idea` posts become `question` | M. Same fallback. Only OWNER-MORNING item 21 mentions it |
| `migrate-storage.ts` | `storage:migrate` | **writes** (`--dry-run` opt-in) | `--env-file`, else `.env.local` | Copies local files into S3/R2 | **H (inconsistency).** It is the only migrate script that writes by default. It is idempotent (skips existing keys unless `--overwrite`), so a mistake is not destructive, but the dry-run convention is inverted |
| `folio-long-series.ts` | — | read-only | `--env-file`, else `.env.local` | Lists Folio series whose numbers exceed 16 characters | None. The HANDOVER says to run it "before deploying" (on prod data) |
| `folio-cron.ts` | `cron:folio` | writes (triggers a job) | **`.env.local` only, no `--env-file`** | Self-host trigger for `POST /api/folio/cron` | L. It is useless on Vercel, and it cannot target another server without editing `.env.local` |
| `perf-clients.ts` | — | `--bulk` **writes synthetic data** | `.env.local` + shell | Clients page timing | M. With `--bulk` and no `MONGODB_DB=flowbit_v2dev`, it adds 2,000 synthetic clients to the **`flowbit`** demo DB. The header says "never the demo DB" but nothing enforces it |
| `manual-img-720.ts` | — | writes files | none | 720 px manual screenshots | None |

**Production run order (fresh launch)**

1. Set the Vercel env (section 2), then deploy. The build runs `check-env`.
2. Only if moving laptop data: `mongorestore` into an empty Atlas DB, then `npm run storage:migrate -- --env-file=.env.migrate.local --dry-run`, then run it again without `--dry-run`.
3. `FIRST_OWNER_EMAIL=… npm run setup:prod -- --env-file=.env.setup.local`. This creates the indexes, the owner and the Console Admin.
4. Only if a v1 database was restored (users still carry `isPlatformAdmin`): `npx tsx scripts/migrate-staff.ts --env-file=.env.setup.local --founder=…`, then add `--apply`.
5. Only if the DB predates v2 (restored data):
   - `migrate-account-types.ts --env-file=… [--apply]`;
   - `migrate-post-types.ts --env-file=… [--apply]`;
   - `folio-long-series.ts --env-file=…` (read-only), then fix the series it lists in Folio settings.
6. After **every** later deploy that adds a model or an index: run `setup:prod` again.
7. Never run `db:seed` against production.

For a fresh, empty Atlas database, steps 4 and 5 are no-ops. **No doc says this.** As a result the owner may run five scripts, some of them against the wrong DB.

---

## 4. Crons: `vercel.json` vs routes vs docs

`vercel.json` has **21 entries**: 7 sub-daily, 7 daily and 7 daily `?resume=1` catch-ups. All 14 distinct paths have a route under `src/app/api/cron/*`, each with `maxDuration = 300` and a `CRON_SECRET` bearer through `cronHandler`. The time budget is 240 s (`CRON_TIME_BUDGET_MS`).

| Route | Schedule (UTC) | IST | Catch-up | Docs that list it |
|---|---|---|---|---|
| `messages` | `*/5` | every 5 min | — | README, OWNER-MORNING, DEPLOY (prose only) |
| `automations` | `*/5` | every 5 min | — | README, DEPLOY (prose), OWNER-MORNING |
| `posts` | `*/15` | every 15 min | — | OWNER-MORNING only |
| `sequences` | `*/15` | every 15 min | — | README, DEPLOY (prose), OWNER-MORNING |
| `briefs` | `*/15` | every 15 min | — | README, OWNER-MORNING |
| `lead-sources` | `*/15` | every 15 min | — | README, DEPLOY (prose), OWNER-MORNING |
| `meetings` | `*/15` | every 15 min | — | DEPLOY step 7, OWNER-MORNING |
| `health` | 20:00 | 01:30 | 23:00 | DEPLOY table |
| `task-reminders` | 02:30 | 08:00 | 05:30 | README, DEPLOY, STATUS |
| `follow-up-reminders` | 02:45 | 08:15 | 05:45 | README, DEPLOY, STATUS |
| `folio` | 03:30 | 09:00 | 06:30 | README, DEPLOY, STATUS |
| `billing` | 03:45 | 09:15 | 06:45 | DEPLOY |
| `trial-reminders` | 04:00 | 09:30 | 07:00 | README, DEPLOY, STATUS |
| `lifecycle` | 04:30 | 10:00 | 07:30 | README, DEPLOY |

Conflicts:
- **DEPLOY (f)4** says "registers **six** daily jobs" and then tables 7. Its troubleshooting says Cron Jobs "must list **four** jobs"; Vercel will show 21. STATUS "Deploying to Vercel" lists 4. README says `vercel.json` holds "the daily cron jobs" and omits `posts`, `meetings`, `health` and `billing`.
- **Vercel plan.** Vercel's current docs (checked 11 Oct) allow 100 crons on every plan. On **Hobby, any expression that runs more than once a day fails the deployment** ("Hobby accounts are limited to daily cron jobs"). Three places in DEPLOY say instead that Hobby "runs each job once a day" or "schedule it from an external cron":
  - (f)4: "On the Hobby plan Vercel runs each job once a day";
  - the automations note: "on Hobby, schedule it from an external cron";
  - the troubleshooting section.

  **On Hobby the whole deploy fails,** so Pro is mandatory as `vercel.json` stands. DEPLOY (h) Costs already assumes Pro, and OWNER-MORNING item 3 says Pro. DEPLOY (i) also says 300 s is "the most the Hobby plan allows", which suggests Hobby is an option.
- The `meetings` purge runs in the 15-minute job. `env.ts` and the README call it "the daily job" or "daily retention purge".
- `/api/folio/cron` (POST, HMAC of `APP_SECRET`) and `/api/cron/folio` (GET, `CRON_SECRET`) run the same job under two auth schemes. A second `isCronAuthorised` with a different signature lives in `modules/folio/collections/system.ts` (C-21).

---

## 5. External services

| Service | Env vars | Inbound URL (webhook or callback) | Status at launch | Docs |
|---|---|---|---|---|
| Vercel (hosting, cron) | `CRON_SECRET`; system vars | `/api/cron/*` | **Required (Pro)** | DEPLOY (f) |
| MongoDB Atlas | `MONGODB_URI`, `MONGODB_DB` | — | **Required** (replica set, M10 for backups) | DEPLOY (a) |
| Cloudflare R2 / AWS S3 | `STORAGE_DRIVER`, `S3_*` | Bucket CORS `PUT` from `APP_URL` (recordings) | **Required on Vercel** | DEPLOY (b); CORS only in step 7 |
| Resend (send) | `RESEND_API_KEY`, `MAIL_FROM`, `RESEND_WEBHOOK_SECRET` | `/api/webhooks/resend` (sent, delivered, opened, bounced, complained) | **Required for real use** | DEPLOY (c) **does not cover the webhook or its secret** |
| Resend (inbound) | `INBOUND_EMAIL_DOMAIN`, `INBOUND_EMAIL_SECRET` | `/api/inbound/email` (`email.received`) | Optional | DEPLOY (e4) |
| Resend (domains API, custom sending domains) | `RESEND_API_KEY` | — | Optional add-on | DEPLOY step 8 |
| Google OAuth (sign-in) | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | `/api/auth/google/callback` | Optional | DEPLOY (d) |
| Google Calendar and Gmail send/read | same + `APP_ENCRYPTION_KEY`, `GMAIL_REPLY_DETECTION` | `/api/integrations/google/callback` | Optional; `gmail.readonly` hidden until CASA | DEPLOY (d), step 8 |
| Razorpay (Flowbit's own billing) | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | `/api/subscription/razorpay/webhook` | Required to charge | DEPLOY (e) |
| Razorpay (each workspace's own) | stored per workspace, sealed with `APP_ENCRYPTION_KEY` | `/api/webhooks/razorpay/<hook>` | Optional per workspace | DEPLOY (f)4 notes |
| Interakt (WhatsApp A: Flowbit's own numbers) | `INTERAKT_API_KEY`, `INTERAKT_OTP_API_KEY`, `INTERAKT_WEBHOOK_SECRET` | `/api/webhooks/interakt?token=…` | **Hidden** (`FEATURE_WHATSAPP`) | DEPLOY (e2), WHATSAPP-TEMPLATES |
| Interakt (WhatsApp B: a workspace's own number) | per workspace, sealed | `/api/webhooks/whatsapp/<hook>?token=…` | **Hidden** | DEPLOY (e3) |
| Anthropic | `ANTHROPIC_API_KEY` | — | Optional | DEPLOY (f)3 |
| Sarvam (speech to text) | `SARVAM_API_KEY` | `/api/webhooks/sarvam` (per-job token) | Optional (Meetings AI add-on) | DEPLOY step 7 |
| Recall.ai (notetaker) | `RECALL_API_KEY`, `RECALL_REGION`, `RECALL_WEBHOOK_SECRET` | `/api/webhooks/recall` | Optional | DEPLOY step 7 |
| Slack | `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_SIGNING_SECRET` | `/api/slack/commands`, `/api/slack/interactions`, `/api/integrations/slack/callback` | Optional | DEPLOY (e4), manifest |
| Klipy (GIFs) | `KLIPY_API_KEY` | — (proxy `/api/work/gifs`) | Optional | DEPLOY table only |
| IndiaMART | `INDIAMART_API_URL`; per-workspace key | — (pull, `lead-sources` cron) | Optional (beta) | DEPLOY table |
| GSP (e-invoice) | per GST entity, sealed | — | Optional, sandbox first | DEPLOY step 8 |
| Vercel Domains API | `VERCEL_DOMAINS_API`, `VERCEL_API_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID` | — | Optional | DEPLOY step 8 |
| Lead capture (website form, webhook) | none (per workspace key) | `/api/public/leads/<key>`, `/api/webhooks/leads/<key>`, `/embed.js` | Built-in | DEPLOY (f)4 notes |
| Claude / ChatGPT (MCP) | none | `/mcp`, `/oauth/*`, `/.well-known/*` | Built-in | README, DEPLOY (e4) |
| Outbound webhooks (Zapier, Make, …) | none (`APP_ENCRYPTION_KEY`) | — (Flowbit posts out) | Built-in | DEPLOY (e4) |

The DEPLOY opening table names only 6 services (Vercel, Atlas, R2, Resend, Google, Razorpay); this list has about 20. The HANDOVER says "external services are tested only with mocks" and lists 9. There is no single table like this one in any doc.

---

## 6. Conflicts and fixes

| # | Sev | Where | Conflict | Fix |
|---|---|---|---|---|
| C-01 | M | README folder layout | It lists `app/platform/` ("Flowbit staff admin"), which no longer exists. It omits `console/`, `portal/`, `mcp/`, `oauth/`, `a/`, `bill/`, `d/` and `p/`. Under scripts it lists 4 of the 13 | Regenerate the layout and the scripts table from the tree |
| C-02 | **H** | DEPLOY (f)4, (i); STATUS; README | Cron count given as 6, 4 or "daily"; `vercel.json` has 21 entries, 7 of them sub-daily | One cron table (section 4 above) in DEPLOY; delete the counts elsewhere |
| C-03 | **H** | DEPLOY (f)4, automations note, (i) | Says Hobby "runs once a day" or "use an external cron". On Hobby, `vercel.json` **fails to deploy** | State "Pro required" at the top of (f). Remove the Hobby advice. If Hobby must be supported, ship a `vercel.hobby.json` |
| C-04 | **H** | DEPLOY (f)3 | `APP_ENCRYPTION_KEY` is labelled "for payment links, WhatsApp and the Console", and env-check only warns. In practice the Console is unusable without it (staff TOTP), and so are Google, Slack, webhooks and GSP | Mark it **Required**. Consider moving it into `productionEnvProblems` |
| C-05 | M | HANDOVER "Read first" | Says DEPLOY covers "migrations in order". DEPLOY never mentions `migrate-account-types`, `migrate-post-types` or `folio-long-series` | Add the run order (section 3) to DEPLOY (f)7 |
| C-06 | **H** | DEPLOY (f)5 step 5 vs `migrate-staff.ts` vs `setup-prod.ts` | DEPLOY says run `migrate-staff --env-file=.env.setup.local`, then `--apply --founder=…`, and that "Admins who had a password keep it". The script carries **no** password over and only creates the founder by default. `setup-prod` already creates the founder as Console Admin, so on a fresh DB `migrate-staff` is redundant | Rewrite step 5: "Fresh DB: skip, setup:prod made you the Console Admin. Restored v1 DB only: run migrate-staff". Fix the password sentence |
| C-07 | M | `env-check.ts`, `setup-prod.ts`, DEPLOY (f)3 | `DEFAULT_MAIL_DOMAIN='@flowbit.app'` and the setup-prod fallback `no-reply@flowbit.app` do not match the env.ts default `no-reply@useflowbit.com`. The "MAIL_FROM not your verified domain" warning never fires on the real default. DEPLOY says "the default `@flowbit.app` is refused by Resend" | Derive both from `SITE_DOMAIN`. Warn when `MAIL_FROM` equals the env default. Fix the DEPLOY wording |
| C-08 | M | README §5 "Logins"; DEPLOY (f)7 | "owner (also platform admin)" and "first owner and Flowbit platform admin": the concept was replaced by Console staff with separate sign-in and 2FA | Say "Console Admin (separate sign-in at /console, 2FA)" |
| C-09 | L | README env table | Missing `FEATURE_WHATSAPP`, `FLOWBIT_HOUSE_ORG_SLUG`, `RETENTION_PRUNE_ENABLED` and `KLIPY_API_KEY` | Add them, or replace the table with "see `.env.example`" (one source) |
| C-10 | M | DEPLOY (f)3 | Missing `RESEND_WEBHOOK_SECRET` (env-check warns about it), `FLOWBIT_HOUSE_ORG_SLUG` and `FEATURE_WHATSAPP` ("leave unset"). Also `PORTAL_CNAME_TARGET`, `VERCEL_*` and `GMAIL_REPLY_DETECTION` appear only in an appendix | Add the rows. Add the Resend webhook step to (c) |
| C-11 | M | DEPLOY structure | The v2.2 "Step 7" and "Step 8" owner setups are appended **after** Troubleshooting. "Run setup:prod after this step" is repeated 7 times across (e3), (e4), (f)4 and step 7/8, written for an incremental 8–9 Oct rollout. A fresh deploy needs it once | Fold the step 7/8 items into (b), (c) and (e). Keep one "re-run setup:prod after any deploy that adds a model" rule |
| C-12 | M | STATUS "Deploying to Vercel" | Its env table covers about 20 of 59 vars; the cron list has 4; the header says "As of 3 Oct"; the summary says 768 tests (now 2,819+) | Delete that section (point to DEPLOY). Rewrite the summary |
| C-13 | M | DEPLOY (f)3 `APP_SECRET` | Says "changing it signs everyone out". It also changes every email-to-task address, the Folio self-host cron token and OTP hashes. (e4) mentions the addresses, (f)3 does not | One "never rotate casually" box covering `APP_SECRET` and `APP_ENCRYPTION_KEY` |
| C-14 | M | `.env.example` | `MAX_UPLOAD_MB=10` is pre-filled. An owner who pastes the whole example into Vercel (DEPLOY invites "paste a whole block") gets a failed build | Leave it blank in the example, with a comment |
| C-15 | L | migration doc, DEPLOY | Env file names `.env.prod.local`, `.env.setup.local` and `.env.migrate.local` | Use `.env.setup.local` everywhere |
| C-16 | M | OWNER-MORNING vs DEPLOY vs `.env.example` | `APP_ENCRYPTION_KEY` is "`openssl rand -hex 32`" in one place and "`-base64 32`" in two others. Both parse, but the owner will doubt one of them | Pick base64 and note "hex also accepted" |
| C-17 | M | README §2 "The app uses the database `flowbit` only"; `.env.example` "(always flowbit)" | There are 3 local Flowbit DBs plus `flowbit_v2dev` (created and dropped by tests). Seed supports `SEED_ALLOW_DB` | Explain: `flowbit` = dev; others = QA (see section 7) |
| C-18 | L | README "`--reset` drops the flowbit database"; seed log | It drops `MONGODB_DB`; the log line hardcodes "flowbit" | Print the real DB name |
| C-19 | L | flags | Truthy parsing differs; `MEETINGS_PURGE` is called "daily" but runs every 15 min | One `envFlag()` helper; fix the wording |
| C-20 | M | `specs/notifications-v2.md`, `specs/console.md`, `V2-PLAN.md`, memory | The WhatsApp provider is "own Meta Cloud API" (console), "BSP Gupshup/360dialog" (notifications-v2) or Interakt (code, DEPLOY, templates). notifications-v2 says "Nothing is built yet" | Banner on both specs: "Built on Interakt; hidden behind FEATURE_WHATSAPP" |
| C-21 | L | `/api/folio/cron`, `scripts/folio-cron.ts`, `modules/folio/collections/system.ts` | A second cron endpoint and auth scheme for self-hosting. Two exported `isCronAuthorised` functions with different signatures. The script has no `--env-file` | Drop the HMAC route and point `folio-cron.ts` at `/api/cron/folio` with `CRON_SECRET`, or rename the helper |
| C-22 | L | `next.config.ts` | `outputFileTracingIncludes['/platform/**']` is left over; `/platform` is now only a redirect in `lib/console/host.ts` | Remove the entry. Keep the redirect |
| C-23 | **H** | `migrate-*` scripts | They fall back to `.env.local` (the laptop DB) when `--env-file` is forgotten. `migrate-storage` writes by default; the others are dry-run by default | Require `--env-file` whenever `--apply` is passed, or print the DB host and ask for confirmation. Make `storage:migrate` dry-run by default |
| C-24 | M | handover vs local demos | HANDOVER "Run locally" and README give no hint that indexes are built only in dev (`autoIndex` is off when `NODE_ENV=production`), so `npm run start` locally needs `setup:prod -- --allow-local` | Add one line to README |
| C-25 | M | launch.json, STATUS, NIGHT-11OCT-VERIFY, OWNER-MORNING | The docs say 4500 serves `.next-night7`; it serves `.next-night8`. The launch config `flowbit-v2` (4300, `.next-v2`, `flowbit_v2demo`, built 8 Oct) is stale. There is no launch entry for 4500. OWNER-MORNING says 4100, 4300 and 4400 are running; none are | See section 7 |
| C-26 | L | repo hygiene | `.next-check` (600 MB), `.next-v2` (601 MB) and `.next-night8` (755 MB) are in the project. They are git-ignored and eslint-ignored, but `tsconfig.json` only excludes `.next-deploy`, so `tsc` picks up their `types/*.ts`. HANDOVER says "never leave stray `.next-*` folders" | Add `.next-*` to the tsconfig `exclude`. Delete the stale dirs (with the owner's approval) |
| C-27 | L | `~/Downloads` | Four Flowbit zips (`flowbit-deploy.zip` 3 Oct, `flowbit-main.zip` 8 Oct, `flowbit-v2-build-20261010.zip`, `…handover-20261011-0149.zip`). STATUS names `…-0145.zip`, which does not exist | Keep only the latest; fix STATUS |
| C-28 | L | dead or dormant code | About 79 WhatsApp files (about 4,000 lines) sit behind `FEATURE_WHATSAPP`. `MANAGED_MODE_AVAILABLE` is a hard-coded false. `docs/_workflows/*.js` hold build orchestration from 1 Oct | Keep the WhatsApp code (it is a product decision), but list it in START-HERE as "dormant". Archive `_workflows` |
| C-29 | L | naming | "Email log" (SPEC, FOUNDATION, DEPLOY (c) and (i), FEATURES) vs "Messages log" (UI, README, `.env.example`). "Flowbit Technologies" (SPEC, FOUNDATION, console spec) vs Sanskaar Webx Services LLP | Search and replace |
| C-30 | L | `check:hex` | Exists, but it is not in the README scripts table and nothing runs it (no CI) | Add it to the README. Add a minimal CI (`tsc`, `test`, `lint`, `check:hex`) |

---

## 7. Demo and dev environments (as found on 11 Oct, about 02:00 IST)

| Port | Launch config | Serving now | DB | Verdict |
|---|---|---|---|---|
| 4100 | `flowbit` (dev), `flowbit-prod` (start) | nothing | `flowbit` (12 MB, 1 org, the seeded `vistaar`) | **The newcomer's environment.** `npm run dev` |
| 4200 | `finance-page` | nothing | — | Not Flowbit (launch kit calculator) |
| 4300 | `flowbit-v2` (`.next-v2`, `flowbit_v2demo`) | nothing | `flowbit_v2demo` (17 MB) | **Stale.** The build is from 8 Oct |
| 4400 | none | nothing | `flowbit_v2demo` (`.next-check`) | **Stale.** 8 Oct owner demo |
| 4500 | none (`.local-test/serve-night8.sh`) | `next start`, `.next-night8`, started 01:48 | `flowbit_v2night` (19 MB) | **Live.** The latest QA demo; git-ignored scripts |
| — | — | — | `flowbit_v2dev` | Not present. Created and dropped by smoke tests |
| — | — | — | `billingos`, `billingos_zipcheck`, `peopleos` | Other apps (BillingOS, Muster) |

Recommendation:
- **Newcomer:** `flowbit` + `npm run dev` on 4100. Nothing else.
- **Owner demo:** promote 4500 into `launch.json` as `flowbit-demo`, with `NEXT_DIST_DIR=.next-demo` and `MONGODB_DB=flowbit_v2night`. Rename the DB `flowbit_demo` when convenient.
- **Retire:** the `flowbit-v2` launch config, `.next-v2`, `.next-check` and, once the owner agrees, the `flowbit_v2demo` DB.
- The docs should name the environments by role (dev, demo, QA scratch), not by night number.

---

## 8. Proposed docs structure

```
README.md                      what Flowbit is, stack, run locally, scripts, env (link to .env.example)
CHANGELOG.md
docs/
  START-HERE.md                NEW (outline below)
  STATUS.md                    SHORT: current state, open items, owner decisions (≤150 lines)
  OWNER-TODO.md                NEW: replaces OWNER-MORNING-9OCT (live checklist)
  DEPLOY-VERCEL.md             rewritten: Pro required, one cron table, one env table, one run order
  SERVICES.md                  NEW: section 5 table (services, env, webhooks, status)
  FEATURES.md   SPEC.md   DESIGN.md   FOUNDATION.md
  specs/       console.md  notifications-v2.md  mcp.md
  migrations/  2026-10-folio-16-char-numbers.md  (+ one file per future data migration)
  qa/          NIGHT-11OCT-VERIFY.md  TEST-10OCT-R1.md  R2.md  R3.md
  setup/       SLACK-APP-MANIFEST.yml
  whatsapp/    WHATSAPP-TEMPLATES.md  WHATSAPP-TEMPLATES-CUSTOMER.md  (dormant)
  legal/       BREACH-RUNBOOK.md  CA-QUESTIONS.md
  design/      (unchanged)
  archive/
    BUILD-LOG-1-11OCT.md       (STATUS.md step log, verbatim)
    V2-AUDIT.md  V2-PLAN.md  V2-RESEARCH.md  V2-REVIEW.md  V2-CHECK.md
    V2-NIGHT-CHECK.md  V2-RECHECK-10OCT.md  BROWSER-CHECK-9OCT.md
    REVIEW-8OCT.md  REVIEW-8OCT-PLAN.md  OWNER-MORNING-9OCT.md  PORT-ZIP-PERF-PROMPT.md
    porting/  work.md  muster.md  orbit.md  folio.md  platform.md
    _workflows/  phase*.js
```

### `docs/START-HERE.md` outline

1. **What Flowbit is**, in 5 lines: four products, Console and portal; the legal entity is Sanskaar Webx Services LLP.
2. **If you are the developer**:
   - run locally: replica set, `.env.local` with 4 values, `db:seed`, `dev` on 4100;
   - checks: `tsc` with a 3 GB heap, `test`, `lint`, `check:hex`, `build`;
   - the 5 architectural rules (tenancy `ctx.db`, catalog, `action()`, paise, IST dates) with links to FOUNDATION.
3. **If you are deploying**: read DEPLOY-VERCEL. Pro plan required. The production run order is 6 steps (section 3 above).
4. **Environments**: dev `flowbit`/4100, demo `flowbit_v2night`/4500, nothing else. Never seed production.
5. **Secrets you must never rotate casually**: `APP_SECRET` and `APP_ENCRYPTION_KEY`, and what breaks if you do.
6. **Switches off at launch**: the flags table (section 2).
7. **Dormant code**: WhatsApp (Interakt) behind `FEATURE_WHATSAPP`; Flowbit-managed WhatsApp mode; `GMAIL_REPLY_DETECTION`.
8. **Where things are**: one line per doc in the tree above. "Archive is history; never act on it."
9. **Open items**: a link to STATUS "Open" and OWNER-TODO; QA reports for detail.
10. **Gotchas**:
    - stray `.next-*` dirs;
    - a broken Turbopack cache: delete the dist dir;
    - `next start` locally needs `setup:prod -- --allow-local` for indexes;
    - one heavy process at a time on 8 GB machines.
