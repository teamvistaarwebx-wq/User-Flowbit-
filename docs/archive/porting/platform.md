# Platform inventory: settings, subscription, platform admin, notifications, marketing content

Written 1 Oct 2026 by the platform reader agent. Builders use this file so they don't have to read the reference code themselves.

**Sources read in full:** `~/Downloads/Flow bite`, the draft Flowbit rewrite in Vite + Express + Mongo (8 commits, about 7,500 lines across `shared/`, `server/src/`, `client/src/`).
**Sources cross-checked** for the settings and marketing areas only:
- old Flowbit `~/Downloads/Vistaar (HRMS)/_ref/oss-main`: notifications, permission catalog, roles editor, invitations, settings pages
- Muster reference `~/Downloads/Personal work/vistaar-peopleos`: permission groups, roles actions, audit page, notifications, lifecycle statuses, letters list, README scope
- Billing OS `~/Downloads/Personal work/vistaar-billingos`: GST split, totals and rounding, FY numbering, state codes, README guarantees, known gaps
- CRM `~/Downloads/Code & Tools/Invoice builder Code/vistaar-crm`: `FLOW.md` and `README.md`

**Precedence:** if this file and `docs/SPEC.md` disagree, SPEC wins. Two markers flag places where this file goes beyond SPEC:
- **[proposal]**: something SPEC does not define (a field, a permission key, a model, a constant). The builder may adopt it or ask for a different one.
- **[needs foundation]**: work that must happen in a path only the foundation agent may edit (`lib/`, core `models/`, `components/shell`, `components/ui`, `globals.css`, `.env.example`).

---

## Contents

0. Agent split
1. What the draft is, file by file
2. Catalog, entitlements, access: the pattern to port
3. Tenancy, auth, sessions: lessons from the draft
4. Settings shell: layout, sub-nav, permissions
5. Page specs for `/app/settings/*`
6. Subscription and checkout
7. Roles and the permission matrix
8. Members and invites
9. Audit log
10. Notifications (`/app/notifications`)
11. Platform admin (`/platform/*`)
12. Shell behaviours ported from the draft: command palette, mobile nav, states (foundation reference)
13. Marketing site content (marketing agent)
14. Seed data for the settings area
15. Unit tests to write
16. Bugs, gaps and surprises in the reference code
17. Open decisions for the user and the foundation

---

## 0. Agent split

| Agent | Builds | Sections to read |
|---|---|---|
| **settings** | `src/app/app/settings/**`, `src/app/app/notifications/**`, `src/app/platform/**`, plus its server code under `src/modules/settings/**` **[proposal: SPEC names no modules folder for settings]**, components under `src/components/settings/**`, route handlers under `src/app/api/billing/**` and `src/app/api/settings/**` **[proposal: SPEC lists no API owner for these]** | 2–11, 14–17 |
| **marketing** | `src/app/(marketing)/**`: landing, pricing, `products/[slug]` (work, muster, orbit, folio), contact, `legal/*` | 13 (and 6.3, for the pricing calculator) |
| **foundation** | `lib/catalog.ts`, `lib/plans.ts`, `lib/permissions.ts`, `lib/ctx.ts`, `lib/actions.ts`, the shell, command palette, mobile nav, notification bell, check-in widget, `/invite/[token]` | 2, 3, 6.3–6.5, 7.1–7.2, 12, 17 (these are the hooks the settings agent depends on) |
| **muster-a/b, orbit, folio, work-a/b** | product pages | 6.4 (capacity checks they must call), 6.5 (read-only mode applies to their actions and public forms), 10.3 (notification kinds they emit) |

**Rule for the settings agent:** the pure billing functions `quote()`, `capacity()`, `accessLevel()`, `prorate()` and `subscriptionInvoiceTotals()` belong in `lib/plans.ts`, because other agents need them too (Muster must check employee capacity, every action must check read-only). If the foundation has not written them when the settings agent starts, the settings agent builds them in `src/modules/settings/billing/` to exactly the formulas in section 6 and lists the need in its final report.

---

## 1. What the draft is, file by file

`~/Downloads/Flow bite` is a margin-first agency tool. Its centre is a "client margin" board: revenue from contracts minus delivery cost (logged hours × cost rates derived from CTC), plus utilisation, burn-down and period close. Around that sit a Work module (tasks, projects, clients, teams, meetings, posts, whiteboards, timesheets), a light HR module (people, attendance, leave, policies) and an admin module (members, roles, integrations, audit, billing).

**What is worth porting:**
- **The catalog → nav / guards / entitlements derivation.** One object, and everything else is a projection of it.
- **The entitled / switched-on / available split.**
- **Tenant isolation, including the gotchas.** The draft worked through several failure cases.
- **Invite tokens stored as hashes.**
- **The audit diff idea.**
- **The command palette.**
- **The mobile drawer.**
- **The four UI-state primitives.**
- **The HTTP contract:** 401 sends the user to login, 402 shows an upgrade prompt, 403 shows a permission wall.

**What is not in SPEC (do not build it, do not market it):** the margin board, contracts, cost rates, CTC→hourly, utilisation, capacity, burn-down, period snapshots and locks, and "Insights". Also the light/dark theme toggle: Flowbit is dark only.

| File | What it does | Use in Flowbit |
|---|---|---|
| `shared/catalog.ts` (91 lines) | `FEATURES` map `{module, label, href, routes?, perm?}` for 19 features in 3 modules (work, hr, admin). `CORE` (never switchable): dashboard, members, roles, billing. `PRESETS` decides day-one density. `PERMISSIONS` (18 keys). `ROLES`: owner `'*'`, admin = all minus `billing.manage`, hr, lead, member. `ROLE_PERMS` is precomputed as Sets. | The pattern for `lib/catalog.ts`. Keys, modules and roles differ in SPEC (section 7 maps them). |
| `shared/plans.ts` (64) | `PLANS` trial/work/people/suite with per-seat price and limits (seats, projects, storageGb). Functions: `entitled`, `moduleOn`, `available`, `dormant`, `limitOf`, `seatsLeft`, `trialDaysLeft`. Per-org `grants`/`revokes` escape hatch. | The pattern for `lib/plans.ts`. Every price and limit is wrong against SPEC. Use SPEC section 4 and section 6 here. |
| `shared/access.ts` (34) | `canSee(actor, org, f)` = available && role has the feature's perm. `can(actor, p)`. `featureForPath` does longest-prefix route matching. `navFor` groups visible features by module. | Port the concepts (section 2). |
| `shared/health.ts`, `margin.ts`, `rates.ts`, `capacity.ts`, `margin.test.ts` | Project health score; margin engine; effective-dated rate table; working-day capacity | Health belongs to work-a. The rest is not in SPEC. |
| `server/src/db/tenant.ts` (69) | AsyncLocalStorage tenant context; Mongoose plugin that injects `orgId` into reads, aggregates, validate and insertMany; `asSystem()` | Lessons for `lib/db/tenant.ts` (section 3.1) |
| `server/src/middleware/gate.ts` (97) | JWT cookie auth; per-process org cache (30 s TTL, max 5,000); atomic `claimSeat`/`releaseSeat`; `requireFeature` → 402; `requirePermission` → 403; `capabilities()` for `/api/me` | Concepts. The seat counter is buggy (section 16). |
| `server/src/routes/auth.ts` (136) | signup (14-day trial, no transaction, manual unwind), login (same error for unknown email and bad password, multi-org chooser with HTTP 300), logout, invite (upsert by email, 7-day token), invite accept (atomic seat claim, creates identity if new) | Auth belongs to the foundation. Invite rules feed section 8. |
| `server/src/routes/settings.ts` (145) | members list/patch (role, active, fte), invite revoke, roles list (built-ins only), audit list (entity/actor filter, cursor), billing get, plan switch (no payment), integrations (Google count, Slack placeholder) | **Main settings reference** (sections 5, 7, 8, 9) |
| `server/src/routes/modules.ts` (49) | GET entitled features with on/locked; PUT preset or enabled list (refuses an empty set, merges CORE, audits) | Modules page (5.7) |
| `server/src/models/org.ts`, `identity.ts`, `user.ts`, `invite.ts`, `audit.ts` | Org (plan, grants, revokes, enabledFeatures, seatsUsed, trialEndsAt); global Identity (credentials); per-org User = membership (role, department, workMode, fte, ctcAnnual select:false, active); Invite (tokenHash unique, TTL index); Audit (before/after of changed keys only, fire-and-forget) | Mapping to SPEC's User/Member/Invite/AuditLog (sections 3, 8, 9) |
| `server/src/lib/mail.ts` (23) | Resend over fetch, or console.warn when no key; invite email template | SPEC `lib/mail` always writes Outbox |
| `server/src/lib/seed.ts` (27) | New org gets 3 spaces (Inbox, Client work, Internal) and 3 starter tasks | Onboarding idea (foundation/work-a) |
| `server/src/e2e.test.ts` (215) | Full-stack: signup, isolation (a second org sees 0 clients, gets 404 on a direct id, sees no entries), deletion refused when history exists, period lock | Port the isolation assertions (3.1) |
| `client/src/components/Shell.tsx` (163) | Nav built from features the server says are visible; collapse persisted; **mobile drawer**; plan/seat chip; ⌘K button; theme toggle; sign out | Foundation shell (section 12) |
| `client/src/components/Palette.tsx` (137) | **⌘K command palette** | Foundation (section 12) |
| `client/src/routes/Settings.tsx` (407) | Members, Roles, AuditLog, Billing, Integrations screens | Settings UI reference |
| `client/src/components/ui.tsx`, `overlay.tsx`, `states.tsx`, `form.tsx` | Button with busy state, Card, Chip tones, Stat tile, Avatar with stable hue, Meter with marker, Banner, Table; toasts that map error codes to messages; focus-trapped Dialog; Sheet; Skeleton/Empty/NoMatches/Failed/Stale; Field/Input/Select/Money (₹ in, paise out) | Foundation `components/ui` (section 12) |
| `client/src/lib/api.ts`, `session.tsx` | Fetch wrapper with the 401/402/403 contract; money/pct/hours formatters; `useCan(feature)` | Concepts |
| `Dashboard`, `Tasks`, `TaskSheet`, `People`, `Content`, `Clients`, `Projects`, `Margin`, `Timesheet`, `creators` | Work and HR screens | Other agents; marketing grounding (section 13) |

---

## 2. Catalog, entitlements, access: the pattern to port

The foundation owns this code. The settings agent consumes it.

### 2.1 The draft's pattern

`FEATURES` is the single list of what exists. Everything derives from it:
- **nav**: a feature the org can't use never renders, so it can never 404
- **route guards**: `featureForPath(path)` matches the longest prefix, so `/tasks/abc` resolves to `tasks` and `/settings/roles` beats `/settings`. It sorts every href and every `routes` entry (with `/:param` stripped) by length, longest first, and returns the first where `path === href || path.startsWith(href + '/')`.
- **the modules page**: everything entitled, with its switch state
- **the pricing page and the plan feature lists**
- **`/api/me` capabilities**: a boolean per feature, so the client never decides access itself (`useCan` is "never the mechanism, only the projection")

`CORE` features can never be switched off ("an org can't switch off the things the shell depends on"). Switching a module off never deletes data. It only stops rendering the entry point.

Three predicates, and every gate uses all three:
```
entitled(org, f) = !org.revokes.includes(f) && (PLAN_FEATURES[org.plan].has(f) || org.grants.includes(f))   // sold
moduleOn(org, f) = CORE.includes(f) || enabledFeatures is empty || enabledFeatures.includes(f)               // switched on
available(org, f) = entitled && moduleOn                                                                      // the gate
dormant(org)     = features that are entitled && !moduleOn                                                   // what Settings → Modules offers
canSee(actor, org, f) = available(org, f) && (!FEATURES[f].perm || ROLE_PERMS[actor.role].has(perm))
```

### 2.2 How it maps to Flowbit

SPEC switches the unit from features to **products** (`work | muster | orbit | folio`, plus `core` which is always on). It keeps per-feature `perm` and `href` in the catalog.

```
entitledProducts(org, now):
  if org.disabled                       → none            (platform disabled the workspace)
  level = accessLevel(org.subscription, now)              (section 6.5)
  if level === 'blocked'                → none            (only Settings → Subscription renders)
  eff = effectiveStatus(org.subscription, now)
  if eff === 'trialing'                 → { work, muster:'business', orbit, folio }   (trial of everything)
  if eff === 'expired'                  → the products of the last plan (read-only still shows data; for a never-paid trial, all four)
  else                                  → from subscription.products: work (bool), muster ('starter'|'business'|null), orbit (bool), folio (bool)

ctx.has(p)        = p ∈ entitledProducts && org.enabledProducts.includes(p)
hasPayroll(ctx)   = ctx.has('muster') && musterTier === 'business'    // Muster Starter excludes muster.payroll features
ctx.can(perm)     = permission check only (section 7); action() checks perm and product together via opts
```

**Fix the draft's upgrade bug.** In the draft, once `enabledFeatures` is non-empty, a feature newly added by a plan upgrade is not in the list, so it stays silently off ("dormant") after the customer pays for it. In Flowbit:
- When a product becomes newly entitled (subscription activated, upgraded, or changed by the platform), **add it to `Org.enabledProducts` in the same write**.
- Losing entitlement does **not** remove it from `enabledProducts`. If the customer buys it again, it comes back in the state they left it.

### 2.3 Locked products: 402, not 403

The draft's server returns `402 upgrade_required` with the feature key, and the client renders an upgrade prompt, not an error. Flowbit's equivalent:
- **Rail:** a locked product shows a small lock and opens the **upgrade dialog** (foundation shell). Dialog content:
  - Title: "{Product} isn't in your plan".
  - One line on what the product does (catalog description).
  - The price line from `lib/plans`, for example "₹149 per sales user / month · Included in Suite (₹149 per person)".
  - For a member with `billing.manage`: a primary button "See plans" → `/app/settings/subscription?add=orbit`.
  - For anyone else: "Ask {ownerName} to add it." and a Close button. Play `pop` on open.
- **Server:** `action(..., { product: 'orbit' })` refuses with `{ ok:false, error: "Orbit isn't in your plan. Add it from Settings → Subscription." }`. A page under a locked product renders the same upgrade card inline (not a 404, not a blank page).
- **Muster Starter payroll pages** use the same card: "Payroll needs Muster Business. Upgrade from Settings → Subscription."

### 2.4 Clients pages availability

From SPEC: the Clients pages need any one of work, orbit or folio, so their availability is `ctx.has('work') || ctx.has('orbit') || ctx.has('folio')`.

---

## 3. Tenancy, auth, sessions: lessons from the draft

### 3.1 Tenant isolation

The draft does it with AsyncLocalStorage and a Mongoose plugin. SPEC chose an explicit `ctx.db(Model)` wrapper plus a `tenant` plugin. The draft's hard-won rules still apply to the plugin and to any hooks:

1. **Stamp `orgId` in `pre('validate')`, not `pre('save')`.** Mongoose validates before save hooks, so stamping a required field in `pre('save')` is always too late.
2. **Callback-style hooks must call `next`.** An `insertMany` hook that declares `next` but never calls it makes `insertMany` hang forever with no error. The draft hit this.
3. **Refuse cross-tenant writes.** If a document already carries an `orgId` that differs from the context's, throw `'cross-tenant write blocked'`. Never overwrite it silently.
4. **Aggregates:** unshift `{ $match: { orgId } }` as the first stage. SPEC already says this for `ctx.db(...).aggregate`.
5. **Await queries inside the scope.** Mongoose queries are lazy, so a query returned unawaited runs after the context unwinds. The draft's `runInOrg` always awaits inside.
6. **Deliberate cross-tenant access is a flag on the context, never a module variable.** A counter variable leaks across concurrent requests. The draft has `asSystem(fn)`; PeopleOS has `elevated(reason, fn)`, which also logs the reason. Flowbit needs one of these for:
   - login (find memberships across orgs)
   - invite acceptance (find the invite by token hash before you know the org)
   - the Razorpay webhook (find the org by subscription id)
   - **every `/platform` page**

   **[needs foundation]** Provide `platformDb()` or `elevated(reason, fn)`. It must assert `user.isPlatformAdmin` when called from platform code. The settings agent must use it for `/platform` and must not use raw models anywhere else.

**Isolation tests to keep** (from `server/src/e2e.test.ts`). Run them as Vitest tests against the wrapper with a fake model, or as a one-off script later. With two orgs A and B:
- B's list of clients is empty.
- B's direct fetch of A's client id returns null (404).
- B's aggregate over A's ids returns nothing.
- B creating a doc with `orgId: A` throws.

### 3.2 Identity vs membership

- **Draft:** a global `Identity` (email unique, passwordHash `select:false`, googleId sparse unique, lastOrgId) plus a per-org `User` that is the membership (role, department, active).
- **SPEC:** `User` (global) plus `Member` (per org) means the same thing.

Rules worth keeping:
- **Credentials belong to the person, not the membership.** One email can hold seats in several workspaces with one password.
- **Login gives the identical response for an unknown email and a wrong password:** "That email and password don't match." This never reveals which accounts exist. The draft tested that both bodies are deep-equal.
- **Multiple workspaces:**
  - The draft picks `lastOrgId` and asks the client to choose (HTTP 300 `choose_org`) when ambiguous.
  - SPEC uses `Session.activeOrgId` plus the workspace switcher instead.
  - Recommended rule: at login, set `activeOrgId` to the most recently used active membership (store `User.lastOrgId` **[proposal]**, or pick the newest session's org).
- **Signup uses a transaction.** The draft creates the Org, the Identity and the owner, and on failure deletes them by hand because its Mongo had no replica set. SPEC has a replica set, so do it in a transaction.
- **Rate limits:** the draft limits `/api/auth/*` to 20 requests per minute per IP. Keep something similar for login, signup, password reset, invite accept and password change. **[needs foundation]**

### 3.3 Sessions must be checked against the membership on every request

The draft's JWT carries `role` and `orgId` for 7 days, and `authenticate` never re-reads the user. Two consequences:
1. A role change takes effect only when the token is re-issued.
2. **A deactivated member keeps full access until the token expires.**

SPEC's database sessions fix this only if `requireMember()` loads the `Member` on every request (React `cache`d per request) and refuses `status !== 'active'`. When a member is disabled, also delete their `Session` documents whose `activeOrgId` equals that org, so they are signed out immediately. Role changes then apply on the next request; the copy should say so (PeopleOS wording: "It applies on their next request").

### 3.4 Invite tokens

Draft mechanics to keep:
- `token = randomBytes(32).toString('base64url')`. Only `sha256(token)` hex is stored, as `tokenHash` with a unique index, so "a database leak can't be replayed as a valid invite".
- Expiry is 7 days.
- Look up by digest with `acceptedAt: null, expiresAt > now`.

Do **not** keep the draft's TTL index that auto-deletes expired invites. It makes "expired, resend?" impossible to show, so keep expired invites and list them. Do **not** keep the old oss-main OTP + forced password change flow either. Full flow in section 8.

---

## 4. Settings shell: layout, sub-nav, permissions

`src/app/app/settings/layout.tsx` (settings agent) renders inside the app shell:
- **Page title:** "Settings".
- **Left sub-nav:** 220 px, `--bg-2` card. Groups use section labels (11–12 px uppercase, semibold, letter-spacing 0.08em, with an icon).
- **Content:** the right column.
- **Below the `lg` breakpoint (1024 px):** the sub-nav becomes a horizontally scrolling row of pill chips under the title. The active chip uses `--chip-active`.

| Group label | Item | Route | Permission | Icon (lucide) |
|---|---|---|---|---|
| YOU | Profile | `/app/settings/profile` | any member | `UserRound` |
| | Security | `/app/settings/security` | any member | `KeyRound` |
| | Appearance | `/app/settings/appearance` | any member | `Sparkles` |
| WORKSPACE | General | `/app/settings` | `org.manage` | `Building2` |
| | Members | `/app/settings/members` | `members.manage` | `Users` |
| | Roles | `/app/settings/roles` | `roles.manage` | `ShieldCheck` |
| | Modules | `/app/settings/modules` | `org.manage` | `Blocks` |
| | Integrations | `/app/settings/integrations` | `org.manage` | `Plug` |
| BILLING & RECORDS | Subscription | `/app/settings/subscription` | `billing.manage` | `CreditCard` |
| | Audit log | `/app/settings/audit` | `audit.read` | `ScrollText` |
| | Email log | `/app/settings/email-log` | `org.manage` | `Mail` |

Rules:
- **Hide items the member can't use, but check on the server too.** Every page calls `ctx.assert(perm)` (or SPEC's equivalent) at the top. A direct URL without permission renders the shared forbidden state: "You don't have access to {Page}. Ask an admin to give your role the '{permission label}' permission." Subscription is the exception; its copy is "Only the workspace owner manages the subscription. Ask {ownerName}."
- **`/app/settings` without `org.manage`:** redirect to `/app/settings/profile`, so the Settings rail item always lands somewhere useful.
- **Read-only workspace (6.5):** pages render normally. Every save button stays visible, and the action refuses with the SPEC message. Profile, security, appearance and subscription actions are allowed (6.5 allowlist).
- **Blocked workspace:** only `/app/settings/subscription` renders (6.5).
- **Interaction:**
  - Every card-level form follows the PeopleOS UX-FLOWS rules: on success the toast names what changed and the card stays; on refusal fields keep their input, the first field error is scrolled into view, and the error sound plays.
  - Save buttons say "Saving…" and are disabled while pending.
  - Toggles play `toggle`. Dialogs play `pop`.

---

## 5. Page specs for `/app/settings/*`

**Conventions:**
- Server actions use SPEC's `action(schema, fn, { perm })`. Field limits are given as zod rules.
- `audit()` calls use SPEC's signature `audit(ctx, { action, entity, entityId, summary, meta? })`, with `meta.before`/`meta.after` holding only the changed keys (section 9.3).
- Action names are suggestions.

### 5.1 General: `/app/settings` (`org.manage`)

**Purpose:** the workspace's identity and working calendar, used by the shell (name, logo), the check-in widget and attendance (office hours, work week), and every PDF letterhead (name, logo, address, GSTIN).

**Data shown:** `Org` fields `name`, `slug`, `logoFileId`, `address`, `gstin`, `state`, `timezone`, `officeHours { start, end, halfDayHours }`, `workWeek`, `teamSize`, `mode`, and created date.

**Cards (each saves on its own and stays on the page):**

1. **Workspace.** Fields:
   - `name`: required, trim, 2–60 characters.
   - `slug`: required, 3–40 characters, `/^[a-z0-9]+(?:-[a-z0-9]+)*$/`, unique across all Orgs.
     - Reserved slugs are refused: `app, api, www, admin, platform, login, signup, onboarding, invite, settings, c, flowbit, help, support, static, assets`.
     - Live check on input: debounce 300 ms, call `checkSlugAvailable(slug)`, show "Available" (success colour) or "Taken" or "Reserved" inline.
     - Changing the slug shows a hint: "Your workspace URL changes to flowbit.app/{slug}." Routes don't use the slug today, so the hint is informational.
   - `teamSize`: chips `Just myself | 2–10 | 11–50 | 51–200 | 200–500 | 500+`, the same set as onboarding.
   - `mode`: two radio cards, **Project-based** / **Personal tasks**. This changes Work's default navigation (work-a reads it).

   Toast: "Workspace details saved." Revalidate the `/app` layout so the switcher name updates.

2. **Logo.**
   - Upload png/jpeg/webp up to 1 MB. **No SVG**, because an uploaded SVG served from our origin can carry script.
   - Store with `saveFile(ctx, { kind: 'org-logo' })` and set `Org.logoFileId`.
   - Show the preview on a dark tile and a "Remove logo" button.
   - Toasts: "Logo updated." / "Logo removed."

3. **Address and tax.** Fields:
   - `address.line1`: required if any address field is set, max 120.
   - `line2`: optional, max 120.
   - `city`: max 60.
   - `state`: select from the Indian states list.
   - `pincode`: `/^[1-9][0-9]{5}$/`.
   - Country is fixed to India.
   - `gstin`: optional, uppercased, must match `/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/`. Its first two digits must equal the selected state's GST code. Error: "This GSTIN is registered in Maharashtra (27), but the address state is Madhya Pradesh (23)."
   - State codes: `vistaar-billingos/scripts/gst-states.ts` has the authoritative list (37 entries plus 97 Other Territory; the third column marks union territories).
   - **[needs foundation]** SPEC stores `Client.state` as a 2-letter code ('MP') while GSTINs embed the numeric code ('23'). `lib/validation` should export one table that carries `{ code2, gstCode, name, isUT }` so General, Folio and the subscription invoice agree.

   Toast: "Address saved."

4. **Working calendar.** Fields:
   - `officeHours.start` / `end`: `HH:mm` 24-hour strings, `end > start`.
   - `halfDayHours`: number, 0.5–12, step 0.5, and less than the office day length.
   - `workWeek`: at least one day; checkboxes Mon–Sun.
   - Timezone is shown read-only: "Asia/Kolkata (IST)".
   - **[needs foundation]** SPEC writes `workWeek [1..6]` without saying whether 0 means Sunday. Recommended: JS `getDay()` numbering (0 = Sun … 6 = Sat), so `[1,2,3,4,5,6]` is Mon–Sat. Everyone (attendance, payroll working days) must use the same convention.

   Toast: "Working hours saved: 10:00–19:00, Mon–Sat."

5. **Danger zone** (only the owner sees it). **Delete workspace.**
   - ConfirmDialog. The user must type the slug.
   - Body: "Everyone loses access now. Billing stops. Data is kept for 30 days in case you change your mind, then removed."
   - Effect:
     - `Org.deletedAt = now` **[proposal field]**.
     - Cancel the Razorpay subscription immediately if one exists.
     - Delete every `Session` with `activeOrgId` = this org.
     - Members land on `/onboarding`, or on their other workspace.
     - Audit `org.deleted`. Platform admin can restore by clearing `deletedAt` (11.3).
     - The 30-day purge job is out of scope; say so in the final report.

**Permission:** `org.manage` for cards 1–4, owner only for 5. **Audit:** `org.updated` with the changed fields. **Empty state:** none (the org always exists). Show "Not set" placeholders for an empty address or GSTIN.

### 5.2 Profile: `/app/settings/profile` (every member)

**Purpose:** your own name and avatar, and what this workspace knows about you.

**Data shown:**
- `User.name`, `User.email` (read-only, "Your sign-in email"), avatar.
- Sign-in methods: "Password" (if `passwordHash`) and "Google" (if `googleId`), as chips.
- For the active workspace: role label, `Member.title`, department, manager, joined date. If `Member.employeeId` is set, show "Employee record VW-0007 →" linking to `/app/me`.

**Actions:**
- `updateProfile({ name })`: name trimmed, 2–80 characters. Toast "Profile saved."
- `uploadAvatar(file)`: png/jpeg/webp, up to 2 MB, then `User.avatarFileId`. `removeAvatar()`.
- `Member.title` is editable here by the member (max 60). Department and manager are read-only here ("Managed by your admin"); admins edit them on Members (8.6).

**Validation messages:** "Use at least 2 characters for your name." / "Use a PNG, JPG or WebP image under 2 MB."

**Note:** `saveFile(ctx, …)` is org-scoped and `GET /api/files/[id]` checks the org, so an avatar uploaded in workspace A won't render in workspace B. Accept this for now, or have the foundation serve `kind:'avatar'` files to any member of an org the user belongs to. **[needs foundation, minor]**

### 5.3 Security: `/app/settings/security` (every member)

**Card 1: Password.**
- Fields: `currentPassword` (required when the user has a password; hidden for Google-only users, whose card reads "Set a password"), `newPassword` (8–128 characters, not equal to the current password, not equal to the email), `confirm` (must match).
- On success:
  - bcrypt the new password.
  - **Delete every other `Session` of this user** (keep the current one).
  - `sendMail` "Your Flowbit password was changed" (kind `security`) to the user.
  - Toast "Password changed. You've been signed out of 2 other sessions."
- Refusals: "Your current password isn't right." on the current field; "Use at least 8 characters."
- Rate limit: 5 attempts per 15 minutes per user. **[needs foundation helper]**

**Card 2: Sessions.**
- List this user's `Session`s across all workspaces, newest first. Columns:
  - Device: parse `userAgent` into "Chrome on macOS", using simple regexes, no library.
  - Workspace: the `activeOrgId` name.
  - Last active, as relative time.
  - Signed in: date.
  - Badge "This device" on the current session.
- Actions: "Sign out" on any other row (no confirm needed), and "Sign out everywhere else" (ConfirmDialog: "Sign out of 3 other sessions?").
- Toasts: "Signed out of Chrome on Windows." / "Signed out of 3 other sessions."
- **[needs foundation]** SPEC's `Session` has `tokenHash, userId, activeOrgId, expiresAt, userAgent`. Add `createdAt` and `lastSeenAt`, the latter updated when the sliding expiry is renewed, at most once every 5 minutes. Until then, "last active" can be derived as `expiresAt − 30 days`.

**Empty state:** n/a (the current session always exists).

### 5.4 Appearance: `/app/settings/appearance` (every member)

- **Sounds:** a switch bound to `User.prefs.sound` (SPEC). Below it is a row of small "Play" buttons, one per sound (click, toggle, success, error, notify, pop, whoosh), using `lib/sound` `play(name)`. They let people hear what they're turning off. Saves immediately; toast "Sounds turned off." or "Sounds turned on." The avatar menu toggle and this switch write the same field.
- **Motion:** radio options "Match my device" (default) / "Reduce motion" / "Full motion".
  - **[needs foundation]** Add `User.prefs.reducedMotion: 'system' | 'reduce' | 'full'`. The root layout sets `data-motion` on `<html>`, and `globals.css` disables gradient animation and hover lift under `[data-motion="reduce"]` as well as under `prefers-reduced-motion`.
  - Toast: "Motion reduced."
- **No theme picker.** Flowbit is dark only. Do not port the draft's light/dark toggle.

### 5.5 Members: `/app/settings/members` (`members.manage`)

See section 8 for the full flows. Page layout:
- **Header:** "Members" with the subtitle "12 of 25 seats used", or "12 members · trial, no seat limit". Primary button "Invite people".
- **Capacity banner** when any capacity is full (6.4): "No seats left on your plan. Add seats in Settings → Subscription, or disable someone." For a viewer without `billing.manage`, the first sentence ends "Ask {owner} to add seats."
- **Search and filters:** search box (`?q=`, matches name or email, case-insensitive) and filter chips Status: All / Active / Invited / Disabled, plus a Role select. Paginate at 50 (`?page=`).
- **Table "People"** (active and disabled members). Columns:
  - Person: avatar, name, email, a "You" tag.
  - Role: an inline select when changeable, otherwise a chip.
  - Title, Department.
  - Employee: code chip linking to `/app/hr/people/[id]` when Muster is on and the viewer has `people.read`.
  - Last active.
  - Status chip: Active (success) or Disabled (muted).
  - Row menu: Edit details / Change role / Disable or Enable / Transfer ownership (owner viewing an active member) / Link employee.
- **Table "Invitations"**, shown only when any exist. Columns: Email, Name, Role, Invited by, Sent (relative), Expires ("in 5 days" / "Expired 2 Oct"), then Resend and Revoke.
- **Empty (only you):** "It's just you so far. Invite your team. They'll get an email with a link to join {workspace}." plus the Invite button.
- **Filtered empty:** "No one matches '{q}'." plus "Clear filters".

### 5.6 Roles: `/app/settings/roles` (`roles.manage`)

See section 7.

### 5.7 Modules: `/app/settings/modules` (`org.manage`)

**Purpose:** switch entitled products on and off for the whole workspace. Locked products link to Subscription.

The draft uses `members.manage` for the PUT and has no client screen at all. SPEC fixes the permission as `org.manage`.

**Data shown:** one card per product (Work, Muster, Orbit, Folio), in its accent colour:
- Name and one-line description.
- 4–6 feature bullets from the catalog.
- **State**, one of:
  - "Included in your trial".
  - "In your plan" (for Muster also "Starter, no payroll" or "Business").
  - "Not in your plan".
- **Switch** (entitled products only), bound to `Org.enabledProducts`.

A small "Always on" row lists core: Home, Notifications, Settings, and Clients (when any of Work, Orbit or Folio is on).

**Actions:** `setProductEnabled({ product, enabled })`
- **Turning off:** ConfirmDialog: "Turn off Orbit? Its pages leave the menu for everyone. Nothing is deleted. Turn it back on any time." Toast "Orbit turned off." Plays `toggle`.
- **Turning on:** no confirm. Toast "Orbit turned on."
- **Refusals:**
  - Not entitled: "Orbit isn't in your plan."
  - Last product: "Keep at least one product switched on." The draft refuses an empty set with `nothing_enabled`.
- Audit `org.modules_changed` with before/after lists. `revalidatePath('/app', 'layout')` so the rail updates.

**Locked card:**
- Show the lock, the price from `lib/plans` (for example "₹149 per sales user / month · or Suite ₹149 per person"), and a button "Add to plan" → `/app/settings/subscription?add=orbit`. The button shows only for `billing.manage`; others read "Ask {ownerName} to add it."
- For Muster Starter, the Muster card shows "Payroll needs Muster Business" with the same link and `?muster=business`.

**Empty state:** none.

### 5.8 Subscription: `/app/settings/subscription` (`billing.manage`)

Full spec in section 6. In short, the page shows:
- current plan and status
- trial countdown or next renewal
- usage against seats
- plan picker (monthly/yearly; Suite or pick products)
- billing details
- checkout (Razorpay, or Test mode with "Simulate payment")
- pending changes
- cancel
- billing history with Flowbit GST invoices

### 5.9 Integrations: `/app/settings/integrations` (`org.manage`)

**Purpose:** read-only status of the instance-level services Flowbit uses. These are server environment settings, not per-workspace connections. Lead copy: "These are set by whoever runs your Flowbit server. Nothing secret is shown here."

Cards, each with an icon, name, status chip, detail line and help line:

1. **Google sign-in.**
   - Status: "Ready" (both `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` set) or "Not configured".
   - Detail: "{n} of {m} members have signed in with Google" (members whose `User.googleId` is set).
   - Help: the redirect URI to register, `${APP_URL}/api/auth/google/callback`, with a Copy button.
   - The draft showed the same "x of y people signed in with Google" line.
2. **Email delivery.**
   - Status: "Sending" (`RESEND_API_KEY` set) or "Not configured".
   - Detail: "From {MAIL_FROM}", or "Emails are saved in the Email log instead of being sent."
   - Last 30 days for this workspace: sent / saved-not-sent / failed counts from Outbox, linking to the Email log.
3. **Payments (Razorpay).**
   - Status:
     - "Live" when `RAZORPAY_KEY_ID` starts with `rzp_live_`.
     - "Test keys" when it starts with `rzp_test_`.
     - "Test mode", meaning no keys: "Checkout simulates payments for local development."
   - Detail: key id masked as `rzp_test_…AbCd` (prefix plus last 4 only).
   - Webhook: "Webhook secret set" or "Webhook secret missing: renewals and failed payments won't be recorded". Show the URL `${APP_URL}/api/billing/razorpay/webhook` with Copy, and "Last event received 2 hours ago" from the newest `BillingEvent`.
   - **[needs foundation]** add `RAZORPAY_WEBHOOK_SECRET` to `.env.example`.
4. **File storage.**
   - Status: "Local disk".
   - Detail: path relative to the app, `STORAGE_DIR` (default `./storage`).
   - This workspace: "{count} files · {size}" (sum of `StoredFile.size` for the org, formatted in KB/MB).
5. **Arc (AI).**
   - Status: "Claude connected" (`ANTHROPIC_API_KEY` set) or "Templates only".
   - Detail: "Model claude-sonnet-5-5", or "Arc uses built-in templates and workspace search."
   - Help: "Arc reads and suggests. Nothing changes until someone clicks Apply."

**Do not port** the draft's "Slack: Not connected" card. It had no way to connect, which makes it a dead feature.

**Actions:** copy buttons only (play `click`; toast "Copied.").

### 5.10 Email log: `/app/settings/email-log` (`org.manage`)

**Purpose:** show every email Flowbit tried to send for this workspace. SPEC: `sendMail` always writes `Outbox`, and sends through Resend only when the key is set.

**Outbox model** (foundation owns it; fields the page needs) **[needs foundation if missing]**:
`{ orgId?: ObjectId, to: string[], cc?: string[], subject: string, html: string, text?: string, attachments: [{ name, mime, size, fileId? }], status: 'sent'|'logged'|'failed', provider: 'resend'|'none', providerMessageId?: string, error?: string, kind?: string, entity?: string, entityId?: ObjectId, createdAt }`

`kind` values used across agents: `invite`, `password_reset`, `security`, `subscription_invoice`, `invoice`, `quote`, `statement`, `payslip`, `letter`, `claim_otp`, `reminder`, `contact`, `other`.

**Table:**
- Columns:
  - When (date and time, IST).
  - To (first recipient, plus "+2").
  - Subject.
  - Kind (chip).
  - Status:
    - Sent (success).
    - Saved, not sent (warning), with the tooltip "No email provider is set up."
    - Failed (danger), with the error in a tooltip.
- Filters, all URL params:
  - Status.
  - Kind.
  - Search `q`, matching to/subject case-insensitively. Escape regex special characters.
  - Date range.
- Paginate at 50.

**Row click** opens a side Sheet:
- Header fields: to, cc, subject, kind, status, provider id.
- An **HTML preview in `<iframe sandbox="" srcDoc={html}>`**. The empty sandbox blocks scripts and forms.
- A "Plain text" tab.
- Attachments, each a download link via `/api/files/[id]` when a `fileId` exists.

**Action:** "Send again" (`org.manage`) calls `sendMail` again with the same content, which creates a new Outbox row. Show it only when status is `failed`, or when the provider is configured. Toast "Sent again to aditi@vistaarwebx.com."

**Empty:** "No emails yet. Invites, payslips, invoices and letters sent from {workspace} appear here." **Filtered empty:** "No emails match these filters." plus "Clear filters".

User-level emails with no org (password reset, the security notice) do not appear. Platform admins can see them in a later version (out of scope).

---

## 6. Subscription and checkout

### 6.1 Binding rules from SPEC (restated)

- **Trial:** a new workspace starts on a **15-day trial of everything**.
- **Prices** are INR per month, excluding GST. **Yearly = 12 × monthly, with the first yearly invoice 50% off** (Console setting; see `docs/specs/console.md` §2).

| Plan | Unit | Monthly | Minimum |
|---|---|---|---|
| Work | user | ₹59 | 5 users |
| Muster Starter (no payroll) | employee | ₹39 | 10 |
| Muster Business (payroll, PF/ESI/PT) | employee | ₹79 | 10 |
| Orbit | sales user | ₹149 | 2 |
| Folio | workspace | ₹399 flat, includes 3 users | 1 |
| Suite (all four) | person | ₹149 | 10 |

- **Subscription shape:** `Org.subscription = { status: 'trialing'|'active'|'past_due'|'canceled'|'expired', plan: 'trial'|'suite'|'custom', products: { work: boolean, muster: 'starter'|'business'|null, orbit: boolean, folio: boolean }, seats: number, cycle: 'monthly'|'yearly', trialEndsAt, currentPeriodEnd, razorpaySubscriptionId? }`
- **Muster Starter** excludes the `muster.payroll` features.
- **After the trial ends without a plan:**
  - The workspace is read-only for 30 days. Actions refuse with "Your trial has ended — choose a plan to keep editing".
  - After that, data stays but access is blocked except Settings → Subscription.
- **`Org.enabledProducts`** lets an owner switch entitled products off and on.
- **Payment:**
  - Razorpay Subscriptions when `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` are set.
  - Without keys, checkout shows "Test mode" and a "Simulate payment" button that activates the subscription (local development only).
- **Roles:** the owner manages the subscription; admin gets everything except subscription and workspace deletion.
- **Invoices:** the page shows billing history with GST invoices from Flowbit.

"À la carte" (picking individual products) is stored as `plan: 'custom'`. Manual plans set by Flowbit staff are also `custom`, marked with `manual`.

### 6.2 Data model

**`Org.subscription`**: SPEC fields plus the additions marked **[proposal, needs foundation: core model]**.

```ts
subscription: {
  status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'expired',          // SPEC; stored, but always read through effectiveStatus() (6.5)
  plan: 'trial' | 'suite' | 'custom',                                           // SPEC; custom = pick-your-products or staff-set
  products: { work: boolean, muster: 'starter' | 'business' | null, orbit: boolean, folio: boolean },  // SPEC
  seats: number,                 // SPEC; Suite: people paid for. Custom: equals quantities.work (or 0 without Work). Trial: 0 (no limit)
  quantities: { work: number, muster: number, orbit: number },   // [proposal] billed quantity per product for custom; 0 when absent. Folio is flat
  cycle: 'monthly' | 'yearly',   // SPEC
  trialEndsAt: Date,             // SPEC; Org.createdAt + 15 days (exact instant)
  currentPeriodStart?: Date,     // [proposal]
  currentPeriodEnd?: Date,       // SPEC; exclusive end instant (= next period's start)
  amountPaise: number,           // [proposal] price per period, excluding GST, frozen at purchase (what quote() returned)
  cancelAtPeriodEnd: boolean,    // [proposal] default false
  canceledAt?: Date,             // [proposal]
  pastDueSince?: Date,           // [proposal]
  endedAt?: Date,                // [proposal] set when status becomes 'expired' (trial end or period end)
  pendingChange?: {              // [proposal] a downgrade or cycle change scheduled for the next renewal
    plan: 'suite' | 'custom', products: {...}, quantities: {...}, seats: number, cycle: 'monthly' | 'yearly',
    amountPaise: number, effectiveAt: Date, requestedBy: ObjectId /* Member */
  },
  razorpaySubscriptionId?: string,   // SPEC
  razorpayPlanId?: string,           // [proposal]
  pendingCheckout?: {                // [proposal] between startCheckout and confirmCheckout
    razorpaySubscriptionId: string, razorpayPlanId: string, selection: Selection, amountPaise: number, totalPaise: number, createdAt: Date
  },
  billing?: {                        // [proposal] invoice addressee; required before the first checkout
    legalName: string, gstin?: string, email: string, phone?: string,
    address: { line1: string, line2?: string, city: string, stateCode: string /* 2-letter, e.g. 'MP' */, pincode: string }
  },
  manual?: { note: string, setBy: ObjectId /* User */, setAt: Date },   // [proposal] set by platform staff (11.3)
}
disabled?: { at: Date, by: ObjectId /* User */, reason: string }        // [proposal] Org-level, platform only
deletedAt?: Date                                                        // [proposal] Org-level, owner soft delete (5.1)
```

On signup or onboarding the foundation writes:
```
{ status:'trialing', plan:'trial',
  products: { work:true, muster:'business', orbit:true, folio:true },
  seats: 0, quantities: { work:0, muster:0, orbit:0 }, cycle:'monthly',
  trialEndsAt: createdAt + 15 days, amountPaise: 0, cancelAtPeriodEnd: false }
```
and `enabledProducts: ['work','muster','orbit','folio']`. The draft used 14 days; SPEC says 15.

**New model `SubscriptionInvoice`** **[proposal: location `src/models/platform/SubscriptionInvoice.ts`. SPEC gives settings no model folder; the foundation may prefer `models/SubscriptionInvoice.ts`]**. It uses the tenant plugin for `orgId` and timestamps. Platform pages read it through `platformDb`.

```ts
{
  orgId: ObjectId,                  // tenant plugin
  number: string,                   // 'FB/2026-27/0001'; unique index across ALL orgs
  fy: string,                       // '2026-27'
  seq: number,
  kind: 'subscription' | 'upgrade', // a period charge, or a prorated mid-period upgrade
  status: 'paid' | 'cancelled',     // only ever created after money is received; cancelled by platform staff with a reason, keeping the number
  issueDate: string,                // 'YYYY-MM-DD' (IST)
  periodStart: string,              // 'YYYY-MM-DD'
  periodEnd: string,                // 'YYYY-MM-DD' inclusive last day, for display ("1 Oct 2026 to 31 Oct 2026")
  supplier: { legalName, tradeName, gstin, pan, address: string, stateCode2, gstStateCode, email },   // frozen snapshot of Flowbit's details
  customer: { legalName, gstin?, email, address: {...}, stateCode2, gstStateCode },                    // frozen snapshot of subscription.billing
  placeOfSupply: { gstStateCode: string, name: string },
  supplyType: 'intra_state' | 'inter_state',
  sac: string,                      // '998314' default, configurable (6.12)
  gstRate: 18,
  lines: [{ description: string, productKey: 'suite'|'work'|'muster_starter'|'muster_business'|'orbit'|'folio'|'upgrade',
            quantity: number, unitPaise: number, amountPaise: number /* taxable */ }],
  taxableValuePaise: number, cgstPaise: number, sgstPaise: number, igstPaise: number, taxPaise: number,
  roundOffPaise: number, totalPaise: number,
  payment: { provider: 'razorpay' | 'simulated' | 'manual', paymentId?: string, subscriptionId?: string, orderId?: string, paidAt: Date },
  isTest: boolean,                  // true when provider === 'simulated'; the PDF carries a TEST watermark
  emailedAt?: Date,
  cancelledAt?: Date, cancelReason?: string, cancelledBy?: ObjectId,
}
indexes: { number: 1 } unique; { orgId: 1, issueDate: -1 }; { 'payment.paymentId': 1 } unique sparse (idempotency)
```

**New model `BillingEvent`** **[proposal, same location]**. It is not tenant-scoped, because webhooks arrive before the org is known.
```ts
{ provider: 'razorpay' | 'simulated', eventId: string /* x-razorpay-event-id or 'sim_…' */, type: string, orgId?: ObjectId,
  payload: Mixed, receivedAt: Date, processedAt?: Date, error?: string }
indexes: { provider: 1, eventId: 1 } unique;  { orgId: 1, receivedAt: -1 }
```

### 6.3 Pricing engine: `quote(selection, cycle)` (pure; in `lib/plans.ts`)

```ts
type Selection =
  | { plan: 'suite', seats: number }
  | { plan: 'custom', work?: number, muster?: { tier: 'starter' | 'business', employees: number }, orbit?: number, folio?: boolean }

const PRICE = {                       // paise per unit per month
  suite: 14_900, work: 5_900, muster_starter: 3_900, muster_business: 7_900, orbit: 14_900, folio: 39_900,
}
const MIN = { suite: 10, work: 5, muster: 10, orbit: 2 }
const YEARLY_MONTHS = 12              // yearly list = 12 × monthly; the first yearly invoice is discounted (lib/first-year-discount)
const GST_RATE = 18
```

**Rules:**
1. **Billed quantity** = `max(MIN[product], chosen quantity)`. The UI shows the gap: "Billed for the 10-person minimum (8 in use)."
2. **Lines:**
   - Suite: one line, `seats × 14,900`.
   - Custom: one line per chosen product.
   - Folio: one flat line, quantity 1.
   - A custom selection must contain at least one product.
3. **Monthly subtotal** = Σ line amounts.
4. **Period amount** = monthly subtotal for `monthly`, and **monthly subtotal × 10** for `yearly`. Line unit prices for yearly are `unit × 10`, and the description says "/ year".
5. **GST** = 18% of the period amount, split by place of supply (6.12). The quote can be computed before the state is known; show "GST 18%" as one line in that case.
6. **Total** = period amount + GST, **rounded to the nearest rupee once** (Billing OS `roundToRupee`). Show the round-off line when it isn't zero.
7. **Suite hint:** for a custom selection, compute Suite for the workspace's current billable persons (6.4). Show "Suite would cost ₹1,788/month for your 12 people and adds Orbit and Folio. Save ₹565/month." **only when Suite is cheaper than or equal to the custom subtotal.**
8. **Yearly savings line:** `monthly subtotal × 12 − yearly amount` = 2 × monthly subtotal ("You save ₹3,576 a year").

Return shape:
```
{ lines: [{ key, label, quantity, minimumApplied: boolean, unitPaise, amountPaise }],
  monthlySubtotalPaise, periodAmountPaise, cycle, months: 1 | 12, yearlySavingsPaise, suiteComparisonPaise? }
```
GST and the total come from `subscriptionInvoiceTotals(periodAmount lines, supplyType)` (6.12). The client calls the same pure function for the live summary, so the client and server never disagree.

**Worked examples** (tests should assert these exactly):

| Selection | Lines | Period amount | GST 18% | Total (rounded) |
|---|---|---|---|---|
| Suite 12, monthly | 12 × ₹149 | ₹1,788.00 | ₹321.84 | ₹2,110.00 (round off +₹0.16) |
| Suite 12, yearly | 12 × ₹1,490 | ₹17,880.00 | ₹3,218.40 | ₹21,098.00 (round off −₹0.40) |
| Suite 8, monthly | billed 10 × ₹149 (minimum) | ₹1,490.00 | ₹268.20 | ₹1,758.00 (−₹0.20) |
| Work 3, monthly | billed 5 × ₹59 (minimum) | ₹295.00 | ₹53.10 | ₹348.00 (−₹0.10) |
| Muster Starter 10, monthly | 10 × ₹39 | ₹390.00 | ₹70.20 | ₹460.00 (−₹0.20) |
| Work 12 + Muster Business 12 + Orbit 2 + Folio, monthly | 708 + 948 + 298 + 399 | ₹2,353.00 | ₹423.54 | ₹2,777.00 (+₹0.46); Suite hint: 12 × ₹149 = ₹1,788, save ₹565 |
| Work 7 + Muster Business 12 + Folio, monthly | 413 + 948 + 399 | ₹1,760.00 | ₹316.80 | ₹2,077.00 (+₹0.20); no Suite hint (Suite ₹1,788 > ₹1,760) |

At list prices the per-unit tax is always an even number of paise (5,900 → 1,062; 3,900 → 702; 7,900 → 1,422; 14,900 → 2,682; 39,900 → 7,182), so CGST and SGST split exactly. Only prorated amounts (6.11) can produce an odd tax, and they need the levelling rule in 6.12.

### 6.4 Seat counting and capacity

The draft keeps a `seatsUsed` counter on Org and increments or decrements it. The counter drifts:
- Reactivating a member never claims a seat.
- Unlimited plans never increment it.
- Deactivating on an unlimited plan decrements a seat that was never counted.

**Flowbit derives usage from the collections every time** (cheap `countDocuments`) and checks capacity inside the write's transaction.

**Usage** (`usage(ctx)` in `lib/plans` or settings; uses `ctx.db`):
```
members         = Member.count({ status: 'active' })
pendingInvites  = Invite.count({ acceptedAt: null, expiresAt: { $gt: now } })
employees       = Employee.count({ status: { $in: ON_PAYROLL } })    // Muster's predicate. From PeopleOS employment-lifecycle.ts:
                  // ON_PAYROLL = intern, probation, active, confirmed, notice_period, resigned
                  // (not candidate, offered, joining_pending, terminated, internship_completed, exited, inactive)
orbitUsers      = active members whose effective permissions include 'orbit.write'
folioUsers      = active members whose effective permissions include any 'folio.*'
persons         = members + employees counted once: active members, plus on-payroll employees whose memberId is not an active member
```
The muster-a agent owns the status list. Import its predicate, don't copy it.

**Capacity** (`capacity(subscription, usage)`, pure; returns one row per limit with `{ key, label, used, limit, ok }`):

| Plan | Check | Limit |
|---|---|---|
| trial (effective trialing) | none | unlimited. Show usage, labelled "Your plan will be priced on these numbers" |
| suite | `persons` (and `members + pendingInvites` for invites) | `seats` |
| custom with Work | `members + pendingInvites` | `quantities.work`. **Everyone who signs in counts as a Work user**; say so in the picker |
| custom without Work | `members + pendingInvites` | `max(quantities.muster, quantities.orbit, folio ? 3 : 0)`. People need logins for Muster self-service; logins without Work don't unlock Work pages |
| custom with Muster | `employees` | `quantities.muster` |
| custom with Orbit | `orbitUsers` | `quantities.orbit` |
| custom with Folio | `folioUsers` | `3`. Under Suite, Folio users are not limited separately |

**Where capacity is enforced.** The checks run in the same transaction as the write, and every refusal names the fix. Who calls what:

| Event | Owner | Check | Refusal copy |
|---|---|---|---|
| Invite people | settings (8.2) | members + pending + new ≤ limit | "That needs 3 seats and you have 1 left. Add seats in Settings → Subscription." |
| Enable a disabled member | settings | members + 1 ≤ limit | "No seat free for Aditi Singh. Add a seat or disable someone first." |
| Accept invite | foundation `/invite/[token]` | members + 1 ≤ limit (the pending invite already counted, so normally passes) | "{Workspace} has no free seats right now. Ask {inviter} to add seats." |
| Change role, or edit a custom role, so someone gains `orbit.write` or `folio.*` | settings (7, 8.4) | orbitUsers / folioUsers within limit | "Orbit is paid for 2 sales users and both are in use. Add one in Settings → Subscription." / "Folio includes 3 users. Move to Suite for more." |
| Create, import or reactivate an employee into an on-payroll status | muster-a (calls `assertCapacity(ctx, { employees: +n })`) | employees + n ≤ `quantities.muster` | "Muster is paid for 20 employees. Add more in Settings → Subscription." |
| Downgrade or plan change | settings (6.11) | new limits ≥ current usage | "You have 14 active members. Disable 2 people or keep at least 14 seats." |

**Platform display:** "Seats used / limit" = persons / seats for Suite, members / quantities.work for custom with Work, otherwise members / –.

### 6.5 Access state machine: `effectiveStatus()` and `accessLevel()` (pure; `lib/plans`)

Constants: `TRIAL_DAYS = 15`, `READ_ONLY_DAYS = 30`, `PAST_DUE_GRACE_DAYS = 7` **[proposal]**.

```
effectiveStatus(sub, now) → { status, since? }
  trialing : now <  trialEndsAt                 → 'trialing'
             now >= trialEndsAt                 → 'expired', since = trialEndsAt
  active   : now <  currentPeriodEnd            → 'active'
             now >= currentPeriodEnd            → 'past_due', since = currentPeriodEnd   // no renewal recorded (no webhook, or a manual plan lapsed)
  past_due :                                     'past_due', since = pastDueSince ?? currentPeriodEnd
  canceled : now <  currentPeriodEnd            → 'canceled'   (still inside the paid period)
             now >= currentPeriodEnd            → 'expired', since = currentPeriodEnd
  expired  :                                     'expired', since = endedAt ?? currentPeriodEnd ?? trialEndsAt

accessLevel(sub, now) → 'full' | 'read_only' | 'blocked'
  trialing | active | canceled(in period)        → 'full'
  past_due : now < since + 7d                    → 'full'       (banner)
             now < since + 7d + 30d              → 'read_only'
             else                                → 'blocked'
  expired  : now < since + 30d                   → 'read_only'
             else                                → 'blocked'
  Org.disabled set (any status)                  → 'blocked' (platform; different page copy)
  Org.deletedAt set                              → no access (requireMember treats it as no membership)
```

Store the transition when you observe it (lazily, on the next request that loads the org, or in the webhook). Always compute access from `effectiveStatus`, so a missed write never grants or removes access by mistake. The draft's motto applies: "derived, never stored".

**Days left in trial** = `max(0, ceil((trialEndsAt − now) / 1 day))` (the draft's `trialDaysLeft`). The trial end date is shown as the IST date of `trialEndsAt` ("16 Oct 2026").

**Enforcement** **[needs foundation: `action()` and `requireMember()`]**:

1. **`read_only`**: `action()` refuses every write unless the action is marked `allowReadOnly: true`. The message depends on the reason:
   - Trial ended: **"Your trial has ended — choose a plan to keep editing"** (SPEC, verbatim).
   - Subscription ended or payment overdue: "Your subscription has ended — choose a plan to keep editing".

   Route handlers that write (uploads, imports, the check-in punch) apply the same check. **Public routes that write** also refuse: the Muster claim form `/c/[slug]` shows "This form isn't accepting claims right now." (muster-b).

   The allowlist (`allowReadOnly`):
   - all subscription and checkout actions (6.7–6.11)
   - billing details
   - profile, password, sessions, appearance prefs
   - mark notifications read
   - sign out and switch workspace
   - reads and exports, which are not actions anyway
2. **`blocked`**: `requireMember()` redirects every `/app/**` page except `/app/settings/subscription` to that page. Sign out (avatar menu) and the workspace switcher keep working. On that page:
   - Viewers with `billing.manage` see the plan picker.
   - Everyone else sees a centred card: "{Workspace} is locked until a plan is chosen. Your data is safe. Ask {ownerName} ({ownerEmail}) to choose a plan." with a Sign out button.
3. **`disabled`** (platform): every `/app/**` page shows "{Workspace} has been disabled by Flowbit. Reason: {reason}. Contact {SUPPORT_EMAIL}." Nothing else renders, including the subscription page.

**Banners.** The foundation shell renders them. Content comes from a pure `subscriptionBanner(org, now, canManageBilling)` that the settings agent can provide.

| State | Style | Copy (billing.manage viewer; others get the same text without the link) |
|---|---|---|
| trialing, more than 3 days left | small chip in the top bar | "Trial · 12 days left" → link "Choose plan" |
| trialing, 3 days or fewer | warning banner | "Your trial ends on 16 Oct 2026 (in 3 days). Choose a plan to keep editing after that." |
| past_due, in grace | danger banner | "We couldn't renew your subscription on 1 Nov 2026. Update payment by 8 Nov 2026 to keep editing." |
| canceled, in period | info banner | "Your subscription ends on 31 Oct 2026. Choose a plan to continue after that." |
| read_only (trial) | danger banner | "Your trial has ended — choose a plan to keep editing. Read-only until 15 Nov 2026." |
| read_only (subscription) | danger banner | "Your subscription has ended — choose a plan to keep editing. Read-only until 15 Nov 2026." |
| blocked / disabled | full page | as above |

**Trial reminders.** There are no cron jobs. When the workspace layout loads and the trial has 3 days or fewer left, call `ensureTrialReminder(org, '3d')`. At 1 day or fewer, call it with `'1d'`. Each creates **once**:
- a notification to every member with `billing.manage` ("Your trial ends in 3 days", href `/app/settings/subscription`, kind `subscription.trial_ending`)
- one email (kind `subscription`)

**[needs foundation]** Idempotency needs `Notification.dedupeKey?: string` with a unique partial index on `{ orgId, userId, dedupeKey }`, for example `trial-3d`.

### 6.6 Subscription page layout and per-state content

**Header:** "Subscription". Status pill: Trial (info), Active (success), Payment due (warning), Ending (info), Read-only (danger), Locked (danger).

**Card "Current plan"** (always shown):

| State | Shows | Buttons |
|---|---|---|
| trialing | "Free trial: every product switched on". Big countdown "12 days left", with a gradient progress bar of trial elapsed. "Ends 16 Oct 2026." | "Choose a plan" scrolls to the picker |
| active | Plan name: "Suite: 25 people" or "Work 7 · Muster Business 12 · Folio". Cycle. Amount: "₹3,725.00 per month + GST (₹4,396 incl. GST)". "Renews on 1 Nov 2026". Payment: "Razorpay · sub_Ox…F3" or "Test mode (simulated)" or "Set by Flowbit". | "Change plan"; "Cancel subscription" (owner only; not for manual plans) |
| past_due | Same, plus "Payment failed on 1 Nov 2026." | "Retry payment": opens Razorpay checkout for the same subscription in real mode, or "Simulate payment" in test mode |
| canceled | "Ends on 31 Oct 2026. You won't be charged again." | "Choose a plan" (starts at period end, 6.10) |
| expired / read-only | "Your trial ended on 16 Oct 2026" or "Your plan ended on 31 Oct 2026". "Read-only until 15 Nov 2026." | picker shown expanded |
| blocked | "Locked since 15 Nov 2026. Your data is safe." | picker shown expanded |

**Card "Usage"** (6.4): one meter per limit, for example "People 12 / 25", "Muster employees 20 / 20 · at limit". Meters use the progress gradient; at the limit the fill turns `--warning`. During the trial there are no limits; show counts with "Your plan will be priced on these numbers."

**Pending change notice** (when `pendingChange` is set): "From 1 Nov 2026: Suite, 20 people, monthly (₹2,980 + GST)." with a "Cancel change" button. Toast: "Scheduled change cancelled."

**Card "Billing details"** (6.7.3). **Card "Billing history"** (6.12.6).

**Test-mode affordances** (no Razorpay keys, development only): a "Test mode" pill in `--warning` next to the header, and on the active card a ghost button "Simulate renewal" (6.10).

### 6.7 Plan picker

Shown inline for trialing, expired and blocked workspaces. Shown in a large dialog from "Change plan" when active.

**6.7.1 Controls**
- **Cycle:** segmented control Monthly | Yearly, with a "50% off year 1" chip on Yearly. Default Monthly, or the current cycle when changing.
- **Two choice cards** side by side, stacked on mobile. The selected one gets the gradient border, a "Selected" tab and plays `toggle`.
  - **Suite: all four products** (badge "Best value"). Work, Muster Business, Orbit, Folio. People stepper: min 10, max 10,000, default `max(10, persons)`. "₹149 per person / month."
  - **Pick products.** Four rows, each with a checkbox, product name in its accent dot, price and a quantity stepper:
    - Work: users, min 5, default `max(5, members + pendingInvites)`. Hint "Everyone who signs in counts."
    - Muster: radio Starter (₹39, no payroll) / Business (₹79, payroll, PF/ESI/PT). Employees: min 10, default `max(10, employees)`.
    - Orbit: sales users, min 2, default `max(2, orbitUsers)`.
    - Folio: flat ₹399, "includes 3 users".
- **Preselection from the URL:**
  - `?add=orbit`: Pick products, with the current products plus Orbit checked. The Suite card shows the Suite hint.
  - `?muster=business`: the Muster tier set to Business.
- **Live summary** (right column, sticky on desktop):
  - lines with minimum notes
  - subtotal per period
  - GST 18% (split once billing state is known: "CGST 9% ₹160.92 · SGST 9% ₹160.92", or "IGST 18% ₹321.84")
  - round off
  - **Total**
  - for yearly, "That's ₹1,490 a month + GST" and "You save ₹3,576 a year"
  - the Suite hint when it applies

  Numbers update with a 150 ms fade (no animation under reduced motion).

**6.7.2 Validation** (zod on the server, mirrored on the client):
- Quantities: integers, ≥ the minimum, ≤ 10,000.
- **Each quantity must be ≥ current usage.** Example field error: "You have 14 active members. Disable some first, or choose at least 14." The same applies to employees, Orbit users and Suite persons.
- Custom must have at least one product: "Choose at least one product."
- During an active subscription, an unchanged selection is refused: "That's your current plan."

**6.7.3 Billing details** (required before payment; prefilled from General). Action `saveBillingDetails`, allowed in read-only mode. Fields:
- `legalName`: 2–120, required. "Name on the invoice".
- `email`: required, valid. "Invoices are emailed here."
- `phone`: optional, `/^[6-9]\d{9}$/`. Used to prefill Razorpay.
- `gstin`: optional, validated as in 5.1, and must match `stateCode`. Copy: "Add your GSTIN to claim input tax credit."
- `address.line1`: required, ≤ 120. `line2`: optional.
- `city`: required. `stateCode`: required (this is the place of supply). `pincode`: 6 digits, not starting with 0.

Changes apply to future invoices only. Issued invoices keep their snapshot. Toast: "Billing details saved."

**6.7.4 Continue**
The primary gradient button reads "Continue to payment · ₹2,110". With missing billing details it scrolls to that card and shows field errors. It then runs the checkout for the mode (6.8 or 6.9). For an active subscription it routes to upgrade or downgrade (6.11).

### 6.8 Checkout: Razorpay mode (keys set)

Server code lives in `src/modules/settings/billing/razorpay.ts` and calls the Razorpay REST API with `fetch`, Basic auth `KEY_ID:KEY_SECRET`, base `https://api.razorpay.com/v1`. Do not add the Razorpay SDK (SPEC: no new frameworks). **The builder must check request and response field names against Razorpay's current docs; they are given here from memory.**

1. **`startCheckout(selection, cycle)`** (`billing.manage`, allowReadOnly). Allowed when the effective status is trialing, expired, past_due-after-halt or blocked, or canceled with the period ended.
   - Validate (6.7.2) and require billing details.
   - Compute `quote` and totals with the billing state.
   - **Create a plan:** `POST /plans` with `{ period: 'monthly'|'yearly', interval: 1, item: { name: 'Flowbit Suite · 12 people', amount: totalPaise /* GST-inclusive: the customer pays the total */, currency: 'INR', description }, notes: { orgId } }`.
   - **Create a subscription:** `POST /subscriptions` with `{ plan_id, total_count: monthly ? 120 : 10, quantity: 1, customer_notify: 1, notes: { orgId, number: 'pending' } }`. Without `start_at` the first charge happens at authorisation.
   - Save `subscription.pendingCheckout = { razorpaySubscriptionId, razorpayPlanId, selection, amountPaise, totalPaise, createdAt }`.
   - Return `{ keyId, subscriptionId, name: 'Flowbit', description: plan label, prefill: { name: legalName, email, contact: phone }, theme: { color: '#BB62A5' } }`.
2. **Client:**
   - Load `https://checkout.razorpay.com/v1/checkout.js` with `next/script` and `strategy="lazyOnload"`.
   - Run `new window.Razorpay({ key, subscription_id, name, description, prefill, theme, handler, modal: { ondismiss } })` and call `.open()`.
   - On dismiss, show the toast info "Payment window closed. Nothing was charged." and play `pop`.
3. **`confirmCheckout({ razorpay_payment_id, razorpay_subscription_id, razorpay_signature })`** (allowReadOnly):
   - The subscription id must equal `pendingCheckout.razorpaySubscriptionId`.
   - Verify `HMAC_SHA256(razorpay_payment_id + '|' + razorpay_subscription_id, KEY_SECRET)` as hex, using `crypto.timingSafeEqual`. Note the order: **payment id first** for subscriptions. For orders (6.11) it is `order_id|payment_id`.
   - On success call **`activateSubscription(orgId, selection, cycle, payment)`** (shared with test mode and renewals).
   - On a mismatch: `{ ok:false, error: "We couldn't verify that payment. If money left your account, it will be refunded by Razorpay; contact support." }`, plus a server-side log.
4. **`activateSubscription`**, in **one transaction**:
   - Set `status 'active'`, `plan`, `products`, `quantities`, `seats`, `cycle`, `amountPaise`.
   - Set `currentPeriodStart = now` and `currentPeriodEnd = addPeriod(now, cycle)`. In Razorpay mode prefer `current_start`/`current_end` from the subscription entity when known.
   - Set `razorpaySubscriptionId`, `razorpayPlanId`; clear `pendingCheckout`, `pastDueSince`, `endedAt`, `cancelAtPeriodEnd`.
   - Add newly entitled products to `enabledProducts` (2.2).
   - Issue the invoice: `nextSeq` gives the number (6.12.2) and the row is inserted.
   - Write the `BillingEvent`.
   - `audit(ctx, { action: 'subscription.activated', summary: 'Suite, 12 people, monthly activated: ₹2,110 paid' })`.

   **After commit:**
   - email the invoice PDF to `billing.email` (kind `subscription_invoice`)
   - notify every `billing.manage` holder ("Subscription active: Suite, 12 people")
   - `revalidatePath('/app', 'layout')`
   - the client plays `success` then `whoosh` and shows the toast "You're on Suite. Invoice FB/2026-27/0007 is in your billing history."

   `addPeriod` adds 1 calendar month for monthly and 12 for yearly. Clamp the day like Billing OS `addBillingPeriod`: a period starting on 31 Jan ends at 28/29 Feb, not 3 Mar.
5. **Idempotency:** if `payment.paymentId` already exists on a `SubscriptionInvoice`, return ok without reissuing. The handler and the webhook can both arrive.

### 6.9 Checkout: Test mode (no keys)

- **UI:**
  - The summary shows a warning pill **"Test mode"** and the line: "Razorpay keys aren't set, so payments are simulated. Use this only on your own machine."
  - The button reads **"Simulate payment · ₹2,110"** (gradient pill; plays `click`).
- **`simulatePayment(selection, cycle)`** (`billing.manage`, allowReadOnly):
  - **Refuses** when either Razorpay key is set, or `NODE_ENV === 'production'`: "Simulated payments only work in local development."
  - Otherwise calls `activateSubscription` with `payment = { provider: 'simulated', paymentId: 'sim_' + 12 random base36 chars, paidAt: now }`. The invoice gets `isTest: true`.
  - Same toast, sounds and audit (`meta.simulated: true`).
- **"Simulate renewal"** (active and test mode only): runs the renewal path (6.10) as if `subscription.charged` arrived. This lets the period roll and the next invoice appear without waiting a month.
- **Testing read-only and blocked states:** platform admins use "End trial now" and "Extend trial" (11.3). There is no other back door.

### 6.10 Renewals, failures, cancellation

**Webhook** `POST /api/billing/razorpay/webhook` (route handler, settings agent):
- Verify `X-Razorpay-Signature` = `HMAC_SHA256(rawBody, RAZORPAY_WEBHOOK_SECRET)` hex. Read the raw text **before** `JSON.parse`. Respond 400 on mismatch, or when the secret is unset ("webhook not configured").
- Insert a `BillingEvent` keyed by the `x-razorpay-event-id` header; a duplicate means respond 200 and do nothing.
- Find the org by `payload.subscription.entity.id` = `subscription.razorpaySubscriptionId` (through `platformDb`).
- Respond 200 quickly. Process inline (no queue) and record `processedAt` or `error`.

| Event | Effect |
|---|---|
| `subscription.activated` | If still pending (the handler never confirmed, for example the tab closed), activate with the payment from the event (same idempotency) |
| `subscription.charged` | If the payment id is already invoiced (first charge), skip. Otherwise a **renewal**: set period start/end from the entity's `current_start`/`current_end`. Apply `pendingChange` if `effectiveAt ≤ now`, after re-checking capacity (if usage now exceeds it, keep the old quantities and notify "Your scheduled change wasn't applied: 14 members are active but the new plan has 12 seats."). Set status active, clear `pastDueSince`, issue invoice (kind `subscription`), email it, notify. Audit `subscription.renewed`. |
| `subscription.pending` | Status `past_due`, `pastDueSince ??= now`. Notify billing managers: "Payment for Flowbit failed. Razorpay will retry; update your payment method." Audit `subscription.payment_failed`. |
| `subscription.halted` | Razorpay has stopped retrying. Status `expired`, `endedAt = now`. Cancel the Razorpay subscription. Workspace goes read-only now (accessLevel). Notify and email. Audit `subscription.halted`. The customer re-subscribes through checkout. |
| `subscription.cancelled` | Status `canceled`, `canceledAt`. Access continues to `currentPeriodEnd`, then expired. |
| `subscription.completed` | Status `expired`, `endedAt = now` (all 120/10 cycles used, effectively never) |
| `payment.failed` | Notification only, if not already sent for this period |

**Without a webhook secret** (keys set but no secret), renewals are invisible. `effectiveStatus` turns an `active` subscription past its period end into `past_due`, and after the 7-day grace into read-only. The Integrations page warns about this (5.9).

**Cancel** (`cancelSubscription`, **owner only**; admins never hold `billing.manage` by default; allowReadOnly):
- ConfirmDialog: "Cancel your subscription? You keep full access until 31 Oct 2026. After that the workspace becomes read-only for 30 days, then locked. Your data stays." The user must type CANCEL.
- Razorpay mode: `POST /subscriptions/{id}/cancel` with `{ cancel_at_cycle_end: 1 }`.
- Set `cancelAtPeriodEnd: true` and `canceledAt`. The status becomes `canceled` when Razorpay's event arrives; in test mode, set it directly.
- Toast "Subscription cancelled. Full access until 31 Oct 2026." Audit `subscription.canceled`. Notify billing managers.

**Choosing a plan after cancelling, inside the paid period:** start a new checkout whose subscription has `start_at` = `currentPeriodEnd` (unix seconds), so nobody pays twice for the same days. Razorpay cancellations can't be undone, so there is no "resume" button; copy: "To keep Flowbit after 31 Oct, choose a plan. It starts when this one ends."

### 6.11 Plan changes while active

One rule each way:

1. **Increases** (more seats or quantities, adding a product, Muster Starter → Business, custom → Suite when Suite costs more) **apply now**. You pay a **prorated one-off charge** for the rest of the current period, and renewals charge the new amount.
   - **Proration** (`prorate()`, pure):
     ```
     remainingDays = ISTdays(today → periodEndExclusive)
     totalDays     = ISTdays(periodStart → periodEndExclusive)
     amount        = round((newAmountPaise − oldAmountPaise) × remainingDays / totalDays)
     ```
     Both amounts are per period, excluding GST. If the result is ≤ 0 it is not an increase.
   - Worked example: Suite 10 → 14 people on 17 Oct 2026, monthly period 1 Oct to 1 Nov (31 days, 15 remaining). Difference ₹596.00 → 59,600 × 15 / 31 = 28,838.7 → **₹288.39** taxable. GST 18% = 5,191.02 → 5,191 paise.
     - Intra-state: CGST 2,596 / SGST 2,595, levelled to 2,595 + 2,595 = 5,190. Total 34,029 paise rounds to **₹340.00** (round off −₹0.29).
     - Inter-state: IGST ₹51.91. Total ₹340.30 rounds to ₹340.00.
   - **Razorpay mode:**
     - Create an **Order**: `POST /orders` with `{ amount: totalPaise, currency: 'INR', receipt: 'upg_<orgId>_<ts>', notes: { orgId, kind: 'upgrade' } }`.
     - Open Checkout with `order_id`, then verify `HMAC_SHA256(order_id + '|' + payment_id, KEY_SECRET)`.
     - On success, in a transaction: update `products`/`quantities`/`seats`/`amountPaise` and issue an invoice of kind `upgrade`. The line reads "Upgrade: Suite 10 → 14 people, 17 Oct 2026 to 31 Oct 2026 (15 of 31 days)".
     - Then move the Razorpay subscription to a new plan at the new amount: create the plan, then `PATCH /subscriptions/{id}` with `{ plan_id, schedule_change_at: 'cycle_end', customer_notify: 1 }`.
     - **Verify against the docs:** Razorpay limits subscription updates by payment method (UPI mandates have an amount ceiling). If the update fails, cancel at cycle end and create a new subscription with `start_at = currentPeriodEnd`. Either way, record the new `razorpaySubscriptionId` when it changes.
   - **Test mode:** "Simulate payment · ₹340" does the same without Razorpay.
   - Toast "Upgraded to Suite, 14 people. Invoice FB/2026-27/0012 for the remaining 15 days." Audit `subscription.upgraded`.
2. **Decreases** (fewer seats, removing a product, Business → Starter, any cycle change, Suite → custom when cheaper) **apply at the next renewal.**
   - Validate against current usage (6.7.2). Set `pendingChange` with `effectiveAt = currentPeriodEnd`.
   - Razorpay mode: create the new plan and `PATCH /subscriptions/{id}` with `schedule_change_at: 'cycle_end'`; same fallback as above.
   - Copy: "From 1 Nov 2026 you'll be on Work 7 · Folio, ₹812 + GST a month." Audit `subscription.change_scheduled`. "Cancel change" clears it (Razorpay: patch back to the current plan).
   - **Removing a product at renewal:** it simply stops being entitled. Data stays and comes back if it is bought again (2.2).

Changes during the trial or after expiry are new checkouts, not changes.

### 6.12 Flowbit-issued GST invoice

**6.12.1 Supplier details** **[proposal; needs foundation `.env.example`]**:
- Read from env: `FLOWBIT_LEGAL_NAME` (default "Flowbit Technologies"), `FLOWBIT_GSTIN`, `FLOWBIT_PAN`, `FLOWBIT_STATE` (2-letter, e.g. `MP`), `FLOWBIT_ADDRESS` (one line), `FLOWBIT_SAC` (default `998314`), `SUPPORT_EMAIL`.
- Put them in one module, `src/modules/settings/billing/supplier.ts`.
- **The user must supply the real GSTIN, address and SAC before going live.**
- SAC 998314 ("IT design and development services") is a common choice for SaaS but **needs confirmation by the user's CA**. 997331 (software licensing) is the usual alternative.
- When `FLOWBIT_GSTIN` is unset, invoices render "GSTIN: not registered" and the PDF carries a **"DRAFT — supplier GSTIN not set"** watermark. Never invent a GSTIN.

**6.12.2 Numbering**
- Format **`FB/{FY}/{seq padded to 4}`**, for example `FB/2026-27/0001`.
- The FY starts in April: `fiscalYear(issueDate)` (SPEC `lib/dates`; Billing OS `financialYearOf`). A date in Jan–Mar belongs to the previous FY. The series restarts each FY.
- **One series across all workspaces** (Flowbit is the issuer), so the counter can't be per org. **[needs foundation]** Either `nextSeq` accepts a platform scope, for example `nextSeq(PLATFORM_ORG_ID, 'fb-invoice:2026-27')` with a fixed constant ObjectId, or `Counter.orgId` is allowed to be null.
- Call it **inside the activation transaction** so a rolled-back activation doesn't burn a number. The series stays gapless.
- Cancelled invoices keep their number. Billing OS: "a statutory series may contain cancellations, but it may not contain gaps".

**6.12.3 Tax computation** (`subscriptionInvoiceTotals(lines, supplyType)`, ported from `vistaar-billingos/lib/invoice/totals.ts` and `gst.ts`):
- **Place of supply** = the customer's billing `stateCode`. When a GSTIN is given, its first two digits must agree with that state (validated in 6.7.3).
- **Supply type:**
  - `intra_state` when the customer's state equals `FLOWBIT_STATE`, otherwise `inter_state`.
  - If either state is unknown, use `inter_state`. Billing OS reasoning: wrongly charged IGST is the recoverable mistake; wrongly split CGST/SGST isn't.
- Per line: `taxable = amountPaise`, `tax = round(taxable × 18 / 100)`.
- Intra-state: `half = round(tax / 2)`; CGST = half, SGST = tax − half. If CGST ≠ SGST, set both to `min(CGST, SGST)` (costs at most one paisa per line, keeps them equal). Inter-state: IGST = tax.
- Totals are sums over lines. `beforeRounding = taxable + tax`. `total = round(beforeRounding / 100) × 100`. `roundOff = total − beforeRounding`.
- The rate is always 18%. No discounts, no TDS in v1.
- Export and SEZ customers are out of scope: refuse a non-Indian address ("Flowbit bills Indian businesses only for now").

**6.12.4 PDF** (`@react-pdf/renderer`, rendered on demand from the frozen snapshot):
- SPEC's `lib/pdf/base.tsx` letterhead uses the **org's** details. This invoice's issuer is **Flowbit**, so pass a supplier override or build a small Flowbit header. **[needs foundation: an `issuer` prop on `PdfDocument`]**
- Content, top to bottom:
  - "TAX INVOICE" (or "TAX INVOICE — TEST, simulated payment, not valid for tax" when `isTest`).
  - The Flowbit mark and legal name, address, GSTIN, PAN, email.
  - Invoice no., invoice date, place of supply ("Madhya Pradesh (23)"), "Reverse charge: No".
  - **Bill to:** legal name, address, GSTIN or "Unregistered".
  - Lines table: # · Description · SAC · Qty · Rate · Taxable value.
  - Tax rows "CGST 9%" and "SGST 9%", or "IGST 18%". Round off. **Total**.
  - **Amount in words** using Indian numbering, for example "Indian Rupees Two Thousand One Hundred Ten Only" (lakh/crore). Check `lib/money` first; if it lacks this, write a local helper with tests.
  - Payment line "Paid via Razorpay · pay_Ox… · 1 Oct 2026", "Simulated payment (test mode)", or "Set by Flowbit (no charge)".
  - Footer "This is a computer-generated invoice and needs no signature."
- Work Sans. Dark accents are fine on screen, but **print the PDF on white** (light background, dark text); SPEC's dark theme applies to the app, not to printed documents.

**6.12.5 Line descriptions**
- "Flowbit Suite — 12 people × ₹149.00 per month · 1 Oct 2026 to 31 Oct 2026"
- Yearly: "Flowbit Suite — 12 people × ₹1,490.00 per year · 1 Oct 2026 to 30 Sep 2027"
- Custom: "Flowbit Work — 7 users", "Muster Business — 12 employees", "Orbit — 2 sales users", "Folio — workspace, includes 3 users".
- When a minimum applied, add a second line of description text: "Billed for the 10-person minimum (8 in use)".

**6.12.6 Billing history table** (subscription page):
- Columns: Number · Date · Period · Amount (incl. GST) · Payment (Razorpay id short / "Test") · Status (Paid / Cancelled) · PDF.
- The PDF button links to `GET /api/billing/invoices/[id]/pdf`. The handler checks `billing.manage` and `invoice.orgId === ctx.orgId`, or a platform admin. It streams with `Content-Disposition: inline; filename="Flowbit-FB-2026-27-0001.pdf"`.
- Newest first. Paginate at 24.
- Empty: "No invoices yet. Your first one appears here as soon as you choose a plan."
- "Email again" per row (allowReadOnly) re-sends the PDF to the current billing email. Toast "Invoice FB/2026-27/0003 sent to accounts@vistaarwebx.com."

**6.12.7 Invoices are never edited or deleted.** A platform admin can cancel one with a reason (11.3). The number stays and the PDF gets a "CANCELLED" watermark. Refunds are handled outside the app in v1.

### 6.13 Emails and notifications for billing events

| Event | Notification (to billing.manage holders) | Email (to billing email; kind) |
|---|---|---|
| Trial ends in 3 days / 1 day | "Your trial ends in 3 days" | yes (`subscription`) |
| Trial ended | "Your trial has ended: {Workspace} is read-only until 15 Nov 2026" (to **all** members) | yes |
| Activated / renewed / upgraded | "Subscription active: Suite, 12 people" / "Renewed: invoice FB/2026-27/0021" | invoice PDF attached (`subscription_invoice`) |
| Payment failed | "Payment for Flowbit failed" | yes |
| Halted (stopped retrying) | "Payments stopped: {Workspace} is read-only" (all members) | yes |
| Cancelled | "Subscription cancelled: full access until 31 Oct 2026" | yes |
| Scheduled change applied or refused | "Your plan changed to Work 7 · Folio" / "Scheduled change not applied: …" | no |
| Trial extended or plan changed by Flowbit | "Flowbit extended your trial to 30 Oct 2026" | yes |

### 6.14 Audit actions (settings agent)

All under entity `Subscription` with `entityId = orgId`. Every one has a human `summary`, and `meta` holds `{ before, after }` of the changed subscription fields plus `invoiceNumber`, `paymentId`, `simulated`.

The actions: `subscription.billing_details_updated`, `subscription.activated`, `subscription.renewed`, `subscription.upgraded`, `subscription.change_scheduled`, `subscription.change_cancelled`, `subscription.change_applied`, `subscription.payment_failed`, `subscription.halted`, `subscription.canceled`, `subscription.expired`, `subscription.invoice_emailed`, `platform.trial_extended`, `platform.trial_ended`, `platform.plan_changed`, `platform.workspace_disabled`, `platform.workspace_enabled`, `platform.workspace_restored`, `platform.invoice_cancelled`.

---

## 7. Roles and the permission matrix

### 7.1 Proposed permission catalog **[proposal; the foundation's `lib/permissions.ts` is authoritative]**

The settings UI must render whatever catalog the foundation ships, **generically**: groups → permissions with label and note. Never hardcode keys in the settings pages.

This catalog is assembled from:
- the keys SPEC already names: `org.manage`, `members.manage`, `roles.manage`, `billing.manage`, `audit.read`, `tasks.write`, `payroll.run`
- the SPEC role table
- PeopleOS `src/lib/auth/permissions.ts`: grouped with labels and notes, "so twenty-eight checkboxes read as six decisions"
- Billing OS `lib/auth/permissions.ts`: the prepare vs issue split
- the CRM role table: intern / reviewer / admin

The draft's 18 flat keys are too coarse.

**Scope rule (from PeopleOS, keep it):** row visibility comes from permissions, never from role names. That is what makes custom roles work without code changes.
- `people.read`: the role sees every employee.
- `people.read_team`: the role sees its reporting chain at any depth (via `managerId`).
- Approvals (leave, attendance corrections, timesheets) act on whoever the role can see.
- `payroll.read` is the single switch that exposes salary.
- The draft checks role names in several places, for example `['owner','admin','hr','lead'].includes(role)`. Don't port that.

| Group (product) | Key | Label | Note |
|---|---|---|---|
| Workspace (core) | `org.manage` | Change workspace settings | General, Modules, Integrations, Email log |
| | `members.manage` | Invite and manage members | Invite, change roles, disable |
| | `roles.manage` | Create roles and change permissions | |
| | `billing.manage` | Manage the subscription | Owner by default. Only a holder can grant it |
| | `audit.read` | Read the audit log | |
| Work | `tasks.write` | Create and edit tasks | Comments, subtasks, attachments |
| | `tasks.delete` | Delete anyone's tasks | Without it, people delete only tasks they created |
| | `projects.write` | Create and edit projects | Milestones, members, archive |
| | `spaces.manage` | Create and edit spaces and folders | |
| | `teams.manage` | Create and edit teams | |
| | `meetings.write` | Schedule meetings | |
| | `posts.write` | Write posts | |
| | `posts.manage` | Pin and remove anyone's posts | |
| | `whiteboards.write` | Create and edit whiteboards | |
| | `time.approve` | Approve timesheets | For whoever the role can see |
| | `work.reports.read` | Run Work reports | |
| Clients (shared) | `clients.read` | See clients | |
| | `clients.write` | Add and edit clients | |
| Muster | `people.read` | See everyone in HR | Without it, only themselves and their team |
| | `people.read_team` | See their reporting chain | For managers |
| | `people.read_sensitive` | See PAN, UAN, ESIC and bank details | Restricted |
| | `people.write` | Add and edit employees | |
| | `people.import` | Bulk import from CSV | |
| | `attendance.read` | See the attendance register | |
| | `attendance.write` | Mark attendance and approve corrections | |
| | `attendance.lock` | Lock a month | |
| | `leave.approve` | Approve or reject leave | |
| | `claims.review` | Approve or reject claims | |
| | `claims.forms` | Create and close claim forms | |
| | `claims.pay` | Mark claims paid | |
| | `payroll.read` | See salaries and payroll | "The single switch that exposes pay" |
| | `salary.write` | Edit salary structures and assignments | |
| | `payroll.run` | Generate payroll and HR review | |
| | `payroll.approve` | Approve payroll (finance) | |
| | `payroll.release` | Lock, release and publish payslips | |
| | `payroll.unlock` | Reopen a locked payroll month | Always audited |
| | `letters.read` | See issued letters | |
| | `letters.write` | Issue and revoke letters | |
| | `letters.templates` | Edit letter templates | |
| | `hr.settings` | Change HR settings | Departments, designations, holidays, leave types, attendance rules, policy documents |
| | `hr.reports.read` | Run HR reports | |
| Orbit | `orbit.read` | See all leads and deals | Without it, only their own |
| | `orbit.write` | Work leads, deals and activities | **Counts as a sales user** (6.4) |
| | `orbit.review` | Close deals and reassign owners | Proposal sent / Won / Lost, reopen (CRM "reviewer") |
| | `orbit.settings` | Change Orbit settings | Stages, sources, lost reasons, sectors |
| Folio | `folio.read` | See invoices, receipts and ledgers | |
| | `folio.quotes.write` | Create quotes | |
| | `folio.invoices.write` | Prepare draft invoices | |
| | `folio.invoices.issue` | Issue, void and credit invoices | "Spends a number from a statutory series", so it is kept separate from preparing |
| | `folio.receipts.write` | Record and allocate receipts | |
| | `folio.recurring.write` | Manage recurring retainers | |
| | `folio.reports.read` | Run Folio reports | |
| | `folio.settings` | Change Folio settings | Entities, series, tax rates, bank accounts |

Workspace deletion is **not** a permission. It belongs to the owner alone (SPEC). Self-service (`/app/me/*`) needs no permission, only a linked employee record (SPEC).

### 7.2 Built-in roles: default grants **[proposal, derived from the SPEC role table]**

`x` = granted. Owner holds everything via a short-circuit (no stored list), plus workspace deletion.

| Key | admin | hr_admin | hr_exec | finance | manager | sales | member |
|---|---|---|---|---|---|---|---|
| org.manage | x | | | | | | |
| members.manage | x | | | | | | |
| roles.manage | x | | | | | | |
| billing.manage | | | | | | | |
| audit.read | x | x | | x | | | |
| tasks.write | x | x | x | x | x | x | x |
| tasks.delete | x | | | | x | | |
| projects.write | x | | | | x | | |
| spaces.manage | x | | | | x | | |
| teams.manage | x | | | | x | | |
| meetings.write | x | x | x | x | x | x | x |
| posts.write | x | x | x | x | x | x | x |
| posts.manage | x | x | | | x | | |
| whiteboards.write | x | x | x | x | x | x | x |
| time.approve | x | | | | x | | |
| work.reports.read | x | | | x | x | | |
| clients.read | x | | | x | x | x | x |
| clients.write | x | | | | x | x | |
| people.read | x | x | x | x | | | |
| people.read_team | x | | | | x | | |
| people.read_sensitive | x | x | | x | | | |
| people.write | x | x | x | | | | |
| people.import | x | x | | | | | |
| attendance.read | x | x | x | x | x | | |
| attendance.write | x | x | x | | x | | |
| attendance.lock | x | x | | | | | |
| leave.approve | x | x | x | | x | | |
| claims.review | x | x | x | | | | |
| claims.forms | x | x | | | | | |
| claims.pay | x | | | x | | | |
| payroll.read | x | x | | x | | | |
| salary.write | x | x | | | | | |
| payroll.run | x | x | | | | | |
| payroll.approve | x | x | | x | | | |
| payroll.release | x | x | | x | | | |
| payroll.unlock | x | x | | | | | |
| letters.read | x | x | x | x | x | | |
| letters.write | x | x | x | | | | |
| letters.templates | x | x | | | | | |
| hr.settings | x | x | | | | | |
| hr.reports.read | x | x | | x | | | |
| orbit.read | x | | | | x | x | |
| orbit.write | x | | | | | x | |
| orbit.review | x | | | | | x | |
| orbit.settings | x | | | | | x | |
| folio.read | x | | | x | | x | |
| folio.quotes.write | x | | | x | | x | |
| folio.invoices.write | x | | | x | | | |
| folio.invoices.issue | x | | | x | | | |
| folio.receipts.write | x | | | x | | | |
| folio.recurring.write | x | | | x | | | |
| folio.reports.read | x | | | x | | | |
| folio.settings | x | | | x | | | |

How the SPEC wording was interpreted:
- **hr_admin:** "all Muster permissions …". Gets every Muster key except `claims.pay` (SPEC gives claims pay to finance) and `people.read_team` (not needed alongside `people.read`).
- **hr_exec:** "Muster people/attendance/leave/claims/letters, no payroll approve or salary edit". Follows PeopleOS `hr_executive`: no sensitive data, no payroll at all.
- **finance:** "payroll approve/release, claims pay, all Folio permissions, reports". Follows PeopleOS `finance`, so it also sees people and their bank details.
- **manager:** "Work full, approve leave/attendance/time for direct reports, Orbit read".
- **sales:** "Orbit full, Clients write, Folio quotes" (plus `folio.read` so quotes and the client ledger are visible, as Billing OS Sales "sees the books").
- **member:** "Work tasks, own self-service, own claims and leave". Applying for leave or claims needs no permission.

Built-in roles are **read-only** in the UI: they show a lock and the button "Duplicate to customise". This keeps the SPEC table true and removes the PeopleOS "don't lock out the super admin" special case. Custom roles are fully editable.

**Effective permissions:**
```
owner          → all
built-in key   → BUILT_IN[key]
custom role id → Role.permissions ∩ known keys
```
The check is resolved per request (3.3). Permissions for products that are not entitled are inert: `ctx.can` may be true, but `action()` with `opts.product` refuses.

### 7.3 Roles page UI (`/app/settings/roles`, `roles.manage`)

- **Header:** "Roles" with the subtitle "What each role can do. Give roles to people on Members." Primary button "New role".
- **Matrix view** (default, desktop):
  - Rows are permissions grouped by product, with collapsible group headers. Each header shows the product accent dot, the group description (PeopleOS style) and a "Not in your plan" tag when the product isn't entitled.
  - Columns are roles: Owner, the 7 built-ins, then custom roles. Each column header shows the role name, the member count ("4 people") and a lock icon for built-ins.
  - Cells:
    - Owner column: all checked and locked, tooltip "The owner always has every permission".
    - Built-in columns: read-only check marks.
    - Custom columns: toggles when the viewer can edit them (7.4); toggling plays `toggle`.
  - Edits are staged per column. A sticky bar appears: "Project coordinator: 3 changes · Save · Discard".
- **Mobile:** the matrix becomes a role list. Tapping a role opens the role editor sheet: name, description, then grouped checkboxes with "Select all in group".
- **Role editor** (sheet or dialog; for New and Edit):
  - `name`: 2–40 characters, unique in the org case-insensitively, not equal to a built-in label. Error: "A role with that name already exists."
  - `description`: up to 200 characters.
  - "Start from": blank, or a copy of any role.
  - Grouped checkboxes.
- **Row and column menu:**
  - Duplicate: creates "Copy of {name}" with the same permissions and opens it.
  - Rename.
  - Delete (custom only): ConfirmDialog "Delete Project coordinator? This can't be undone." It is blocked when anyone holds the role: "3 people hold this role. Move them to another role from Members first." (PeopleOS copy)
- **Empty state** (no custom roles): a card under the matrix: "No custom roles yet. Duplicate a built-in role to start from something close." with a "Duplicate Manager" button.
- **Toasts:**
  - "Role created: Project coordinator. Give it to someone from Members."
  - "Permissions saved for Project coordinator: 3 added, 1 removed. It applies on each person's next request."
  - "Role deleted: Project coordinator."

### 7.4 Rules (server-enforced)

1. **Anti-escalation.** A member can create, edit or assign only roles whose permissions they hold themselves. The owner is exempt. Refusal names the missing permissions: "You can't grant 'Approve payroll': you don't have it yourself." The old oss-main stated the same rule and the draft's copy promised it ("A role can never grant a permission it doesn't hold"), but the draft never implemented it.
2. Unknown keys are dropped. Duplicate keys are collapsed.
3. `billing.manage` can only be granted by someone who holds it (normally the owner).
4. Built-in roles can't be edited or deleted. The owner role can't be duplicated or assigned (8.7 covers transfer).
5. A custom role in use can't be deleted.
6. **Capacity:** editing a custom role so that its holders gain `orbit.write` or any `folio.*` runs the 6.4 checks. Example refusal: "This would make 3 Orbit sales users; your plan has 2."
7. Audit `role.created` (`meta.after`: name, permissions), `role.updated` (`meta`: added, removed, renamed from/to), `role.deleted` (`meta.before`).
8. **Storage:** `Role { orgId, key (slug of the name, e.g. 'project_coordinator'), label, permissions, builtIn: false }`. `Member.role` stores the built-in key or the custom role's `_id` as a string (SPEC). Built-ins are not stored as Role documents **[proposal]**: `builtIn` exists in SPEC's Role model, but storing read-only copies per org adds nothing.

---

## 8. Members and invites

### 8.1 Data

- `Member { orgId, userId, role, status: 'active'|'invited'|'disabled', title?, department?, managerId?, employeeId?, joinedAt }` (SPEC).
- `Invite { orgId, email, role, tokenHash, invitedBy, expiresAt, acceptedAt? }` (SPEC), plus **[proposal]** `name?`, `title?`, `employeeId?` (link to a Muster employee on accept), `sentAt`, `sendCount`.
- **Recommended:** create the `Member` only when the invite is accepted. The pending state lives in `Invite`, and Member status `'invited'` stays unused unless the foundation needs it.
- Don't add a TTL index; keep expired invites so they can be shown and resent.

### 8.2 Invite people

- **Dialog** "Invite people" (plays `pop`):
  - `emails`: a textarea or chip input; comma, space or newline separated; 1–20 addresses, deduped, lowercased.
  - `role`: select of the roles the actor may grant (7.4), default `member`.
  - Optional `title`.
  - Optional "Link to employee record": only when Muster is on and the viewer has `people.read`. A searchable select of on-payroll employees who have no `memberId`. Choosing one fills the email from `Employee.workEmail` and limits the dialog to one address.
- The Invite button at the bottom of the rail (SPEC shell) opens the same dialog. Show it only to `members.manage` holders.
- **Server checks**, in order, refusing the whole batch with field errors that name each address:
  - Each address is valid.
  - Not already an active member: "aditi@vistaarwebx.com is already a member."
  - Not a disabled member: "aditi@vistaarwebx.com was disabled. Enable them instead."
  - Anti-escalation on the role.
  - Capacity: `members + pendingInvites + new ≤ limit` (6.4). Example: "That needs 3 seats and you have 1 left. Add seats in Settings → Subscription."
  - An existing pending invite for the same address is **replaced** (new token, new expiry). This is a resend, not a duplicate.
- **Effect, per address:**
  - Mint a token (3.4) and save the Invite with `expiresAt = now + 7 days`.
  - `sendMail` (kind `invite`):
    - Subject: "{InviterName} invited you to {Workspace} on Flowbit"
    - Body: Work Sans, a dark header with the gradient mark, the line "Join {Workspace} on Flowbit, where your team plans work, tracks attendance and more.", a gradient button "Join {Workspace}" linking to `${APP_URL}/invite/${token}`, and "This link expires on 8 Oct 2026. If you weren't expecting this, ignore it."
  - Audit `member.invited` (summary "Invited aditi@vistaarwebx.com as HR executive").
- **Success state** in the same dialog: one row per address with a "Copy invite link" button.
  - The raw token exists only at this moment. It can't be shown later; resending mints a new one.
  - This makes local development without Resend workable.
  - When no email provider is configured, add the note "Emails are saved in the Email log, not sent. Share the links yourself."
- **Toast:** "Invitation sent to aditi@vistaarwebx.com." or "Invitations sent to 3 people." Plays `success`.

### 8.3 Resend and revoke

- **Resend:**
  - Rotates the token and sets `expiresAt = now + 7 days`, `sentAt = now`, `sendCount + 1`. Sends the email again.
  - Refused if the last send was under 60 seconds ago: "Invitation just sent. Try again in a minute."
  - Works on expired invites too, after re-running the capacity check.
  - Audit `member.invite_resent`. Toast "Invitation sent again to aditi@vistaarwebx.com."
- **Revoke:**
  - ConfirmDialog "Revoke the invitation for aditi@…? The link stops working."
  - Deletes the Invite (it is not a legal or financial record; the audit row keeps the trace). Audit `member.invite_revoked`.
  - Toast "Invitation for aditi@vistaarwebx.com revoked."

**Draft bug to avoid:** the draft's audit of a revoke passes `after = {}`, and its diff only looks at `after`'s keys, so **no revoke or delete was ever recorded** (section 16).

### 8.4 Change role

- An inline select in the row, or "Change role" in the row menu (dialog with a role description).
- Refused when:
  - changing your own role: "You can't change your own role."
  - the target is the owner, or the new role is `owner` (use transfer, 8.7)
  - the actor fails anti-escalation for the **new** role, or for the member's **current** role (you can't demote someone more powerful than you)
  - capacity fails because the new role gains `orbit.write` or `folio.*` (6.4)
- Effect:
  - Update `Member.role`. It applies on the member's next request.
  - Audit `member.role_changed` with `meta { from, to }`. This is a sensitive action: show it in red in the audit log.
  - Notify the member: "Your role in {Workspace} is now HR executive."
  - Toast: "Aditi Singh is now HR executive. It applies on their next request."

### 8.5 Disable and enable

- **Disable:**
  - ConfirmDialog "Disable Aditi Singh? They're signed out of {Workspace} now and can't sign back in. Their tasks, records and history stay. This frees a seat."
  - Refused for yourself ("You can't disable yourself.") and for the owner.
  - Effect: `Member.status = 'disabled'`; delete their `Session`s whose `activeOrgId` is this org; audit `member.disabled` (sensitive).
  - Toast "Aditi Singh disabled. 1 seat freed."
  - A disabled member stays in assignee lists as "Aditi Singh (disabled)", and nothing they own is reassigned automatically.
- **Enable:**
  - Capacity check first: "No seat free for Aditi Singh. Add a seat or disable someone first."
  - Audit `member.enabled`. Toast "Aditi Singh can sign in again."
- **No hard delete of members.** Billing OS: "deactivated, not deleted, once they have been used — an audit entry names the person … that reference has to keep resolving after they leave."

### 8.6 Edit member details

- Dialog with `title` (≤ 60), `department` (≤ 60 free text) and `managerId` (select of active members; not self; no cycles, so walk up the chain and refuse if the member is found: "That would make a loop: Rahul reports to Aditi.").
- **When the member is linked to an employee** (`employeeId`), department and manager are **read-only here**, with the hint "Managed in HR → People", because Muster's `Employee.departmentId/managerId` is the source of truth for approvals. **[needs foundation/muster decision]** SPEC has `managerId` on both Member and Employee. Recommended rule: for a linked member, `Member.managerId` mirrors the manager employee's member, and only Muster writes it.
- Audit `member.updated`. Toast "Details saved for Aditi Singh."

### 8.7 Transfer ownership (owner only)

- Dialog: choose an active member, then type the workspace name to confirm.
- Effect, in a transaction:
  - The new owner gets `role 'owner'`.
  - The old owner gets `admin`.
  - The subscription's billing managers follow the role change.
  - Audit `org.ownership_transferred` (sensitive).
- Notify both people, and email the new owner.
- Toast: "Rahul Verma now owns {Workspace}. You're an admin."
- There is exactly one owner **[proposal]**.

### 8.8 Link employee (Muster on; needs `members.manage` and `people.write`)

- Select an on-payroll employee whose `memberId` is empty, or unlink.
- Writes `Member.employeeId` and `Employee.memberId` together in a transaction, so self-service starts working.
- Audit `member.employee_linked`. Toast "Aditi Singh linked to employee VW-0007."

### 8.9 Accepting an invite: `/invite/[token]` (foundation page; rules here)

States:

| State | Shows |
|---|---|
| Token unknown, or already accepted | "This invitation link has already been used or doesn't exist. Ask {Workspace} for a new one." |
| Expired | "This invitation expired on 8 Oct 2026. Ask {InviterName} to send a new one." |
| Valid; signed out; a User with that email exists | "Sign in to join {Workspace}". The login form has the email prefilled and locked. After a successful sign-in the user joins. |
| Valid; signed out; no account | "Join {Workspace} on Flowbit": name (2–80), password (8–128), terms checkbox, gradient "Join {Workspace} →". The User is created. |
| Valid; signed in as the invited email | One-click "Join {Workspace}" |
| Valid; signed in as a different email | "This invitation is for aditi@vistaarwebx.com. You're signed in as rahul@… Sign out and continue with that email." |

On join, in a transaction:
- Re-check capacity.
- Create the `Member` with `status 'active'`, `role` from the invite, `title`, and `employeeId` (also set `Employee.memberId`).
- Set `Invite.acceptedAt`.
- Set the session's `activeOrgId` to this org.

After commit:
- Audit `member.joined`.
- Notify the inviter: "Aditi Singh joined {Workspace}."
- Redirect to `/app` and play `whoosh`.

**Do not port** two flows:
- The draft lets anyone holding the token join as an **existing** identity without checking that identity's password. It issues a session for that identity straight away.
- The old oss-main mails a one-time password and forces a password change.

---

## 9. Audit log

### 9.1 Page: `/app/settings/audit` (`audit.read`)

**Filters**, all URL params so a filtered view can be shared:
- `q`: case-insensitive search of `summary`. Escape regex special characters.
- `actor`: member select, plus "Flowbit support" and "System".
- `entity`: select of distinct entities.
- `action`: select of distinct actions grouped by entity.
- `product`: chips Work / Muster / Orbit / Folio / Workspace, derived from the action prefix through a small map in the catalog.
- `from` / `to`: IST dates.
- `page`.

**Table, 50 rows per page:**
- **When:** date and time in IST on two lines (PeopleOS: keeps the column narrow on phones).
- **Who:** avatar, name, and role at that time (snapshot). Platform actions show "Flowbit support"; automated ones show "System" (for example a webhook renewal).
- **Action:** the code as a chip. **Sensitive actions are red:** role changes, member disable, ownership transfer, payroll unlock and release, salary changes, invoice void, letter revoke, subscription cancel, and any `platform.*`.
- **Summary:** the human sentence.
- **Entity:** linked when resolvable, for example a member → Members filtered by name, an invoice → `/app/folio/invoices/[id]`, an employee → `/app/hr/people/[id]`. Otherwise plain text.

**Row expand:** a before → after table of the changed fields from `meta.before` and `meta.after`, plus `meta.reason`, IP and user agent.

**Pagination:** "Newer" / "Older". Fetch `pageSize + 1` rows to know whether older entries exist. PeopleOS fixed exactly this: a full page used to offer an empty "Older" page.

**Export CSV** of the current filter: route handler `GET /api/settings/audit/export?…`, `audit.read`, up to 10,000 rows. RFC 4180 quoting with a UTF-8 BOM (Billing OS: so Excel opens the ₹ sign correctly).

**Empty and edge states:**
- **Empty:** "Nothing recorded yet. Changes to people, salaries, payroll, letters, invoices, roles, members and your subscription appear here as they happen."
- **Filtered empty:** "No entries match these filters." plus "Clear filters".
- **Past the last page:** "Nothing as far back as page 9." plus a "Newest" button (PeopleOS).

### 9.2 Model (foundation)

**[needs foundation]** SPEC only names `AuditLog`. Fields the page needs:

`AuditLog { orgId, actorUserId?, actorMemberId?, actorName, actorRole (snapshots at write time), action, entity, entityId?: string (ObjectId string or other key such as a slug), summary, meta?: { before?, after?, reason?, ...}, ip?, userAgent?, platform: boolean, createdAt }`

Indexes: `{orgId, createdAt:-1}`, `{orgId, action:1, createdAt:-1}`, `{orgId, actorUserId:1, createdAt:-1}`, `{orgId, entity:1, entityId:1, createdAt:-1}`.

The log is append-only: no update or delete path exists anywhere in the app.

### 9.3 How to compute `meta.before` / `meta.after` (fix the draft)

The draft's `audit()` computes `changed = Object.keys(after).filter(k => JSON.stringify(before[k]) !== JSON.stringify(after[k]))`. This has three bugs:
1. **Deletes are never audited.** `after = {}` means no changed keys, so the function returns early. This affected `invite.revoke`, `client.delete`, `task.delete` and `time.delete`.
2. **Task updates are never audited.** The task PATCH route does `Object.assign(before, patch)` before diffing, so before equals after.
3. **The model requires an ObjectId `entityId`,** but `rate.from_ctc` and `period.close` pass a Date. The create fails, the error is caught and logged, and the entry is lost.

Flowbit rule, as a helper the foundation provides, e.g. `diff(before, after)`:
- Compare the **union** of keys.
- Ignore `_id`, `__v`, `orgId`, `createdAt`, `updatedAt`.
- **Redact** `passwordHash`, `tokenHash` and any token. Mask bank account numbers to the last 4 digits.
- For a create, store `after` only. For a delete or void, store `before` only. Neither is ever skipped.
- `summary` is always required, so an entry with no diff still says what happened.
- Audit failures are logged server-side with context and never fail the user's action. The draft's intent was right: "must never fail the operation it describes, but it must never be silently dropped either".

### 9.4 Actions the settings agent writes

- `org.updated`, `org.modules_changed`, `org.deleted`, `org.ownership_transferred`
- `member.invited`, `member.invite_resent`, `member.invite_revoked`, `member.joined` (written by the foundation accept flow), `member.role_changed`, `member.updated`, `member.disabled`, `member.enabled`, `member.employee_linked`
- `role.created`, `role.updated`, `role.deleted`
- `email.resent`
- all `subscription.*` and `platform.*` actions (6.14)

---

## 10. Notifications (`/app/notifications`, every member)

### 10.1 Page

- **Header:** "Notifications" with the subtitle "Assignments, approvals and mentions for you in {Workspace}." The "Mark all read" button shows only when anything is unread.
- **Tabs:** All | Unread (`?tab=unread`).
- **Product chips:** All · Work · Muster · Orbit · Folio · Workspace (`?kind=muster`). The product comes from the `kind` prefix (10.3).
- **Groups:** Today / Yesterday / Earlier this week / Earlier, by IST date.
- **Row:**
  - An icon tile in the product's accent colour. Read rows settle to `--surface-2`. A `*.rejected` or failure kind that is unread uses `--danger` (PeopleOS: "red only while something unread is a problem or waits on the reader").
  - Title (semibold when unread) and body (one line, ellipsis).
  - Relative time: "just now", "5 min ago", "3 hours ago", "2 days ago", then "12 Sep 2026".
  - An unread dot, and a chevron when `href` is set.
- **Click:** a row with `href` marks itself read (server action), then navigates. A row without `href` marks itself read in place.
- **Pagination:** 30 per page (`?page=`).
- **Empty:**
  - All: "Nothing yet. When someone assigns you a task, mentions you, or your leave or claim is decided, it shows up here."
  - Unread: "You're all caught up."
  - Product filter: "No Muster notifications."
- **Footer note:** "Only yours. Nobody else can see your notifications." (PeopleOS)

### 10.2 Actions and bell

- `markNotificationRead(id)`: filter `{ _id, userId: ctx.userId }` (ctx.db adds orgId), so nobody can mark or reach someone else's. allowReadOnly.
- `markAllNotificationsRead()`: `updateMany({ userId, readAt: null })`. Toast "12 notifications marked read." or "Everything was already read." allowReadOnly.
- **The bell is the foundation shell's.** It polls `/api/notifications/unread` every 30 s (SPEC). Suggested response: `{ count, latest: [{ id, title, kind, href, createdAt }] }` (latest 8). Play `notify` when the count increases. The dropdown links "See all" to this page.
- The old oss-main kept `resolvedAt` for "missing approver" alerts. Skip it; the dedupe key (6.5) covers repeated system alerts.
- **[needs foundation]** `Notification` needs the optional `dedupeKey` with a unique partial index `{ orgId, userId, dedupeKey }`.

### 10.3 Kinds catalog (coordination list for every agent)

Format: `kind = '<area>.<event>'`. The first segment picks the product chip and icon.

| Area (chip) | Kinds | Producer → recipients |
|---|---|---|
| `task` (Work) | `task.assigned`, `task.mentioned`, `task.commented` (watchers), `task.status_changed` (creator/watchers) | work-a |
| `meeting` (Work) | `meeting.invited`, `meeting.updated`, `meeting.cancelled` | work-b → attendees |
| `post` (Work) | `post.published` (announcements), `post.replied`, `post.mentioned` | work-b |
| `time` (Work) | `time.week_submitted` (approver), `time.week_approved` / `time.week_rejected` | work-b |
| `leave` (Muster) | `leave.requested` (approver), `leave.approved` / `leave.rejected` | muster-a |
| `attendance` (Muster) | `attendance.correction_requested`, `attendance.correction_decided` | muster-a |
| `claim` (Muster) | `claim.submitted` (reviewers), `claim.approved` / `claim.rejected`, `claim.paid` | muster-b |
| `payroll` (Muster) | `payroll.awaiting_approval` (finance), `payroll.released`, `payslip.published` (employee) | muster-b |
| `letter` (Muster) | `letter.issued` (employee), `letter.revoked` | muster-b |
| `bank` (Muster) | `bank.changed` (finance) | muster-a |
| `lead` / `deal` (Orbit) | `lead.assigned`, `followup.due` (lazy, on page load), `deal.won` (reviewers) | orbit |
| `invoice` / `receipt` (Folio) | `invoice.issued` (preparer), `invoice.overdue` (lazy), `receipt.recorded` | folio |
| `member` (Workspace) | `member.joined` (inviter), `member.role_changed` (member) | settings / foundation |
| `subscription` (Workspace) | `subscription.trial_ending`, `subscription.trial_ended`, `subscription.activated`, `subscription.renewed`, `subscription.upgraded`, `subscription.payment_failed`, `subscription.halted`, `subscription.canceled`, `subscription.change_applied` | settings |
| `platform` (Workspace) | `platform.trial_extended`, `platform.plan_changed`, `platform.workspace_enabled` | settings |

Title copy follows SPEC: name what happened to what. Examples: "Task 'Homepage copy' assigned to you by Rahul", "Leave approved for Aditi Singh, 2 days", "Invoice VWX/2026-27/0042 is 7 days overdue".

---

## 11. Platform admin (`/platform/*`, Flowbit staff only)

### 11.1 Access

- **Who:** `user.isPlatformAdmin`. Set to true at signup and login when the email is in `PLATFORM_ADMIN_EMAILS` (comma-separated, lowercased, trimmed), and by the seed. **[needs foundation: auth sets it]**
- **Gate:**
  - `proxy.ts` checks only that the session cookie exists.
  - `app/platform/layout.tsx` (settings) loads the user and calls `notFound()` when they are not a platform admin. Use 404, not 403, so the page doesn't reveal that it exists.
- **Data access:** every query goes through `platformDb()` / `elevated(reason)` (3.1). Never through `ctx.db`, because there is no active org.
- **Layout:** its own simple shell. Top bar with the Flowbit mark, "Platform" chip, links Overview · Workspaces, and "Back to app" on the right. Same tokens and dark theme. Content max width 1280 px.

### 11.2 `/platform`: Overview

- **KPI cards:**
  - MRR, ARR.
  - Paying workspaces.
  - On trial.
  - Trials ending in 7 days.
  - Payment due.
  - Read-only.
  - Locked.
  - Disabled.
  - New workspaces this month.
- **MRR definition:** the sum over workspaces whose effective status is `active`, `past_due` in grace, or `canceled` in period. Each contributes `cycle === 'monthly' ? amountPaise : round(amountPaise / 12)`, excluding GST. Trials and manual comps with `amountPaise = 0` contribute 0. **ARR = MRR × 12.**
- **Signups per week**, last 12 weeks: an SVG bar chart (`components/charts`).
- **"Trials ending soon":** name, owner email, days left, people, with a row link to the org.
- **"Recent payments":** the last 10 `SubscriptionInvoice` across orgs: number, workspace, amount, date, provider.
- **Empty:** "No workspaces yet."

### 11.3 `/platform/orgs` and `/platform/orgs/[id]`

**List.**
- Columns:
  - Workspace: name and slug.
  - Owner: name and email.
  - Plan: Trial / Suite / Custom, with product chips in their accent colours.
  - Status: the effective status pill with context, e.g. "Trial · 6 days", "Read-only · 22 days left", "Payment due".
  - Seats: used / limit (6.4).
  - MRR.
  - Created.
  - Last active: the newest `Session.lastSeenAt` of any member, or the newest audit entry.
- Filters: status, plan, `q` (name, slug or owner email). Sort by created or MRR. Paginate at 50 with URL params.

**Detail tabs:** Overview · Subscription · Invoices · Members · Audit.
- **Overview:** org fields, owner, counts (members, employees, tasks, invoices; light `countDocuments`), enabled products, created date, disabled or deleted state.
- **Subscription:** every subscription field. Razorpay subscription id links to `https://dashboard.razorpay.com/app/subscriptions/{id}`.
- **Invoices:** all of the org's `SubscriptionInvoice`s, with PDF download and cancel.
- **Members:** read-only list with role, status and last active.
- **Audit:** platform actions on this org plus the org's latest 50 audit entries.

**Actions**, each with a ConfirmDialog. Every one requires a **reason** (5–300 characters), is audited into the **org's** AuditLog with `platform: true` and `actorName` "Flowbit support", notifies the owner where it says so, and toasts:

| Action | Effect | Validation and copy |
|---|---|---|
| Extend trial | `trialEndsAt = max(trialEndsAt, now) + days`. If the effective status was expired from a trial, set status back to `trialing`. | Days 1–60. Notify the owner "Flowbit extended your trial to 30 Oct 2026". Toast "Trial extended to 30 Oct 2026 for Hart Cosmetics." |
| End trial now | `trialEndsAt = now`. The workspace becomes read-only. Used for support and QA. | Only while trialing. Toast "Trial ended for Hart Cosmetics. Read-only until 31 Oct 2026." |
| Change plan | Set plan (suite or custom), products, quantities or seats, cycle, `status 'active'`, `currentPeriodStart = now`, `currentPeriodEnd` (date picker), `amountPaise` (price override; 0 = complimentary), and `manual { note: reason, setBy, setAt }`. Add newly entitled products to `enabledProducts`. **No invoice is issued** (no payment). If a Razorpay subscription exists, warn "This doesn't change Razorpay. Cancel it there or from the workspace first." | Quantities ≥ minimums are *not* enforced for staff, but must be ≥ 0. Notify the owner. Audit `platform.plan_changed`. |
| Disable workspace | `Org.disabled = { at, by, reason }`. Delete all sessions with `activeOrgId` = org. | Type the slug to confirm. Members see the disabled page (6.5). |
| Enable workspace | Clear `disabled`. | Notify the owner. |
| Restore deleted workspace | Clear `deletedAt` (only within 30 days). | Audit `platform.workspace_restored`. |
| Cancel invoice | `status 'cancelled'`, `cancelledAt`, `cancelReason`, `cancelledBy`. The number stays. The PDF shows a CANCELLED watermark. | Refunds happen outside the app; say so in the dialog. |

**Empty states:** "No workspaces match these filters." · "No invoices yet."

---

## 12. Shell behaviours ported from the draft (foundation reference)

### 12.1 Command palette (`client/src/components/Palette.tsx`)

**Draft behaviour to keep:**
- **⌘K / Ctrl+K toggles** the palette. Escape closes it. The input gets focus on open, and the query and selection reset every time it opens.
- **Empty query:** "Go to" pages. Only features the actor can see, up to 8. With a query, up to 5 matching page labels.
- **Remote search:** at **≥ 2 characters**, debounced **180 ms**. Results are grouped under headers (Tasks, Clients).
- **Keyboard:** ↑/↓ move the active row, Enter opens it, mouse hover sets the active row. The active row shows an Enter-key icon.
- **No results:** "No matches for '{q}'".
- **Overlay:** a dimmed backdrop; clicking it closes the palette. Panel max width 32rem, placed at 12vh from the top.
- **Discoverable:** a visible Search button in the top bar shows "⌘K", "not just a hidden shortcut". The design comment in the draft: "⌘K opens a palette, not a text box that navigates".

**Draft bugs, don't port:**
- On every keystroke it fetched **the whole client list** and filtered it in the browser.
- Task hits link to `/tasks?open=<id>`, but the Tasks page never reads `open`, so the link is dead.
- The top-bar button dispatches a synthetic `KeyboardEvent` to open the palette. Expose an `openPalette()` store or context instead.

**Flowbit version:**
- The SPEC side panel has a search pill that opens the palette.
- One `GET /api/search?q=` route handler (foundation) returns up to 5 hits per group. It respects `ctx.has(product)` and permissions.
- Groups:
  - Tasks: key or title.
  - Projects.
  - Clients.
  - People: members always; employees only with `people.read` or `people.read_team`.
  - Invoices: by number (`folio.read`).
  - Leads and deals (`orbit.read`).
  - Posts.
  - Meetings.
- A "Create" group with quick actions: New task, New client, Invite people (`members.manage`), New invoice (`folio.invoices.write`).
- An "Ask Arc about '{q}'" row at the bottom linking to `/app/arc?q=`.
- Sounds: `pop` on open, `click` on choose.

### 12.2 Mobile nav (`client/src/components/Shell.tsx`)

**Draft:**
- Below `lg` (1024 px) the sidebar is an off-canvas drawer (`translate-x-full` → `0`, 200 ms) with a black/45 overlay. A hamburger in the top bar opens it.
- **The drawer closes on route change** (an effect on `pathname`) and on an overlay click.
- On desktop the sidebar collapse state is saved to `localStorage['flowbit-nav']`. The collapsed width is 60 px; expanded is 232 px.

**Flowbit (SPEC shell):**
- Below `lg`, hide the 72 px rail and the 248 px side panel.
- The top bar gets a hamburger (left), the breadcrumb, the bell and the avatar.
- The drawer contains:
  - the rail items as a vertical list (icon + label, active bar)
  - the workspace switcher
  - the search pill
  - the contextual panel sections
  - the check-in widget at the bottom
- Behaviour: body scroll is locked; Escape closes; focus is trapped and returns to the hamburger on close; 16 px gutters.
- Settings' own sub-nav becomes horizontal chips (section 4).

### 12.3 UI states and contract worth porting into `components/ui`

- **The four states as primitives, so no screen invents its own:**
  - `Skeleton`: pulse rows with staggered delays.
  - `Empty`: title, hint and an action.
  - `NoMatches`: "No matches for '{q}'", "Try a different search, or clear the filter", and a "Clear filter" button.
  - `Failed`: maps the error code to a title and hint ("Something went wrong" otherwise), with a "Try again" that actually retries.
  - `Stale`: "Showing data from a moment ago. Refresh".
  - The draft keeps these deliberately separate: "'no clients yet' and 'no clients match' need different words and different actions".
- **Error-code → toast copy map** (draft `overlay.tsx`): `forbidden`, `upgrade_required`, `seat_limit`, `period_locked`, `cannot_approve_own_leave`, `already_decided`, `client_has_history`.
- **Disabled buttons look different from enabled ones by more than opacity.** The draft's note: "the old app used opacity .5 for both".
- **A visible focus ring everywhere.** The draft's audit called invisible focus "the most-repeated defect".
- **`Dialog`:** focus trapped; Escape closes; focus returns to the opener; body scroll locked.
- **`Avatar`:** a stable hue from a hash of the name; initials from the first two words.
- **`Meter`:** a bar with an optional marker. Useful for seat usage and the trial elapsed bar.

---

## 13. Marketing site content (marketing agent)

Routes (SPEC): `(marketing)/` landing, `pricing`, `products/[slug]` for `work | muster | orbit | folio`, `contact`, `legal/*`. All are server components and static where possible, in the dark theme. Hero sections use the animated `--grad-brand` mesh. Each product uses its accent token: Work `#C084FC`, Muster `#5EEAB0`, Orbit `#60A5FA`, Folio `#F5B85C`.

Primary CTAs go to `/signup`. "Choose" buttons on pricing go to `/signup?plan=suite` (or `?plan=custom&products=work,folio`). Store the param so the subscription picker preselects it after the trial (6.7.1).

**Copy rules (SPEC):**
- Plain, specific, active voice.
- ₹ with en-IN grouping.
- Never claim anything SPEC doesn't build. Specifically, don't claim:
  - client margin
  - Slack
  - native mobile apps
  - e-invoicing / IRN
  - GST return filing
  - payroll bank payouts
  - Form 16
  - recruitment
  - appraisals
  - biometric devices

**Legal and placeholders:**
- Razorpay account activation expects public **Terms**, **Privacy**, **Refund & cancellation** and **Contact** pages. Build all four under `legal/*` and `contact`.
- Legal text is a **draft for the user's lawyer to review**; say so in a code comment, not on the page.
- Placeholders the user must fill: registered address, support email/phone, refund policy decision (17).

### 13.1 Landing (`/`)

1. **Top nav:** logo (burst mark + gradient "Flowbit"), Products dropdown (four products with accent dots and one-liners), Pricing, Contact, "Sign in" (ghost), "Start free trial" (gradient pill with shimmer).
2. **Hero:**
   - H1 **"Everything in flow. Nothing in the way."** (the brand line from the Figma auth screen).
   - Sub: "Flowbit runs your team's work, HR and payroll, sales pipeline and GST billing in one workspace. Built for Indian teams of 6 to 150."
   - CTAs "Start your 15-day trial" and "See pricing".
   - Microcopy: "Every product switched on for 15 days · No card needed · ₹ and GST built in".
   - Visual: the Home dashboard from the Figma (greeting, workday timeline, Arc card, stat cards) on the gradient mesh, with a subtle float.
3. **Four products** (cards with accent glow; link to the product pages):
   - **Flowbit Work**: "Tasks, projects and the week, in one place."
   - **Muster**: "From joining day to payslip, one record per person."
   - **Orbit**: "A pipeline that measures itself."
   - **Folio**: "GST invoices, receipts and who owes what."
4. **"Connected, not stitched together"**, three short stories with a small diagram each:
   - "A client exists once. Their projects live in Work, their deals in Orbit, their invoices and ledger in Folio."
   - "Check in from the sidebar. It lands in the attendance register, and the register feeds payroll."
   - "Win a deal in Orbit and turn it into a quote or invoice in Folio with one click."
5. **Arc: "AI reads. People decide."** (13.7 copy).
6. **"Made for how Indian teams work":**
   - ₹ amounts with Indian grouping
   - GST split into CGST and SGST or IGST by place of supply
   - PF, ESI and Professional Tax by state
   - invoice numbers that restart each April
   - IST everywhere
   - dates like "20 Jul 2026"
7. **"Your workspace is yours":**
   - every record is scoped to your workspace
   - roles decide who sees what, down to who can see salaries
   - an audit log of every sensitive change
   - issued invoices, HR letters and released payroll are voided with a reason, never deleted
8. **Pricing teaser:** "Suite: all four products for ₹149 per person a month. Or pick products from ₹39." and a link to Pricing.
9. **FAQ:** the top 6 from 13.6, then "All questions" → pricing#faq.
10. **Final CTA band** on the gradient: "Start with everything switched on." plus the button.
11. **Footer:** product links, Pricing, Contact, Terms, Privacy, Refunds & cancellation; "© 2026 Flowbit Technologies"; "Made in India".

**SEO title:** "Flowbit: work, HR and payroll, CRM and GST billing for Indian teams". **Meta description:** "One workspace for tasks and projects, attendance and payroll with PF/ESI/PT, a sales pipeline, and GST invoicing. 15-day free trial."

### 13.2 Product page template (`/products/[slug]`)

Every product page has the same sections:
1. Hero: product name in its accent, one-liner, sub, CTA, a screenshot.
2. "What you get": 6–10 feature blocks, each with an icon, a title and 2–3 lines.
3. "How it works": 3–5 steps.
4. "Works with the rest of Flowbit": cross-links.
5. "What it doesn't do (yet)": the honest list.
6. Pricing for this product, plus "or Suite ₹149/person".
7. Product FAQ (3–4 questions).
8. CTA.

Unknown slugs return 404. Use `generateStaticParams` for the four.

### 13.3 Flowbit Work (`/products/work`)

Grounded in old Flowbit (oss-main), the Flow bite draft and SPEC section 6.

- **Hero:** "Flowbit Work — Tasks, projects and the week, in one place." Sub: "Plan in spaces and projects, move work across a board, run meetings that end in tasks, and log time without rebuilding your week from memory."
- **What you get:**
  - **Tasks, three ways.**
    - List, Board and Calendar.
    - Board: drag between To do, In progress, In review, Blocked and Done.
    - Calendar: tasks by due date.
    - Filters: assignee, project, space, priority, status and due (today, overdue, this week). Saved views, bulk actions, quick add.
    - Every task gets a key like FB-42.
  - **A task page with everything on it.** Description, subtasks, checklist, comments with @mentions, attachments, watchers, time logged and a full activity timeline.
  - **Spaces and folders.** Organise work the way your teams actually run, with colours, icons and members.
  - **Projects with honest health.**
    - Progress ring, milestones, members, files and activity.
    - Health comes from the tasks themselves: overdue and blocked work pulls it down. It is never a status someone forgot to update. (Draft principle: "Health is derived, never stored".)
  - **Teams and workload.** See who is on what.
  - **Meetings that end in tasks.** Schedule with attendees, agenda and a link; take notes; turn action items into tasks; RSVP.
  - **Posts.** Announcements with categories, pinning, read receipts, replies and reactions.
  - **Time tracking.** A timer or manual entries against tasks and projects, a weekly timesheet, submit the week, manager approval.
  - **Whiteboards.** Sketch flows and plan sprints on boards saved with your workspace.
  - **Reports.** Throughput, overdue work, work by assignee, project health and time by project, for any date range, exported to CSV.
  - **A home that answers "what now?"** Your workday timeline, in-progress, overdue and completed counts with trends, project overview, tasks assigned to you, and your attendance month.
  - **Two ways to start.** A project-based workspace (Workspace → Projects → Tasks → Subtasks) for agencies and product teams, or a personal task workspace (My tasks, reminders, notes) for individuals.
- **How it works:**
  1. Create your workspace and invite the team.
  2. Set up spaces or projects.
  3. Assign and move tasks.
  4. Log time and run meetings.
  5. Check Reports on Friday.
- **Works with:** Clients (shared with Orbit and Folio); the check-in widget feeds Muster attendance; Arc drafts project outlines and weekly updates.
- **Doesn't do (yet):** Gantt charts, a client portal, native mobile apps (it works in your phone's browser), integrations with chat tools.
- **Price:** ₹59 per user a month (minimum 5 users), or Suite.
- **FAQ:**
  - "Can I use Work for my own tasks?" Yes, choose the personal workspace.
  - "Do guests or clients need a seat?" There are no guest accounts; everyone who signs in is a user.
  - "Can I export my data?" Reports export to CSV.

### 13.4 Muster (`/products/muster`)

Grounded in `vistaar-peopleos/README.md`, its lifecycle and letters catalogue, and SPEC.

- **Hero:** "Muster — From joining day to payslip, one record per person." Sub: "Attendance, leave, reimbursements, payroll with PF, ESI and PT, and HR letters all read from the same employee record. A muster roll is the register Indian labour law ties payroll to, so we named it that."
- **What you get:**
  - **People.**
    - An employee master with 13 lifecycle statuses, from candidate and offered through probation, confirmed and notice period to exited.
    - Documents, nominees, bank and statutory details (PAN, UAN, ESIC) and remarks.
    - Bulk import from CSV, checked row by row before anything is saved.
  - **Attendance.**
    - Check in, take breaks and check out from the Flowbit sidebar.
    - A month register HR can mark and override.
    - Correction requests with approval.
    - Lock the month before payroll.
  - **Leave.** Apply and approve; balances; a team leave calendar; holidays; leave types and policy.
  - **Reimbursements.**
    - Shareable claim forms behind a public link.
    - The employee verifies with a one-time code sent to their work email, uploads receipts and submits.
    - HR reviews from one queue; finance marks claims paid.
  - **Payroll in eight visible stages.**
    - Attendance locked → claims closed → generated → HR reviewed → finance approved → locked → released → payslips published.
    - PF, ESI and Professional Tax by state, with effective dates.
    - Holds, exclusions and adjustments.
    - Payslip PDFs by email.
    - Each payroll entry keeps a snapshot of its inputs, so a payslip reproduces exactly even after salaries or rates change.
  - **HR letters, 20 templates:**
    - internship offer, completion, certificate, experience and recommendation
    - letter of recommendation
    - offer, appointment, confirmation and experience letters
    - salary revision and promotion
    - warning, show cause notice and termination
    - resignation acceptance, relieving, full and final settlement, and no dues
    - a custom letter

    Each letter gets a numbered reference, a PDF and an email. Letters are never deleted, only revoked with a reason.
  - **Self-service.** Employees see their own profile, attendance, leave, payslips, claims, letters and documents.
  - **Reports.** Employee master, attendance, leave, payroll register, PF/ESI/PT, claims and gratuity, all as CSV.
  - **Salary stays private.** Managers approve their team's leave without ever seeing a rupee. Seeing pay is one explicit permission, and every salary change, payroll unlock and release is in the audit log.
- **How it works:**
  1. Import your people.
  2. They check in from the sidebar.
  3. Approve leave and claims through the month.
  4. Lock attendance and run payroll through the eight stages.
  5. Payslips land in inboxes.
- **Plans:**
  - **Starter**, ₹39 per employee a month: everything except payroll.
  - **Business**, ₹79: adds payroll with PF, ESI and PT, and payslips.
  - Minimum 10 employees. Employees need a login only for self-service.
- **Doesn't do:** recruitment and applicant tracking, appraisals, biometric device integration, bank salary payouts, government filings (PF ECR, ESI challans), Form 16. This list is PeopleOS's own "deliberately out of scope" list.
- **FAQ:**
  - "Does Muster file PF and ESI?" No. It calculates them and produces the reports you or your CA file from.
  - "Can managers see salaries?" Not unless you give their role that permission.
  - "What counts as an employee for billing?" Anyone on payroll: interns, probation, active, confirmed, and people serving notice.

### 13.5 Orbit (`/products/orbit`) and Folio (`/products/folio`)

**Orbit**, grounded in `vistaar-crm/FLOW.md`, its README and SPEC. **Check the final wording against the orbit agent's spec**; the CRM's stage guards are listed as the reference behaviour.

- **Hero:** "Orbit — A pipeline that measures itself." Sub: "Leads move through stages that mean something. Every call, email and reply is logged once, and conversion is worked out from that log instead of typed into a report."
- **What you get:**
  - **Leads.**
    - Table and board by stage, with quick add.
    - Source and sector on every lead.
    - One owner and one reviewer.
    - Next action with a date.
  - **Stages with rules.**
    - New → Contacted → Engaged → Meeting booked → Meeting done → Proposal sent → Won, or Lost/Disqualified with a reason.
    - In the reference CRM, a lead can't skip ahead: Contacted needs a logged outreach, and Engaged needs a logged reply.
  - **Activities.** Calls, emails, meetings, notes and follow-ups, with Today, Overdue and Upcoming lists so no follow-up slips.
  - **Deals.** A kanban by stage with values; drag to move. When a deal is won, create a quote or invoice in Folio.
  - **Contacts and one shared client record.**
  - **Reports.** Cold vs warm conversion (meetings ÷ contacted vs meetings ÷ replied), by source, by owner, and won/lost reasons.
  - **Pipeline dashboard.** Value by stage, won this month, conversion, follow-ups due today.
  - **Your own stages, sources, lost reasons and sectors.**
- **Doesn't do (yet):** sending or syncing email or DMs, calendar sync, automated sequences, AI lead scoring. These are the CRM's own v1 exclusions.
- **Price:** ₹149 per sales user a month (minimum 2), or Suite. A sales user is anyone who can work leads and deals; people who only view don't count.

**Folio** (formerly Billing OS), grounded in `vistaar-billingos/README.md` and SPEC.

- **Hero:** "Folio — GST invoices, receipts and who owes what." Sub: "Draft and issue invoices from one or more businesses, record money against the client and allocate it, and always know your aging."
- **What you get:**
  - **Draft, then issue.**
    - A draft has no number and stays fully editable.
    - Issuing takes the next number in that entity's series for the financial year, for example VWX/2026-27/0001, and locks the figures.
    - A cancelled invoice keeps its number. The series has no gaps.
  - **GST worked out for you.** CGST and SGST within your state, IGST across states, decided by place of supply. A GSTIN is checked against its state.
  - **More than one business.** Run a GST-registered entity and a non-GST one from the same workspace, each with its own number series, bank details and letterhead. A non-GST entity issues sale invoices with no tax.
  - **Quotes and proformas** convert into invoices.
  - **Receipts that match how money arrives.** Money is recorded against the client, then allocated to invoices. Advances, part payments and one payment covering three bills all use the same simple flow. Anything unallocated is an advance.
  - **Recurring retainers** create the monthly draft for you.
  - **Credit notes.**
  - **Client ledger** and a statement PDF.
  - **Reports.** Aging, a GST summary for GSTR-1 prep, collections, and revenue by client and month. CSV exports open cleanly in Excel, ₹ sign included.
  - **Dashboard.** Receivables, overdue, collected this month, aging buckets, top debtors.
  - **PDF and email** to clients; record payments; void with a reason.
- **Doesn't do (yet):** e-invoicing (IRN) and e-way bills, filing GST returns, full accounting (P&L, balance sheet). Mention payment reminders only if the folio agent builds them; Billing OS has them, but SPEC's Folio route list doesn't.
- **Price:** ₹399 per workspace a month, including 3 users, or Suite with no Folio user limit.

### 13.6 Pricing (`/pricing`)

**Toggle:** Monthly | Yearly ("50% off the first year"). The page reads the numbers from `lib/plans` and computes the yearly figures (never hand-typed).

| Plan | Includes | Monthly | Yearly | Minimum |
|---|---|---|---|---|
| **Flowbit Work** | Tasks, spaces, projects, teams, meetings, posts, time, whiteboards, reports, Arc | ₹59 / user | ₹590 / user | 5 users (₹295 a month) |
| **Muster Starter** | People, attendance, leave, reimbursements, letters, self-service. No payroll | ₹39 / employee | ₹390 / employee | 10 employees (₹390 a month) |
| **Muster Business** | Everything in Starter, plus payroll with PF, ESI, PT and payslips | ₹79 / employee | ₹790 / employee | 10 employees (₹790 a month) |
| **Orbit** | Leads, deals, contacts, activities, pipeline reports | ₹149 / sales user | ₹1,490 / sales user | 2 (₹298 a month) |
| **Folio** | GST invoices, quotes, receipts, ledger, aging, recurring retainers | ₹399 / workspace, 3 users included | ₹3,990 / workspace | 1 |
| **Suite: all four** (highlighted, "Best value") | Work + Muster Business + Orbit + Folio | **₹149 / person** | **₹1,490 / person** | 10 people (₹1,490 a month) |

**Footnotes** (all true per SPEC and section 6):
- Prices in INR, excluding 18% GST.
- Yearly costs 12 months' price; the first year is 50% off.
- 15-day trial of everything; no card.
- After the trial, the workspace stays read-only for 30 days while you choose a plan. Your data stays.
- Pay by card, UPI or netbanking through Razorpay. Every payment gets a GST invoice from Flowbit Technologies.
- A "person" on Suite is anyone who signs in or is on Muster's payroll list, counted once.

**Calculator:**
- Inputs: a team-size slider (6–150) and a toggle per product (with the Muster tier). For Orbit, a separate "sales users" stepper defaulting to 2.
- Output: monthly and yearly totals for the picked products and for Suite, using `quote()`, side by side, with "Suite saves you ₹565 a month" when true.
- It approximates persons as the team size; say "estimate".

**Compare table:** features (rows) × plans (columns) with check marks, grouped by product.

**FAQ** (`#faq`):
1. **How does the trial work?** 15 days, every product switched on, no card. We remind you 3 days and 1 day before it ends.
2. **What happens when the trial ends?** Your workspace becomes read-only for 30 days, so you can still see everything but not change it. After that only the subscription page opens until you choose a plan. Nothing is deleted.
3. **Is GST included?** No. Prices exclude 18% GST. You get a GST invoice from Flowbit Technologies; add your GSTIN at checkout to claim input tax credit.
4. **How do you count users?** Work counts everyone who signs in. Muster counts employees on payroll. Orbit counts people who can work leads and deals. Folio includes 3 users. Suite counts each person once, whether they sign in, are on payroll, or both.
5. **Can I mix products?** Yes. Pick any combination, or take Suite for all four at ₹149 a person.
6. **Monthly or yearly?** Yearly costs 12 months' price, and the first year is 50% off.
7. **Can I change plans later?** Add people or products any time and pay only for the rest of the current period. Reductions apply from your next renewal.
8. **How do I pay?** Through Razorpay: cards, UPI or netbanking. It renews automatically. Cancel any time and keep access until the end of the period you've paid for.
9. **Refunds?** *[Needs the user's decision, 17.]* Suggested: "We don't refund part-used periods. Cancel any time and you won't be charged again."
10. **Is my data separate from other companies'?** Yes. Every record belongs to one workspace and every request is checked against it. Roles decide who sees what inside your workspace, and sensitive changes are logged.
11. **Will Arc change my data?** No. AI reads, people decide. Arc drafts; you click Apply.
12. **Does Muster file PF, ESI or Form 16?** No. It calculates PF, ESI and PT and gives you the reports to file from.
13. **Can Folio create e-invoices (IRN)?** Not yet.
14. **Can I bring my employee list?** Yes. Import a CSV into Muster, checked row by row.
15. **Do all employees need a login?** No. Only those who use self-service.
16. **Is there a mobile app?** Flowbit works in your phone's browser. There's no app to install.

### 13.7 The AI stance (landing section and pricing FAQ)

- **Title:** "AI reads. People decide."
- **Body:** "Arc is Flowbit's assistant. It searches your workspace (tasks, projects, clients, people, posts and meetings) and drafts things for you to check: a project outline with milestones and tasks, subtasks for a big task, a summary of your week built from what actually happened. Nothing is created until you click Apply. Arc never changes pay, attendance, HR letters, invoice amounts or anything else on its own."
- **Three points:**
  1. "Every suggestion waits for your click."
  2. "Arc can't touch money or people records."
  3. "Works without AI too: when AI isn't turned on, Arc uses built-in templates and search."
- Visual: the Figma Arc card ("arc.ai", the chips Outline Flowbit / Breakdown task / Progress update, and the pill input "search your workspace and web in seconds"). The Figma placeholder mentions the web, but SPEC's Arc searches only the workspace. **Don't claim web search**; use "Search your workspace in seconds" on the marketing site.
- Whether to name Claude/Anthropic is the user's call (17). SPEC's Arc uses `claude-sonnet-5-5` when `ANTHROPIC_API_KEY` is set.

### 13.8 Contact (`/contact`)

- **Form fields:**
  - name (2–80)
  - work email (valid)
  - company (2–120)
  - team size: chips 6–10 / 11–50 / 51–150 / 150+
  - products interested in: checkboxes
  - message (10–2,000)
- **Spam controls:** a honeypot field, and rate limiting of 5 per hour per IP.
- **On submit:**
  - Store a `ContactRequest` **[proposal model; marketing agent]**.
  - `sendMail` to `SUPPORT_EMAIL` (kind `contact`; no org).
  - Show the inline success "Thanks, {firstName}. We'll reply to {email} soon." Don't promise a response time unless the user gives one.
- **Side column:** support email and registered address (placeholders, 17).

---

## 14. Seed data for the settings area

Write it in `src/modules/settings/seed.ts` **[proposal path]** exporting `seed(ctx: SeedCtx)`. Use the dates around 1 Oct 2026. Never print passwords (SPEC).

**Workspaces:**
- **Vistaar WebX** (the main demo org):
  - Plan: `active`, Suite, monthly, seats 25. Period 1 Oct 2026 → 1 Nov 2026. `amountPaise` 372,500.
  - Billing: legal name "Sanskaar Webx Services LLP", state MP, a sample-format GSTIN clearly marked test, Bhopal address.
  - Payment provider `simulated`.
  - Invoices: FB/2026-27/0001 (Aug), 0004 (Sep) and 0007 (Oct). They interleave with other orgs' numbers because the series is global. Each 25 × ₹149 = ₹3,725 + ₹670.50 GST = ₹4,396 after rounding, intra-state (Flowbit `FLOWBIT_STATE` = MP in the seed), all `isTest: true`.
- **Hart Cosmetics:** trialing, `trialEndsAt` 7 Oct 2026 (6 days left), 6 members. Triggers the warning banner on 4 Oct.
- **Atulya Karigari:** trial ended 20 Sep 2026, so it is read-only until 20 Oct 2026.
- **Mommy's Chicken:** custom plan (Work 8 + Folio), yearly, active. Period 1 Jul 2026 → 1 Jul 2027. One invoice: 8 × ₹590 + ₹3,990 = ₹8,710 + GST, inter-state if seeded in MH.
- **Old Fort Studio:** `canceled`, period ends 15 Oct 2026.
- One **disabled** workspace with the reason "Chargeback under review" (for the platform list).

**Vistaar WebX extras:**
- Members across every built-in role, including one disabled member.
- Pending invites: one fresh, one expired.
- A custom role "Project coordinator" with `tasks.write, tasks.delete, projects.write, spaces.manage, clients.read, work.reports.read`.
- A scheduled `pendingChange` on another org (Suite 25 → 20 from 1 Nov) to exercise that UI.
- About 40 audit entries spanning member, role, subscription and org actions, including two platform ones.
- About 30 notifications per demo login across kinds, half unread.
- Outbox rows: invites (logged), subscription invoices (logged), one failed email with an error message.

**Platform:** the seed owner is marked `isPlatformAdmin`, or the platform login comes from `PLATFORM_ADMIN_EMAILS`.

---

## 15. Unit tests to write (Vitest, pure logic)

1. **`quote()`:**
   - Every row of the 6.3 table, exactly in paise.
   - Minimums applied and flagged.
   - Yearly = 12 × monthly; the first-year discount is a separate line.
   - Suite hint only when Suite costs ≤ custom.
   - A custom selection with no products is refused.
2. **`subscriptionInvoiceTotals()`:**
   - Intra vs inter-state.
   - Unknown state → inter-state.
   - CGST equals SGST after levelling (odd-tax case from the 6.11 example).
   - Round-off to the rupee, positive and negative.
3. **`prorate()`:** the 6.11 example (₹288.39 taxable, ₹340.00 total), a last-day change, and a first-day change.
4. **`effectiveStatus()` / `accessLevel()`**, at the boundaries:
   - trial last instant, and trial end + 1 ms
   - expired + 29 d vs + 30 d
   - past_due + 6 d vs + 7 d vs + 37 d
   - canceled before and after period end
   - an active subscription with a passed `currentPeriodEnd` becomes past_due
   - a disabled org is blocked
5. **`capacity()`:**
   - Suite persons union (an employee linked to a member counts once).
   - Custom with and without Work.
   - Folio cap of 3.
   - Trial unlimited.
   - Pending invites counted.
6. **Invoice number:** FY rollover on 31 Mar → 1 Apr; padding.
7. **`addPeriod()`:** 31 Jan + 1 month = 28/29 Feb; yearly.
8. **Permissions:**
   - Anti-escalation `canGrant(actorPerms, rolePerms)`.
   - Effective permissions for owner, built-in and custom (unknown keys dropped).
   - Manager-cycle detection.
9. **Razorpay signatures:** `verifyCheckoutSignature` (payment|subscription), `verifyOrderSignature` (order|payment) and `verifyWebhook` (raw body), each against vectors computed in the test with `crypto.createHmac`.
10. **Notifications:** IST day grouping (Today / Yesterday / Earlier this week / Earlier) across midnight IST; relative time strings.
11. **Audit `diff()`:**
    - A delete records `before`.
    - A create records `after`.
    - Ignored and redacted keys.
    - The union-of-keys case the draft missed.
12. **Amount in words**, if a local helper is written: ₹2,110 → "Two Thousand One Hundred Ten"; ₹1,23,45,678 → "One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight".

---

## 16. Bugs, gaps and surprises in the reference code

**Draft (`~/Downloads/Flow bite`):**
1. **Audit loses deletes and task updates.**
   - `changed()` only walks `after`'s keys, so every delete or revoke (`after = {}`) records nothing.
   - The task PATCH mutates `before` with `Object.assign(before, patch)` before diffing, so task updates are never audited.
   - Two calls pass a Date as `entityId` into an ObjectId field, so those writes fail and only a console line remains.
2. **The seat counter drifts.**
   - Reactivating a member doesn't claim a seat.
   - Unlimited plans skip the increment, but deactivation still decrements.
   - Invites don't reserve seats, so the invite button allows more invites than seats and the last people to accept get `402 seat_limit`.

   Derive usage instead (6.4).
3. **Stale access.** The JWT holds role and orgId for 7 days, and nothing re-checks `active`. A deactivated member keeps working until expiry; role changes lag.
4. **Invite accept for an existing identity skips authentication.** The token holder gets a session for that identity.
5. **The trial is never enforced.**
   - 14 days instead of SPEC's 15.
   - The `trial` plan has every feature, with no expiry, no read-only and no payment.
   - "Switch to plan" on Billing just writes `plan`, with the copy "Managed by your account manager during beta — no card needed".
   - Monthly cost = price × seatsUsed, ignoring minimums.
6. **An upgrade doesn't switch on new features** once `enabledFeatures` is non-empty (2.2).
7. **Modules:**
   - The PUT uses `members.manage`; SPEC says `org.manage`.
   - The GET has no permission at all.
   - The client has **no Modules screen** although the server and comments describe one.
8. **Roles:** only the built-ins are listed. No custom roles, no editor, and no anti-escalation, despite the page subtitle promising it.
9. **Members:**
   - There is no owner protection beyond "only owner can change owner": no last-owner guard, no transfer.
   - `fte` is editable but not in SPEC; drop it.
   - The draft uses the field name `active: boolean`; SPEC uses `status`.
10. **Role names hardcoded in routes:** leave "all" scope, dashboard pending leave, time and utilisation access, and cost visibility (`owner|admin`). Custom roles would break all of these. Use permissions (7.1).
11. **Palette:** fetches the full client list on every keystroke, and its task deep links (`?open=`) are dead.
12. **The Integrations "Slack" card** is permanently "Not connected" with no way to connect it.
13. **Login returns HTTP 300 for "choose org"** and the client doesn't handle it.
14. **The org cache is per process** (30 s), so a plan change on another instance isn't seen for up to 30 s. SPEC's per-request DB reads avoid this.
15. **The draft's centrepiece** (margin, cost rates from CTC with a 1.3 overhead, utilisation bands 55/90%, period close and lock) has **no place in SPEC**. If the user wants it later, `shared/margin.ts`, `rates.ts`, `capacity.ts` and their tests are clean and portable.

**Other references:**
- **Old Flowbit:** notifications use fixed enums with presentation config per type, and "missing approver" system alerts with `resolvedAt`. The roles editor allows editing system roles. Invites send a one-time password and force a password change. None of this is needed.
- **PeopleOS:** has the best permission model to borrow: grouped labels, read_all vs read_team scope, `payroll.read` as the salary switch, protected permissions on super admin. Its audit page has no filters, only pagination.
- **Billing OS (`docs/KNOWN-GAPS.md`):**
  - No credit note UI.
  - Retainers and projects are read-only.
  - `mustChangePassword` is never read.
  - No `error.tsx`.
  - Lists cap at 200 rows silently.
  - Empty states on only 3 of 21 pages.

  The folio agent should not inherit these.

---

## 17. Open decisions for the user and the foundation

**For the user:**
1. **Flowbit's legal details for the subscription invoice:** registered name, GSTIN, PAN, address, state, and the **SAC code** (998314 vs 997331; confirm with the CA). Also the support email and phone.
2. **Refund policy wording** for the pricing FAQ and the legal page.
3. **Folio users beyond 3** on a Folio-only plan. SPEC prices none. This spec blocks a 4th Folio user and points to Suite; the alternative is a per-user add-on price.
4. **Past-due grace length** (7 days proposed) and whether `halted` should go straight to read-only (proposed: yes).
5. **Whether marketing should name Claude/Anthropic** for Arc.
6. **Whether the Flow bite margin and utilisation features** should come back later (not in SPEC today).

**For the foundation** (each is also marked inline):
1. Core model fields:
   - `Org.subscription` additions (6.2), `Org.disabled`, `Org.deletedAt`.
   - `User.prefs.reducedMotion`, `User.lastOrgId`, `User.isPlatformAdmin` set from `PLATFORM_ADMIN_EMAILS`.
   - `Session.createdAt` / `lastSeenAt`.
   - `Notification.dedupeKey` with a unique partial index.
   - Full `AuditLog` and `Outbox` field lists (9.2, 5.10).
   - `Invite` extras: name, title, employeeId, sentAt, sendCount.
   - No TTL index on invites.
2. Who owns the `SubscriptionInvoice` and `BillingEvent` models (proposed: `src/models/platform/`, settings agent).
3. A platform-scoped `nextSeq` for the global `FB/{FY}/NNNN` series, and a `platformDb()` / `elevated(reason)` accessor.
4. `action()` support for `allowReadOnly`, and the read-only/blocked checks in `action()` and `requireMember()` (6.5).
5. `lib/plans.ts` exports `quote`, `capacity`, `usage`, `effectiveStatus`, `accessLevel`, `prorate`, `subscriptionInvoiceTotals`, `addPeriod` and the constants (or the settings agent provides them in `src/modules/settings/billing/`).
6. A permission catalog with groups, labels and notes (7.1), and built-in defaults (7.2).
7. One Indian states table with both the 2-letter and GST numeric codes.
8. `workWeek` day numbering (recommended: JS `getDay`, 0 = Sunday).
9. `PdfDocument` needs an `issuer` override for Flowbit-issued invoices.
10. `.env.example` additions: `RAZORPAY_WEBHOOK_SECRET`, `FLOWBIT_LEGAL_NAME`, `FLOWBIT_GSTIN`, `FLOWBIT_PAN`, `FLOWBIT_STATE`, `FLOWBIT_ADDRESS`, `FLOWBIT_SAC`, `SUPPORT_EMAIL`.
11. Rate limiting for auth, password change and contact.
12. Avatar files viewable across the user's workspaces (minor).
13. Member ↔ Employee manager and department source of truth (8.6).
