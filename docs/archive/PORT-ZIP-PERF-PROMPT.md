# Prompt: port the 5 Oct zip's performance work into v2

Copy everything below the line into a new Claude Code session opened in `/Users/sanskaarsingh/Downloads/Vistaar (HRMS)/flowbit`.

---

## Context

`~/Downloads/flowbit-main.zip` is a copy of Flowbit from **5 Oct 2026, 19:43**. It is OLDER than this repo: it predates commit `b972907` ("baseline before v2 build", 7 Oct) and the whole v2 build after it (entitlements, Free plan, notifications, WhatsApp, Console, billing, DPDP, the v2 review fixes).

The zip is close to `b972907`, differing in 52 files. Most of those differences are places where the zip is simply behind. **Only the performance work listed under "Port these" is new.** Port that work into the current HEAD by hand. Never copy whole files from the zip over this repo, and never take anything from "Do NOT take".

Extract the zip into a fresh scratch folder (not inside the repo), then compare it against the baseline:

```bash
mkdir -p "$SCRATCH/zip" "$SCRATCH/base"
unzip -q ~/Downloads/flowbit-main.zip -d "$SCRATCH/zip"
git archive b972907 | tar -x -C "$SCRATCH/base"
diff -ru "$SCRATCH/base/src" "$SCRATCH/zip/flowbit-main/src"
```

**Before you start:** the working tree already has uncommitted edits to Clients, Projects, `color-swatches`, `tasks/types.ts` and `models/Client.ts`. They belong to other work, so don't touch or commit them. Commit only the files this port changes.

## Port these (zip → current HEAD)

### 1. Section loading skeletons (new files)

Create `loading.tsx` in each of `src/app/app/{work,hr,me,orbit,clients,folio,settings}/`:

```tsx
/** Skeleton while a <section> page loads, so navigation inside the section responds at once. */
export { default } from '@/app/app/loading'
```

`src/app/app/loading.tsx` already exists. Also consider `notifications/` and `whatsapp/` (both are new in v2). Add a file only where the section has server-rendered pages that await data.

### 2. Sign-in path: read session, user and workspace in parallel

**`src/lib/auth/session.ts`**
- Split out `getSessionRecord = cache(async () => SessionRecord | null)`. It reads the cookie, runs `dbConnect()` and calls `loadSession(hashToken(token))`.
- `getSession` calls `getSessionRecord()`. It then runs `loadUser(session.userId)` and the sliding-expiry `Session.updateOne` (only when `lastSeenAt` is older than `SLIDE_AFTER_MS`) together in one `Promise.all`, instead of one after the other.
- Keep everything v2 added in this file: `recordUsage({ kind: 'login', ... })`, `markEmailVerified`, and the removal of `grantListedPlatformAdmin`.

**`src/lib/ctx.ts`**
- Add `loadCustomRoles(orgId)` and `loadWorkspace(orgId, userId)`. The latter loads `loadMember`, `loadOrg` and the custom roles in one `Promise.all`, and returns null when the user isn't a member or `org.deletedAt` is set.
- `getCtx`: call `getSessionRecord()` first. If `record.activeOrgId` is set, run `loadWorkspace(record.activeOrgId, record.userId)` in parallel with `getSession()`. Fall back to `pickMembership` only when that returns null.
- `pickMembership`: try `user.lastOrgId` through `loadWorkspace`, but only when it differs from `session.activeOrgId` (the active org was already tried). Then fall back to the oldest active membership. Return `customRoles` too.
- **v2 difference:** `getCtx` now also loads `loadPlanConfig()` (Console settings) and passes `config` to `buildCtx`. Start `loadPlanConfig()` at the beginning, in parallel with the session and workspace reads, so it doesn't run serially at the end. Keep `entitlements`, `planConfig`, `isBlocked` and the `ent.readOnly` checks exactly as they are.
- Remove the now-unused `dbConnect` import only if nothing else in the file uses it.

### 3. Home page streams its slow regions (`src/app/app/page.tsx`)

- Start every query at the top: `homeStats`, `homeProjects`, `myTaskCounts`, `assignedToMe` and `attendanceMonth`. Wrap each one in a `started()` helper that attaches a no-op `.catch`, so an early throw can't cause an unhandled rejection.
- Await only `workdayData`, `taskData` and the `hasContent` check before rendering the frame.
- Move the right column into an async `StatsColumn` component (stat cards plus the project or my-tasks overview, including the selected-project description read). Render it inside `<Suspense fallback={<StatsColumnSkeleton />}>`.
- Move the bottom row into an async `BottomRow` component ("Assign to me" plus "My attendance"). Render it inside `<Suspense fallback={<Skeleton className="mt-[5px] h-80 rounded-[10px]" />}>`.
- Render the Arc/stats grid whenever `work` is on, so the layout is known before data arrives.
- Wrap `AnnouncementPopupLoader` in `<Suspense fallback={null}>`.
- **v2 differences to keep:** `AttendanceCard` takes `breaks={mergeBreakPolicies(ctx.org.breakTypes)}`, `AssignedTable` takes the `quickAdd` prop, and `<SetupGuideCard ctx={ctx} />` must stay where v2 placed it. Pass whatever these need (`ctx`, `data`) into `BottomRow` and `StatsColumn`.

### 4. Work layout (`src/app/app/work/layout.tsx`)

Wrap `<AnnouncementPopupLoader ctx={ctx} />` in `<Suspense fallback={null}>`. Keep v2's `!isBlocked(ctx)` check, and don't go back to `ctx.access !== 'blocked'`.

### 5. Dashboard stats grouped in MongoDB (`src/modules/work/dashboard/`)

- `stats.ts`: add the optional weight `n` to `StatTask` (`const weight = (t) => t.n ?? 1`). Use it in `dailySeries` and `currentCounts`. Add `statWindow`, `boundaryInstant`, the private `bucketOf`, `statGroupStage`, `StatGroupRow` and `fromStatGroups`. Take these exactly from the zip.
- `queries.ts` (`homeStats`): replace the `.find().lean()` of every matching task with `ctx.db(Task).aggregate<StatGroupRow>([{ $match: <same filter> }, statGroupStage(span)])` followed by `fromStatGroups(groups, span)`.
- Check that `ctx.db(Model).aggregate` exists in `src/lib/db/scoped.ts` and adds the org filter itself. If it doesn't, put `orgId: ctx.orgId` in the `$match` explicitly. **Never run an aggregate without the org scope.**
- `stats.test.ts`: add the zip's "weighted rows" and "grouped stats (statGroupStage)" tests. The second one checks the grouped and ungrouped numbers on 600 random tasks.

### 6. Shell data (`src/components/shell/data.ts`)

Extract the workspace-switcher read into `memberOrgs(ctx)` (memberships, then live orgs). Use it inside `getShellData`'s `Promise.all`. This is a small refactor only. v2 has changed this file a lot, so keep everything else.

## Do NOT take from the zip

The zip is older on all of these. Keep the current repo's version:

- **Payroll and statutory rates:** `statutory.ts`, `timeline.ts`, `queries.ts`, `generate.ts`, `cycle-view.ts`, `seed-b.ts`, `settings-tabs.tsx`, `statutory-controls.tsx` and their tests. HEAD has the ₹25,000 EPF ceiling (S.O. 5109(E), 17 Sep 2026), `readStatutory`/`unreadable` blocking, and the "later-saved correction wins" ordering. The zip would put back the ₹15,000 default and silent fallbacks.
- **Legal and marketing:** `legal/*` (the DPA, DPDP wording, deletion after 90 days), `lib/company.ts` (Sanskaar Webx Services LLP, useflowbit.com), `env.ts` defaults, `invoice-pdf.tsx`, footer, pricing, FAQ, catalog, Folio copy, `mock-frame`, onboarding slug, and metadata. The zip says flowbit.app and "Flowbit Technologies", which is wrong.
- **Old admin:** `src/app/platform`, `src/modules/platform` and `src/components/platform`. Console replaced them in v2 step 5.
- **Email log:** `components/settings/email-log-list.tsx`. v2 step 2 replaced it.
- **`package.json` scripts:** the zip uses `--webpack` and port 4020. Keep `-p 4100` and `tsx scripts/check-env.ts && next build`. Don't add `--webpack` unless the owner asks.
- `skills-lock.json`, `README.md` and `package-lock.json`.

## Rules

- Follow `AGENTS.md` and `CLAUDE.md`. This Next.js version differs from older ones, so read `node_modules/next/dist/docs/` before relying on Suspense or `loading.tsx` behaviour.
- Never sign in with a password in automated checks. Verify server components by rendering them in a scratch vitest instead.
- Use only one browser at a time, because the Mac has 8 GB of RAM.
- Build gotcha: stray `.next-*` folders break Tailwind CSS, and a stale Turbopack cache causes `next/font` errors. Clear them if the build misbehaves.
- Make one commit per numbered item above, in the form `perf: <what>` (for example `perf: stream the home page stat column and bottom row`).

## Done when

1. `npm run typecheck`, `npm run lint` and `npm test` all pass, including the new stats tests.
2. A scratch vitest renders Home (with Work on and with Work off, as a member with and without `employeeId`) and gets the same cards as before.
3. `homeStats` returns identical numbers before and after the change on the demo database (run both versions once and compare the output).
4. You give a short report: the files changed, any v2 conflicts you resolved, and anything you skipped and why.
