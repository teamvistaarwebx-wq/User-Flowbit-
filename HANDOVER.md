# Flowbit: developer handover

Copy this file to the top of every handover zip. It replaces the hand-written `HANDOVER.md` of earlier zips.

## What a handover zip holds

- `flowbit/`: the full source at the commit named in the zip's file name or `git log -1`.
- `flowbit.bundle`: the full git history (`git clone flowbit.bundle flowbit-repo`).
- No secrets: no `.env.local`, no login files, no keys.

## Read first

1. **[`docs/START-HERE.md`](docs/START-HERE.md)**: what Flowbit is, how to run it, the environments, the secrets you must never rotate, the switches that stay off, and a map of every doc (current vs archive).
2. `AGENTS.md`: this Next.js version has breaking changes; read `node_modules/next/dist/docs/` before using framework APIs.
3. `README.md`: setup, scripts and the env summary.
4. **[`docs/DEPLOY-VERCEL.md`](docs/DEPLOY-VERCEL.md)**: the production deploy. **The Vercel Pro plan is required**: `vercel.json` has 21 cron entries, 7 of them every 5 or 15 minutes (`messages`, `automations`, `posts`, `sequences`, `briefs`, `lead-sources`, `meetings`), and Vercel refuses the whole deployment on Hobby. DEPLOY (f) step 4 lists every cron with its schedule; (f) step 7 is the ordered production run list.
5. `docs/STATUS.md` (current state, short), `docs/OWNER-TODO.md` (every key, DNS, CA, lawyer and decision still open), `docs/FEATURES.md` (what is built).
6. `docs/qa/`: test reports with a status column per finding.

## Run locally

```bash
cd flowbit
npm ci
cp .env.example .env.local   # set APP_SECRET (openssl rand -base64 48); MongoDB must be a replica set
npm run db:seed -- --reset   # demo workspace "vistaar"; logins in seed-logins.local.md
npm run dev                  # http://127.0.0.1:4100
```

## Checks

```bash
NODE_OPTIONS=--max-old-space-size=3072 npx tsc --noEmit
npm test -- --maxWorkers=2
npx eslint
NODE_OPTIONS=--max-old-space-size=3072 npm run build
```

## Things to know

- **`APP_ENCRYPTION_KEY` is required in production**, like `APP_SECRET`, `CRON_SECRET` and the S3 variables: a deployed server refuses to start without it.
- **Data scripts need an explicit target.** `migrate-*`, `storage:migrate` and `folio-long-series` refuse to run without `--env-file=<file>` or `--db=<name>`, and write nothing without `--apply`.
- **WhatsApp is built but hidden** (Interakt, behind `FEATURE_WHATSAPP`, off).
- **Deleting jobs:** workspace deletion and log pruning run for real on a deployed production server (`LIFECYCLE_DELETE_ENABLED=false` / `RETENTION_PRUNE_ENABLED=false` are kill switches) and as dry runs locally, in dev and on previews. The meeting purge stays a dry run until `MEETINGS_PURGE` is set.
- **External services are tested with mocks only** (Interakt, Razorpay, Google, Slack, Sarvam, Recall, GSP, Klipy, Resend inbound). Check each with real keys before going live.
- **Build folders:** never leave stray `.next-*` folders in the project. If `next/font` fails, delete the dist folder and rebuild.
