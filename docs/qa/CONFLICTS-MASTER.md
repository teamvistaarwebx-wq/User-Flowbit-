# Overlaps and conflicts: master list (11 Oct 2026)

Three read-only audits feed this list. Each audit has its own detail file:

| Audit | File | Items |
|---|---|---|
| A. Concepts, navigation, naming | `CONFLICTS-A-CONCEPTS.md` | 25 items, plus 13 unexplained concepts |
| B. Rules, promises, numbers | `CONFLICTS-B-RULES.md` | 39 conflicts in 4 risk tiers |
| C. Docs, ops, config | `CONFLICTS-C-OPS.md` | 30 items, a docs inventory, an env matrix, script order |

## 1. Owner decisions needed first

These are about money, legal promises or positioning.

| # | Decision | Source |
|---|---|---|
| D1 | **Yearly price.** Code charges 12× monthly with 50% off year 1. The campaign, decks, PDFs and finance docs say 10× ("2 months free"). | B1, B13 |
| D2 | **Free vs Trial on the website.** The hero says "15-day trial" for everyone, but teams of 5 or fewer start on 6 months Free. Locked product pages offer a separate 14-day trial. | A2, B6, B13, B23, B24 |
| D3 | **Staff masking of salary, bank and PAN.** Admin staff see these unmasked. The FAQ, DPA and manual disagree with each other. | B5 |
| D4 | **Deletion promises.** Owner-deleted workspaces are never purged (not built). Unpaid-workspace deletion and log pruning run dry-run only, while the Terms, DPA and FAQ promise them. | B2, B3, B4 |
| D5 | **Trial limit.** Trial is once per workspace, but the Terms say once per business. | B6 |
| D6 | **HR executive sees all salaries.** The docs say they should not. | B15 |
| D7 | **Folio limit.** Folio's 3-user limit cannot be raised, which forces Suite. | B11 |
| D8 | **GST before GSTIN.** 18% GST is charged before Flowbit has a GSTIN, and the invoice shows DRAFT. Needs the CA. | B8 |
| D9 | **Free gets paid add-ons** (portal, domains). The spec says it should not. | B12 |
| D10 | **Docs and environment clean-up.** START-HERE, archive old docs, delete stray build folders and old zips. | C |

## 2. I can fix these without a decision

### Wording, names and navigation

- **Billing:** rename the duplicate "Billing" pages, or merge Subscription and Billing. (A6)
- **Product names:** use "Muster" consistently in the rail and pages, and give "Orbit" one home name. (A7)
- **Two profiles:** label them "My login" and "My employee record". (A4)
- **Notifications:** give the two "Notifications" pages distinct titles, and explain digest vs brief. (A3)
- **Import:** one entry point per importer. (A9)
- **Nav labels:** "Work reports"; add the Compliance link for Finance; rename "Create new project". (A10)
- **Tax forms:** write "Form 130 (earlier Form 16)" and "Form 138 (earlier 24Q)". (A16, B32)
- **Company details:** one source of truth for company details and signatories, with read-only views and links from the other places. (A1)
- **Working hours:** one field, edited in one place. (A13, B27)
- **Birthday recipe:** fix the name, or what it does. (A5)
- **Approvals inbox:** one page that lists every pending approval. (A11)
- **Explainers:** add short explainers for the 13 unexplained concepts. (A, end of file)

### Rules and copy

- **"Renews automatically / retried 7 days":** reword so it matches how billing really works. (B7)
- **Supplier name:** use the LLP name everywhere. Correct the BRIEF never-claim list. (B9, B31)
- **Seat counting:** match the docs to the code, or the code to the spec. (B10)
- **Upload and row limits:** one table of real numbers, used everywhere. (B25, B26)
- **Privacy, sub-processors, data location:** align the copy. (B19–B21)
- **Email action links:** document the sign-in rule. (B22)
- **WhatsApp:** "coming soon" everywhere; one rate card. (B16, B17)

### Ops (from audit C)

- **Vercel Pro:** state that it is required; sub-daily crons fail on Hobby.
- **Cron count:** fix the number in the docs.
- **`APP_ENCRYPTION_KEY`:** make it a required, blocking check in production.
- **Migrate scripts:** refuse to run without an explicit `--env-file`. `storage:migrate` becomes dry-run by default.
- **Deploy run order:** a full ordered list, including `migrate-account-types`, `migrate-post-types` and `folio-long-series`.
- **Env docs:** add the missing variables. Fix the `MAIL_FROM` check (`flowbit.app` should be `useflowbit.com`).
- **Docs:** `START-HERE.md`, a short `STATUS.md`, an `archive/` folder, and a refreshed `FEATURES.md`.
- **Launch config and tsconfig:** remove the stale 4300 config; exclude `.next-*` in `tsconfig`.

## 3. Leave as is, or decide later

- **Spaces vs Teams vs Projects:** explain them in the UI rather than merge. (A12)
- **Three automation engines:** acceptable for now. Each one gets a one-line "what is this" note. (A5)
- **Claims vs Expenses vs Receipts:** naming help only. (A14)
- **Launch dates and January 2027 pricing:** these are campaign decisions. (B37, B38)
