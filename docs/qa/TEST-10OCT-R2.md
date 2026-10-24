# Flowbit 2.0 QA, reviewer 2 of 3 (10 Oct 2026): quality, design and UX

**Scope:** angles 11–20 (design system, mobile, accessibility, states, error copy, performance, copy accuracy, Hindi, brand theming, PDFs and exports).

**Method:** read-only.
- I read the components and modules, and fetched the public pages (`/`, `/faq`, `/help`, `/manual` and its chapters, `/pricing`, `/security`, `/compare-v1-v2`, `/contact`, `/status`) from the demo on 127.0.0.1:4500 with curl.
- I checked font coverage with `fontkit` against the shipped Work Sans files.
- No authenticated curl was done. Minting or reading session tokens was blocked by the permission classifier, so I judged the signed-in pages from source only.
- No browser, no DB writes, no builds and no tests were run.
- Skipped: `src/components/shell/check-in-widget.tsx` and its neighbours, which another agent is changing.

**Already covered elsewhere:** items fixed or accepted in `V2-REVIEW`, `V2-NIGHT-CHECK`, `V2-RECHECK-10OCT` and `BROWSER-CHECK-9OCT` are not repeated. That includes the chart x-axis labels, the Console top bar, 2FA set-up, the tour re-show, the email-to-task address, and the PDF header, signature, footer and contrast rules.

**Totals:** 0 CRITICAL, 2 HIGH, 12 MEDIUM, 23 LOW.

## Fix round B status (11 Oct 2026)

| # | Sev | Status |
|---|---|---|
| 17.1 | HIGH | Fixed bf4ed29 (+ 2b312a5 spec, 468a84b). 50% off the first yearly invoice (Console setting, 0–90); yearly list = 12 × monthly; discount line on bill, checkout and GST invoice. |
| 20.1 | HIGH | Fixed 139d6d9. Work Sans latin-ext registered as a fallback, so ₹ prints; test checks every `bodies.ts` character. |
| 11.1 | MEDIUM | Fixed ef00025, da78c65 (hex ratchet `npm run check:hex`), dba0b5a (sweep, baseline 721). The global `#979797` → `fg-3` sweep is an Owner decision: `--text-3` is darker than `#979797`. |
| 12.1 | MEDIUM | Fixed e3d798d |
| 13.1 | MEDIUM | Fixed e3d798d |
| 13.2 | MEDIUM | Fixed bc64f9e |
| 14.1 | MEDIUM | Fixed 00cef9a |
| 15.1 | MEDIUM | Fixed 9f5b47a |
| 15.2 | MEDIUM | Fixed c569fdf (`DownloadLink` for Tally XML, HR reports, payroll CSVs, policy acks) |
| 17.2 | MEDIUM | Fixed 1a01987, bf4ed29 |
| 18.1 | MEDIUM | Fixed 0fb9f62 (My claims and My letters in Hindi; manual and setting name exactly which screens; My tax and My documents stay English) |
| 18.2 | MEDIUM | Fixed b9db7e1 (self-service action messages localised) |
| 19.1 | MEDIUM | Fixed 94a651e |
| 19.2 | MEDIUM | Fixed b72d7b5, 1483999 |
| 11.2 | LOW | Fixed c41db40 |
| 11.3 | LOW | Fixed f7d0407 |
| 11.4 | LOW | Fixed 4348ea2 |
| 12.2 | LOW | Fixed c41db40 |
| 12.3 | LOW | Fixed ef00025 |
| 12.4 | LOW | Fixed 467797a |
| 13.3 | LOW | Fixed 7796d0c (existing ChipGroup callers still need an `aria-label`) |
| 13.4 | LOW | Fixed bf8e4bd |
| 13.5 | LOW | Fixed 542c966 |
| 14.2 | LOW | Fixed 625dece (not checked in a browser) |
| 15.3 | LOW | Fixed d9665d0 |
| 16.1 | LOW | Fixed 7e60bbe (existing employees get `biometricKey` on their next write) |
| 16.2 | LOW | Fixed a8279d7 |
| 16.3 | LOW | Fixed e97b5ff |
| 16.4 | LOW | Fixed bd38ade (720 px variants and srcset). Paginating the FAQ is an Owner decision (content call). |
| 17.3 | LOW | Fixed 1a01987 |
| 17.4 | LOW | Deferred (needs a browser re-shoot after the posts redesign; `gs-pricing.jpg` still shows "2 months free") |
| 18.3 | LOW | Fixed eefeccd |
| 18.4 | LOW | Fixed 139d6d9 |
| 19.3 | LOW | Fixed bc64f9e |
| 19.4 | LOW | Fixed 94a651e |
| 20.2 | LOW | Fixed 659aa5f |
| 20.3 | LOW | Fixed c767778 |

---

## 11. Design-system consistency

**Checked:**
- Arbitrary hex classes across `src/components` and `src/app`, and brand hex values used outside the tokens.
- Icon libraries and how they are imported.
- Chip, segment and filter components.
- Button variants.

| # | Sev | Type | Where | Evidence | Fix |
|---|---|---|---|---|---|
| 11.1 | MEDIUM | design | `src/components/work/posts/poll-block.tsx:38,48,49` (new v2) | The poll's chosen-option fill, border and radio accent are hard-coded `#B86BA8`, not `orchid`/`chip-active`. With a workspace theme (e.g. Ocean), polls stay pink while the rest of the shell turns blue. More broadly, there are **753** arbitrary `[#hex]` classes. The worst files are `ui/badge.tsx` (17), `post-type-icon.tsx` (16), `console/(staff)/billing/sections.tsx` (16), `task-calendar.tsx` (13) and `pricing-calculator.tsx` (10). Many repeat existing tokens: `#959596` and `#979797` instead of `text-fg-2`/`fg-3`, `#5D4083` instead of `violet-2`, `#E4BD6D` instead of `warning`. | Polls: use `bg-orchid/35`, `border-orchid/60` and `accent-[var(--orchid)]`. Add a lint rule, or a grep in CI, that flags `[#` in `className`, with an allow-list for the Figma literals in DESIGN.md. Then sweep the top files. |
| 11.2 | LOW | design | `src/components/muster/ui/filter-chips.tsx:29`, `src/components/orbit/parts.tsx:93`, `src/components/folio/ui.tsx:121` | There are **three `SegmentLinks` implementations** that have already drifted: inactive text is `white/85` in one and `white/80` in another, and `label` is optional only in the Folio one. Clients (`app/clients/page.tsx:16`) and Tally export import the Folio copy. | Keep one in `components/ui/segment-links.tsx` and re-export it from the three paths. |
| 11.3 | LOW | design | `src/components/work/posts/post-type-icon.tsx:1-11` vs `docs/DESIGN.md:362-365` | Post types use **Phosphor duotone**; everything else uses Lucide outline at 1.5 px (517 files). DESIGN.md says to use one outline set and "don't mix sets". The imports themselves are correct: one file per icon via `dist/ssr/*`, ten icons, no barrel. | This was a deliberate choice, so record it in DESIGN.md §icons as an exception for post types only, so it does not spread. |
| 11.4 | LOW | design | `src/components/ui/button-styles.ts:18` | The `violet` button's hover is hard-coded `#61428a`, so with a theme the hover jumps back to Flowbit purple. | Use `hover:brightness-110` or `color-mix(in oklab, var(--chip-active) 85%, white)`. |

## 12. Mobile at 375 px

**Checked:**
- Fixed and minimum widths and non-responsive grids in every listed v2 page and component: company profile, biometric, bank, Tally, connected apps, Console reports and billing, portal, FAQ, help, manual, charts, clients and posts.
- Hover-only controls.
- Tap heights.

**Result:** all wide tables (`statement-import`, the Clients tabs, Console billing and reports, the role matrix) sit in `overflow-x-auto`, or have a separate mobile list. Hover-revealed icon buttons all carry the `touch:opacity-100` variant (`globals.css:305`). The dialog becomes a bottom sheet below 640 px.

| # | Sev | Type | Where | Evidence | Fix |
|---|---|---|---|---|---|
| 12.1 | MEDIUM | a11y / design | `src/components/charts/bar-chart.tsx:47,76-80`, used by Folio → Reports "Invoiced vs collected" (`report-charts.tsx:92`) and Clients "New clients per month" (`clients-dashboard.tsx:39`) | In the vertical bar chart, bar values exist **only** in `title=`. There is no hover on a phone, so the numbers cannot be read at all. (The same gap affects screen readers; see 13.1.) | Tap or focus a bar to show a value chip, or print the value above the bar when there are 12 or fewer bars. Also add the sr-only table from 13.1. |
| 12.2 | LOW | design | `filter-chips.tsx:30`, `orbit/parts.tsx:103`, `folio/ui.tsx:131` | Segment links are `h-6` (24 px) inside a 33 px pill. That is below the 44 px touch target (WCAG 2.5.8 asks for at least 24 px plus spacing). They are used for the Clients Cards/List toggle and the Tally options. | Add `coarse:h-8`, or the existing `hit-area` utility. |
| 12.3 | LOW | a11y | `src/components/work/posts/poll-block.tsx:37` | Who voted for an option (non-anonymous polls) shows only in a `title` tooltip. A phone can't show it. | Put the names in a disclosure ("7 votes · see who") or a popover. |
| 12.4 | LOW | design | `src/components/work/posts/reaction-bar.tsx:22` | Reaction chips are `h-7` (28 px) with no `hit-area`. The "Add reaction" button next to them has one. | Add `hit-area`. |

## 13. Accessibility

**Checked:**
- The switch, chip group, colour pickers, poll, task side panel (Radix, focus and Esc are fine), product tour (`role="dialog"`, focus and keys are fine), lightbox, dialogs (Radix) and charts.
- FAQ `<details>` and copy-link labels (fine).
- `lang="en-IN"` (fine).
- Alt text on the manual (all images have descriptive alt and dimensions).

| # | Sev | Type | Where | Evidence | Fix |
|---|---|---|---|---|---|
| 13.1 | MEDIUM | a11y | `src/components/charts/bar-chart.tsx` (0 `aria`, `role` or sr-only), `sparkline.tsx` (0) | Area, line, donut and ring charts have an aria label or text. Bar and sparkline charts expose nothing to a screen reader, and they carry the v2 Folio and Clients charts. | Use `role="img"` with an `aria-label` summary, plus a visually hidden `<table>` of label and value rows. |
| 13.2 | MEDIUM | a11y | `src/lib/brand-theme.ts:131` with `button-styles.ts:17` | With a workspace theme, the primary button is white text on `accent → primary 45% → secondary`, so the label sits on the primary colour. White on primary is **2.10:1 for Saffron, 2.49 Sunset, 2.59 Slate, 2.66 Forest and 2.70 Ocean**, and only Flowbit reaches 3.89. All fail AA (4.5). The form checks only that **secondary** is at least 4.5 under white. The default gradient puts dark violet (`#6d428f`) behind the text, so the default theme is fine. | Build the themed `--grad-button` so the middle 30–70 % is `secondary` or a darkened primary, or pick dark ink when white-on-primary is below 4.5. Add the check to `brand-theme.test.ts` for every preset. |
| 13.3 | LOW | a11y | `src/components/ui/chip-group.tsx:35`, `src/components/work/teams/color-picker.tsx:14,23` | `ChipGroup` renders `role="radiogroup"` but takes no `aria-label` or `aria-labelledby`. The team `ColorPicker` group is unlabelled and each swatch is announced as its hex ("#C084FC"). Neither has arrow-key navigation (every radio is a tab stop). | Accept and forward `aria-label`. Name the swatches ("Violet", "Orchid"…). Use a roving tabindex. |
| 13.4 | LOW | a11y | `src/components/settings/brand-colors-form.tsx:58-60` | The native `<input type="color">` is `opacity-0` over the swatch, so the global `:focus-visible` outline is invisible. A keyboard user can't see focus on the colour pickers. | Add `has-[:focus-visible]:outline-2 …` on the wrapping `<label>`. |
| 13.5 | LOW | a11y | `src/components/work/media/image-gallery.tsx:31,43,52` | Post and reply images use the **file name** as alt and dialog title (e.g. "IMG_2034.jpg"). The lightbox has Previous/Next buttons but no ←/→ keys. | Use alt `Image {i} of {n} from {author}'s post`, or let authors add a caption. Add arrow-key handling inside the dialog. |

## 14. Empty, loading and error states

**Checked:**
- `loading.tsx` and `error.tsx` coverage for every v2 route.
- Empty copy on portal, bank, Tally, clients, Folio charts and posts (all present and friendly).
- The blank area on Company profile.

| # | Sev | Type | Where | Evidence | Fix |
|---|---|---|---|---|---|
| 14.1 | MEDIUM | design | `src/app/console/**`, `src/app/portal/**`, `src/app/(marketing)/**`, root | The only error boundary is `src/app/app/error.tsx`. There is **no `global-error.tsx`**. Console (reports and billing run heavy aggregates), the client portal and marketing therefore fall back to Next's unbranded "Application error". Console and portal also have **no `loading.tsx`**, so a slow Console report shows nothing until it streams. | Add `console/(staff)/error.tsx` and `loading.tsx`, `portal/[slug]/error.tsx` and `loading.tsx`, and a root `global-error.tsx` in Flowbit styling. |
| 14.2 | LOW | design | `src/app/app/settings/company/page.tsx:20-46` | **Not reproduced (no browser).** The page is a 7/5 split at `xl`. The left Company details form is much taller than the Logo and Signatories column, so from about the middle of the form the right column is empty while you scroll. That is the most likely cause of the "blank area". I found no reveal or opacity animation in `components/settings/company/*`. | Make the right column `xl:sticky xl:top-4 xl:self-start`, or move Signatories under the form. Confirm in a browser. |

## 15. Error messages and validation copy

**Checked:**
- How `toast.error` gets its text across components.
- Error JSON in routes.
- Zod messages that reach users.
- Biometric, bank and Tally copy (clear and consistent).

| # | Sev | Type | Where | Evidence | Fix |
|---|---|---|---|---|---|
| 15.1 | MEDIUM | copy | `src/components/ui/confirm-dialog.tsx:45`; `src/components/work/whiteboards/board-editor.tsx:150,164`; `src/components/orbit/import-leads-dialog.tsx:50` | `useAction` hides thrown errors on purpose (`action-form.tsx:91-93`: "their text is not for users"). **ConfirmDialog**, used for every delete and remove, toasts `error.message` instead. In production that is Next's long "An error occurred in the Server Components render…" sentence, or "Failed to fetch". The board save calls `res.json()` on any response, so a 502 or HTML page toasts "Unexpected token '<'…". | Use the same `SAVE_FAILED` copy and `console.error` in ConfirmDialog. In the board editor, parse JSON only when `content-type` is JSON and map network failures to "Could not save the board. Check your connection." |
| 15.2 | MEDIUM | design / copy | `src/app/app/folio/export/page.tsx:63` and `src/app/api/folio/export/tally/route.ts:24,32` | "Download Tally XML" is a plain `<a href>`. When the route refuses ("Too many documents…", 422) or fails (500), the browser leaves Flowbit and shows raw `{"error":"…"}` JSON. | Fetch first and toast the error, or have the route redirect back with `?error=` that the page shows in its Callout. The same pattern is worth checking on the other `<a href>` CSV and PDF downloads. |
| 15.3 | LOW | copy | `src/modules/muster/payroll/settings-actions.ts:109` | The user sees the field path and Zod's default text, e.g. "The rates need attention: pf.employeeRate — Number must be less than or equal to 0.2". | Map paths to labels and write the message ("Employee PF rate must be 20% or less"). |

## 16. Performance

**Checked:**
- New-model indexes: BankTxn, BankStatement, Sequence, SequenceEnrollment, Post, PostReply, OAuthGrant, McpIdempotency, Client, Employee.
- Clients dashboard and posts audience queries (grouped, no N+1).
- Unbounded finds in the v2 modules.
- Excalidraw (dynamic import), react-pdf (server only) and Phosphor (per-icon).
- `public/manual-img` (108 JPEGs, 9.5 MB in total, about 110 KB each at 1440×900, `loading="lazy"` with width and height).

| # | Sev | Type | Where | Evidence | Fix |
|---|---|---|---|---|---|
| 16.1 | LOW | perf | `src/models/muster/Employee.ts:32`, `src/modules/muster/attendance/biometric/save-mapping.ts:15` | `biometricId` has no index, and uniqueness per org is enforced only in app code (find all holders, then compare). Two concurrent mapping saves can both pass. | Add `{ orgId:1, biometricKey:1 }` unique and partial on a normalised key (leading zeros stripped). |
| 16.2 | LOW | perf | `src/lib/auth/session.ts:116`, `src/lib/auth/reset.ts:34`; indexes in `src/models/mcp/OAuthGrant.ts:34-38` | `updateMany({ userId, revokedAt: null })` on a **global** collection with no `userId` index scans the whole collection on every password reset and "sign out everywhere". | Add `{ userId: 1, revokedAt: 1 }`. |
| 16.3 | LOW | perf | `src/modules/clients/queries.ts:132` and `src/modules/clients/dashboard.ts:76` | With a health filter, `clientSignals(ctx, 'all', today)` runs twice per Clients page load: once for the filter and once for the dashboard. | Compute it once in the page and pass it to both. |
| 16.4 | LOW | perf | `/faq` HTML is 390 KB; `/` is 310 KB; the manual Folio chapter has 23 images × about 110 KB at 1440 px | No `srcset`, so phones download desktop-size screenshots. The FAQ ships all 105 answers twice (HTML plus RSC payload). | Make 720 px variants and add `srcset`/`sizes` in `modules/manual/parse.ts:40`. Consider paginating the FAQ by section. |

## 17. Copy and content accuracy

**Checked against code:**
- Prices (Suite ₹149, min 10 = ₹1,490; Work ₹59; Muster ₹39/₹79; Orbit ₹149; Folio ₹399 + ₹199 per firm).
- The calculator maths (20 people: ₹3,159 vs ₹2,980, saves ₹179).
- Free (5 seats × 6 months) and the 15-day trial.
- The AI allowance (0/50/500 = `DEFAULT_AI_CAPS`).
- WhatsApp: only "coming soon" in the FAQ, guarded by `faq.test.ts:62`.
- No `flowbit.app` or "Flowbit Technologies" in user copy. The only hit is `env-check.ts:18`, an intentional guard.

| # | Sev | Type | Where | Evidence | Fix |
|---|---|---|---|---|---|
| 17.1 | **HIGH** | copy | `src/modules/lifecycle/content.ts:40`, `src/lib/console/settings-defaults.ts:59` vs `src/lib/plans.ts:12`, `docs/STATUS.md:673`, `/pricing`, manual `10-start.html:24` | Lifecycle emails ("free months ending" and the trial mails) promise "**yearly plans are 50% off the first year**". Checkout and Console bills charge yearly as `YEARLY_MONTHS = 10` (2 months free), and STATUS lists the 50 % discount under "Not in this step". The pricing page and manual say "2 months free". A customer is promised a price they won't be charged. | Either build the first-year 50 % in `lib/plans` and the checkout, and update `/pricing`, the FAQ and the manual, or change both email strings to "Yearly plans cost 10 months' price". Owner decision needed (memory: "50% off the first year, on yearly plans only"). |
| 17.2 | MEDIUM | copy | `src/components/marketing/pricing-calculator.tsx:140`, `src/app/(marketing)/page.tsx:70` | "Every plan starts with a 15-day free trial of all four products" and "Every product switched on for 15 days". The FAQ, the manual and signup say teams of 5 or fewer start on **Free for 6 months**, not the trial. | "Teams of up to 5 start free for 6 months; larger teams get a 15-day trial of everything." |
| 17.3 | LOW | copy | `src/app/(marketing)/page.tsx:59`, `opengraph-image.tsx:11`, `site-footer.tsx:21` | "Built for Indian teams of **6 to 150**" while Free targets teams of 1–5. | "up to 150", or "2 to 150". |
| 17.4 | LOW | copy | `content/manual/20-work.html:242` (`public/manual-img/work-posts.jpg`) | The Posts screenshot shows the v1 filters (Announcements / Discussions / Ideas / Updates), not the 10 v2 types. The caption admits it is the earlier feed. There are no screenshots for the v2 posts, company profile, biometric or bank pages. | Re-shoot after the posts redesign settles. |

## 18. Hindi / i18n

**Checked:**
- Dictionary parity, which is enforced by types and `i18n.test.ts`.
- English literals in the translated components (none found outside the skipped check-in widget).
- Which `/app/me/*` pages use `t()`.
- Server-action messages.
- Dates.
- PDF Devanagari font registration.

| # | Sev | Type | Where | Evidence | Fix |
|---|---|---|---|---|---|
| 18.1 | MEDIUM | copy (i18n) | `src/app/app/me/page.tsx:28-34`; `src/app/app/me/claims/page.tsx`, `letters/page.tsx`, `tax/page.tsx`, `documents/page.tsx` (0 `t()` calls) | My space links, in Hindi, to **Claims** and **Letters**, which are entirely English. Tax and Documents are English too. The manual (`70-new.html:120`) says "Flowbit in Hindi for My space". | Translate these four pages, or narrow the manual claim to "My profile, leave, attendance, payslips and check-in". |
| 18.2 | MEDIUM | copy (i18n) | `src/modules/muster/leave/actions.ts:57-66` (and the other actions behind `components/muster/me/request-forms.tsx`) | Every server-action success or error toast on the Hindi screens is English ("That request is already closed."), because actions don't read the locale. | Return message keys from the self-service actions, or pass `localeOfUser(ctx.user)` and use `t()` for those messages. |
| 18.3 | LOW | copy (i18n) | `src/lib/dates.ts:63-72` (used at `me/page.tsx:65`) | `formatDate` always prints English month and weekday names ("Sat, 10 Oct 2026") under a Hindi greeting. | Add an optional locale, e.g. `Intl.DateTimeFormat('hi-IN', { timeZone: 'Asia/Kolkata' })`. |
| 18.4 | LOW | bug | `src/lib/pdf/base.tsx:17-31` | Only payslips switch to Noto Sans Devanagari. Invoices, quotes, statements, letters and Form 130 use **Work Sans Latin** only (no U+0900 glyphs, checked with fontkit). A client, employee or company name or address typed in Hindi prints as missing glyphs. | Register Work Sans with Noto Devanagari as a fallback family, or switch to Noto when a string contains Devanagari. Shaping still needs a printed check. |

## 19. Brand theming

**Checked:**
- `workspaceTheme` use in the shell (`themeCss`), PDFs (`pdfBrandForOrg`), doclinks (`load.ts:53`), the portal (`brandFor`), email (`emailBrandFor`) and the `/a` and `/p` pages.
- Contrast checks.
- Where the logo is read from: `Org.logoFileId` in the shell, PDFs, email and doclinks, so a replaced logo reaches all of them.

| # | Sev | Type | Where | Evidence | Fix |
|---|---|---|---|---|---|
| 19.1 | MEDIUM | bug | `src/lib/email-brand.ts:25,33`; `src/app/a/[token]/page.tsx:32`; `src/app/p/[token]/page.tsx:22` | These call `resolveTheme(org.theme)`, not `workspaceTheme(org)`. A workspace whose trial ended, or which left Suite, keeps its brand colour on **client emails** and the `/a`, `/p` pages, while the shell and PDFs fall back to Flowbit's. The email query doesn't even load `subscription`. | Load `subscription`, `createdAt` and `status`, and use `resolveTheme(workspaceTheme(org))`, as `doclinks/load.ts:53` does. |
| 19.2 | MEDIUM | design | `src/app/globals.css:39,677`; `src/lib/brand-theme.ts:39` | The Appearance form says Primary drives "Links, focus rings, active states and charts". But `--link` (`#ca81b8`) and the `:focus-visible` outline (`rgba(202,129,184,.85)`) are literals that `themeVars` never overrides. Links (`text-link`, 82 uses) and focus rings stay orchid under every theme. | Add `'--link': primary` (lightened to 4.5:1 on `#171717`) to `themeVars`, and use `outline-color: color-mix(in srgb, var(--link) 85%, transparent)`. |
| 19.3 | LOW | bug | `src/lib/brand-theme.ts:45` | `DARK_SURFACES = ['#0b0a0f', '#121017']`, but the real `--bg` and `--bg-2` are `#171717` and `#1a1a1a` (`globals.css:12-13`), and cards are `#27272b`. The check over-reports contrast: Flowbit orchid is 5.08:1 on `#0b0a0f` but 4.61 on `#171717` and 3.83 on cards. A borderline colour is labelled "Readable as text" when it isn't. | Use `['#171717', '#1a1a1a', '#27272b']`. |
| 19.4 | LOW | bug | `src/app/api/public/brand/[key]/logo/route.ts:14` | The email logo URL stays the same after a logo is replaced, and is served `public, max-age=86400`. Mail proxies (Gmail) can keep the old logo for at least a day. | Rotate `brandKey` on logo change, or add `?v=<fileId>` to `brandLogoUrl`. |

## 20. PDFs and exports

**Checked:**
- Glyph coverage of every PDF builder's literal text against `work-sans-latin-*.woff` (fontkit).
- Table header repeat (`fixed`) and row `wrap={false}` in `base.tsx` and `folio/pdf/parts.tsx`.
- Signature block `wrap={false}`.
- Money printing (`formatINRForPrint` → "Rs.").
- Tally XML escaping (`xmlEscape`, control characters stripped, paise to two-decimal rupees).
- The five CSV writers.

| # | Sev | Type | Where | Evidence | Fix |
|---|---|---|---|---|---|
| 20.1 | **HIGH** | bug | `src/modules/muster/letters/bodies.ts:15,121,138,181,196,288`, rendered by `src/modules/muster/letters/pdf.tsx:43-47` | The built-in **offer, appointment, internship, increment, revision and settlement letters print "₹"**. The PDF font has no ₹ glyph (`hasGlyphForCodePoint(0x20B9) === false`), and `lib/money.ts:36` itself says ₹ "prints as a broken character". The salary line of every offer letter shows a box or nothing before the amount. The same applies to ₹ typed into custom templates or invoice line text. | Replace `₹` with `Rs.` when building the letter text (`render.ts`), or register a ₹-capable font: the Work Sans latin-ext subset or Noto Sans covers U+20B9. Add a test that every `bodies.ts` character is in the PDF font. |
| 20.2 | LOW | bug | `src/modules/muster/tax/form130-pdf.tsx:75` | The fallback "Not set (Salary tax **→** Tax year settings)" uses U+2192, which the font lacks. | Use "Salary tax > Tax year settings" or "in Salary tax, Tax year settings". |
| 20.3 | LOW | design | `src/modules/orbit/csv.ts:5`, `src/modules/folio/engine/csv.ts:12`, `src/modules/muster/reports/csv.ts:5`, `src/modules/work/posts/acks.ts:43` (plus Papa in `muster/import/csv.ts:30`) | There are five CSV escapers with different rules: <ul><li>Muster reports don't guard leading tab or CR.</li><li>Folio prefixes `'` to any string starting with `-`, so a negative amount passed as text becomes text in Excel.</li><li>Some add a BOM and some don't.</li></ul> All quote correctly, and Indian grouping is never written into numeric cells. | Use one `csvCell` in `lib/csv-safe.ts` with the `PLAIN_NUMBER` exemption, and use it everywhere. |

**No new issues:** Tally XML escaping and amounts; repeated table headers and unsplittable rows on long invoices and statements; signature block kept together; "Rs." money in every builder; Console bill seller is Sanskaar Webx Services LLP.

---

## Top 10

1. **20.1 HIGH:** ₹ prints as a broken glyph in every built-in salary letter PDF.
2. **17.1 HIGH:** emails promise 50 % off the first year on yearly plans, but billing charges 10 months.
3. **19.1 MEDIUM:** the brand-colour plan gate is bypassed on client emails and the `/a`, `/p` pages.
4. **13.2 MEDIUM:** themed primary buttons fail AA (white on primary is 2.1–2.7:1 on six of the eight presets, 3.3–3.9 on the other two).
5. **19.2 MEDIUM:** links and focus rings ignore the brand primary, although the form says they follow it.
6. **14.1 MEDIUM:** no error or loading boundaries for the Console, the portal or marketing, and no `global-error`.
7. **15.1 MEDIUM:** ConfirmDialog and board save toast raw framework or JSON parse errors.
8. **18.1 and 18.2 MEDIUM:** Hindi My space links to English pages, and the action toasts are English.
9. **12.1 and 13.1 MEDIUM:** bar chart values are hover-only and invisible to screen readers (Folio and Clients charts).
10. **15.2 MEDIUM:** a Tally export error shows raw JSON in the browser.

**Needs a browser:** 14.2 (the Company profile blank area), Devanagari shaping in printed payslips, and themed button contrast in practice.
