# Flowbit: visual spec (authoritative)

This file replaces the loose description in `docs/SPEC.md` §3 wherever the two disagree. Every number here was
measured from the Figma captures in `docs/design/figma/` (2x density: 1 design px = 2 image px) with a pixel
sampler (PIL `getpixel` over the stitched 1:1 tiles, which is equivalent to a canvas `getImageData`). Values
marked **(est.)** are estimates: a radius read from anti-aliased pixels, a translucent fill solved back from
the colour it produces, or a size rounded to the nearest sensible step. Unmarked values were read directly.

The product is **dark only**. The light frames are listed for reference and are not to be built.

---

## 0. Capture inventory

| File stem | What it actually is | Frame size (design px) |
|---|---|---|
| `dashboard-dark` | Home dashboard, dark. **Source of truth for the shell and internal pages.** | 1728 × 1416 |
| `dashboard-light` | Same dashboard, light theme (reference only) | 1728 × 1416 |
| `login-desktop-b` | Desktop sign-in, **dark**: brand-gradient panel left, glass card on pure black right, two ribbons | 1728 × 780 |
| `login-desktop-a` | Desktop sign-in, light (reference only) | 1728 × 780 |
| `login-mobile-dark` | Mobile sign-in, dark (iPhone 16 width) | 393 × ~928 |
| `login-mobile-light` | Mobile sign-in, light (reference only) | 393 × ~928 |
| `onboarding-a` | Onboarding **step 1, dark**: "Create your workspace" | 1728 × ~930 |
| `onboarding-b` | Onboarding **step 2, dark**: "Choose how you want to work" | 1728 × ~930 |
| `onboarding-c` | Onboarding step 2, light (reference only) | 1728 × ~930 |
| `onboarding-d` | Onboarding step 1, light (reference only) | 1728 × ~930 |
| `extra-338_483` | **Check-in widget, "on break" variant** (amber glossy clock) | 233 × 77 |
| `checkin-390_677` | Misnamed: **app icon**, square tile, brand mesh + white mark **without** the centre dot | 165 × 147 |
| `checkin-389_771` | Misnamed: **app icon**, same with ~24px rounded corners (est.) | 165 × 147 |
| `extra-250_1964`, `extra-272_218`, `extra-292_479`, `extra-389_772` | Byte-identical captures of one **brand mesh swatch** (104 × 118). No other content. | 104 × 118 |
| `logo-17466` … `logo-17473` | Byte-identical to the swatch above. **The logo-direction frames were not captured**; the presentation view kept showing the swatch. | n/a |

Tile geometry, in case anyone re-measures: horizontal tiles are offset by exactly 288 design px (clamped to the
frame width, 1728 − 1440), the dashboard's second row by 516, onboarding by 30, mobile by 28. The login frames are
780 tall and sit 60 px below the top of each tile.

The brand kit is `"/Users/sanskaarsingh/Downloads/Flowbit brand kit.pdf"`, rendered to `docs/design/brandkit.svg`
(vectors, `pdftocairo -svg`) and `docs/design/brandkit/page-1.png` (200 dpi). Kit colours: indigo `#210B5D`,
orchid `#BB62A5`, blush `#EAC1DC`. Typeface: Work Sans.

---

## 1. Principles: what makes this feel premium and human

What the Figma does that reads as crafted:

1. **Neutral charcoal, not blue-black.** The page is `#171717`, a warm neutral. Colour comes from a few
   deliberate light sources: a plum glow behind the top of the content area, the purple rail, the brand mesh.
   Surfaces don't carry tints of their own.
2. **Light shows up in edges.** Cards are mostly defined by a hairline that catches light: brighter on the left
   and top-left edges, fading to almost nothing across the top centre. A bright bottom lip marks the Arc input.
   The selected option card gets a 3px white-to-orchid stroke.
3. **Thick, confident data bars.** The workday timeline is 42 px tall and the attendance bar is 48 px. Neither
   is a thin progress line.
4. **Small, varied radii.** Cards use 8–16 px. Pills are fully rounded only where they are controls (inputs,
   buttons, chips, tabs). The rail and the main panel have tight 8–10 px corners.
5. **Hairline structure, not boxes.** The shell is divided by 1 px `#535353` lines (logo row, top bar, side panel
   sections). It is not a stack of floating rounded cards.
6. **Real materials where they matter.** The glossy 3D ribbons, the glass clock and the brand mesh are rendered
   imagery. Pair them with plain, quiet UI around them.
7. **Colour carries meaning, sparingly.** Indigo `#6160FF` means in progress, `#FF4540` overdue, teal `#08AD93`
   completed, mint/amber/pink are attendance. Accents never appear decoratively.

The AI tells to avoid. These combine the owner's brief with the SPEC §3 rules, and each one has a fix:

| Tell | Instead |
|---|---|
| Big 20–24 px radius on everything, every container a floating rounded card | Radius scale in §5. Shell panes are hairline-divided rectangles. |
| Opaque or coloured card borders (purple/indigo outlines) | 1 px translucent white hairline, brighter on the lit edge (§4). Never a hue. |
| Decorative dots: a red notification dot, coloured dots before labels, status dots inside pills, pulsing "live" dots | No dot unless the Figma has it. The Figma **does** have: 12 px rounded-square legend keys in Project overview, 12 px round legend keys in My attendance, the sparkline end-marker. Keep those. Notification counts are numerals, if you need them at all. |
| Thin 4–6 px progress bars | 42 px timeline bar, 48 px attendance segments |
| Flat glass (a single semi-transparent fill), no motion in gradients | Glass = translucent fill + backdrop blur + lit hairline + soft inner highlight; brand gradients drift slowly (§3) |
| Even, generic 24 px gaps and centred everything | Asymmetric, content-led layout as measured; left-aligned headings; the greeting is small (20 px), not a hero |
| Gradient text everywhere, rainbow accents | Gradient text only for the wordmark and "Flowbit" in the sign-in heading |
| Emoji, sparkle icons, "AI" badges | Outline icon set, 1.5 px stroke |
| Uniform grey-on-grey with no light source | One warm glow per screen (plum top-centre on app pages, top-right on onboarding) |

---

## 2. Colour tokens

### 2.1 Surfaces (app, dark)

| Token | Value | Where measured / used |
|---|---|---|
| `--page` | `#171717` | Page base, lower half of the content area, outside the rail |
| `--page-glow` | `#2A202C` at its peak | Plum glow behind the top of the content area. Peaks around x 1000–1300, y 30–150 of the frame and is gone by y≈700. See §3.4. |
| `--panel` | `#1A1A1A` | Side panel fill, logo row |
| `--panel-2` | `#1B191B` → `#1E1A1E` | Top-bar strip (picks up the glow) |
| `--line` | `#535353` (≈ `rgba(255,255,255,0.25)` on `--panel`) | All 1 px structural hairlines: logo row bottom (y 89), side panel edges (x 101, x 376), side panel section break (y 501), main panel outline, table header rules |
| `--line-soft` | `#6B676C` (≈ `rgba(255,255,255,0.22)` on glass) | Divider inside the Project overview card |
| `--surface-solid` | `#27272B` → `#252629` | My attendance card (opaque, no stroke) |
| `--surface-table` | `linear-gradient(90deg, #282829, #383739)` | Assign to me card (opaque, lighter towards the right) |
| `--control-dark` | `#171717` | Chips on glass (Arc suggestions), segmented-control track, dropdown pill, empty calendar days |
| `--control-active` | `#313131` | Active segment in the segmented control |
| `--auth-black` | `#000000` | Desktop and mobile sign-in background (right half / below the hero) |

### 2.2 Text

| Token | Value | Use |
|---|---|---|
| `--text` | `#FFFFFF` | Headings, section labels, table text, nav labels. The Figma uses pure white throughout. |
| `--text-2` | `#959596` | Card subtitles ("Showing all tasks assign to me", "Your own record of attendance") |
| `--text-3` | `#979797` | Muted table values ("Tomorrow", "25 Jul"), weekday headers `#929394` |
| `--text-4` | `#797779` | Placeholder ("Search") |
| `--text-label-dim` | `#8D8D8D` | "CHECK IN" label on the widget |
| `--icon-muted` | `#7A787A` | 14 px list icons in the side panel |
| `--name` | `#EBCBE2` | Person's name in the greeting ("Gaurav"); close to blush `#EAC1DC` |
| `--link` | `#CA81B8` | "Forgot password?" on dark |
| `--day-ink` | `#575D6A` | Numerals on mint and amber day pills and on empty days |

### 2.3 Brand

| Token | Value | Use |
|---|---|---|
| `--indigo` | `#210B5D` (kit); renders as `#2A1564` at the mesh's darkest point | Brand |
| `--orchid` | `#BB62A5` (kit); renders as `#CA81B8` in the mesh | Brand |
| `--blush` | `#EAC1DC` (kit) | Brand, name highlight |
| `--violet` | `#56397D` | Selected chip, "Add Member" button (onboarding) |
| `--violet-2` | `#5D4083` | "Selected" tab and the "Best for" band on option cards, Half-day block `#5E4084` |
| `--avatar-ws` | `#784082` | Workspace avatar square |
| `--avatar-ink` | `#200C55` | Initial on the white user avatar |

### 2.4 Status and data

| Meaning | Value | Where |
|---|---|---|
| In progress | `#6160FF` | Stat sparkline and pill, "Medium" priority, middle ring, Project overview status pill `#6B6AFF` (text) on `#6160FF` |
| Overdue | `#FF4540` | Stat sparkline and pill |
| Completed | `#08AD93` | Stat sparkline and pill |
| Priority high | `#FFA040` | Bars icon + label |
| Priority low | `#0CBA65` | Bars icon + label |
| Due today | `#FF2D31` | Due column |
| Attendance on time | `#70F3C3` (segment `#6DEDBF`) | Bar segment, day pills, legend |
| Attendance late | `#E4BD6D` | Bar segment, day pills, legend |
| Attendance absent | `#F5548C` | Bar segment, day pills (white numeral), legend |
| Project done (ring) | `#E68763` | Outer ring + legend key |
| Blocked (ring) | `#FAB5E8` | Inner ring + legend key |
| Ring track | `#505050` / `#565356` | Unfilled ring |
| Check-in: working | glossy green disc, `#86F9CE` highlight → `#03B870` body → `#02591D` rim | Clock disc |
| Check-in: on break | glossy amber/orange disc (`extra-338_483`) | Clock disc |

The SPEC §3 status hexes (`#5EEAB0`, `#E8B65C`, `#F0507A`, `#6366F1`) are close but not the Figma values. Use
the table above.

---

## 3. Gradients and their motion

All motion is slow and small. The test: someone looking for three seconds should feel it rather than notice it.
Under `prefers-reduced-motion: reduce`, every animation below stops at its first frame.

### 3.1 Brand mesh (auth left panel, mobile hero, app icon, swatch)
Sampled from `login-desktop-b` (786 × 780 panel). It's a soft four-point mesh:

| Point | Colour |
|---|---|
| Top-left (≈ 10%, 10%) | `#2A1564` deep indigo |
| Top-right corner | `#8F77A7` dusty lavender |
| Right, a little below the middle (≈ 90%, 62%) | `#CA81B8` orchid |
| Bottom-left corner | `#FCFCFE` near white |
| Bottom-right | `#D196C4` pink |

```css
--grad-mesh:
  radial-gradient(60% 55% at 12% 10%, #2A1564 0%, rgba(42,21,100,0) 70%),
  radial-gradient(55% 50% at 92% 62%, #CA81B8 0%, rgba(202,129,184,0) 70%),
  radial-gradient(65% 55% at 0% 100%, #FCFCFE 0%, rgba(252,252,254,0) 70%),
  linear-gradient(160deg, #2E1966 0%, #6A5290 35%, #C58AB9 68%, #E9C9E0 100%);
```
**Motion:** stack the radial layers on a 140% canvas and drift each blob on its own looping path:
indigo ±4% over 38 s, orchid ±5% over 46 s, white ±3% over 52 s, all `ease-in-out`, alternating. Hue doesn't
change, only position. Optionally add a 2% `scale` breathing on the whole layer over 30 s.

### 3.2 Primary button gradients
- **Sign in (auth)**, measured left → right: `#D7C6D9` → `#CFA7CB` (20%) → `#A36CA8` (42%) → `#6D428F` (58%) →
  `#5F398B` (72%) → `#3C2571` (100%). The bottom edge is lit: bottom-centre `#A474B0` against top-centre
  `#724591`.
  ```css
  background:
    radial-gradient(80% 120% at 30% 120%, rgba(255,235,250,.45), transparent 60%),
    linear-gradient(90deg, #E2D2E3 0%, #CFA7CB 20%, #A36CA8 42%, #6D428F 60%, #4A2F7B 85%, #3C2571 100%);
  ```
- **Continue / Create Workspace (onboarding)** is mirrored: deep on the left, light on the right, lit top-right.
  Measured `#3C2472` (left) → `#9968A7` (40%) → `#DEB8D8` (70%) → `#EBDDEC` → `#D6CBDC` (right edge).
  `linear-gradient(70deg, #3C2472 0%, #6E4F92 25%, #A677B5 50%, #E4B9DD 75%, #EDE0EC 92%, #D6CBDC 100%)`.
- **Motion:** at rest, the gradient's `background-position` drifts ±6% over 9 s. On hover, a soft light
  sweep (a 30%-wide white band at 18% opacity, skewed −20°) crosses once in 900 ms. On press, scale to 0.98.

### 3.3 Workday timeline fill
Measured along the 42 px bar: `#F8EEF6` (0%) → `#E7D2E5` (22%) → `#C8AACA` (37%) → `#9074A5` (51%) →
`#4E387C` (66%) → `#3E2A72` (80%) → `#796C9D` (100%, a lit rim at the "now" end). The lower edge runs pinker
(`#A87EAF` against `#9074A5` above it).
```css
background: linear-gradient(90deg, #F8EEF6 0%, #E7D2E5 22%, #C8AACA 37%, #9074A5 51%, #4E387C 66%, #3E2A72 80%, #6B5E95 94%, #8E82B0 100%);
```
**Motion:** a slow sheen. A 120 px soft highlight (white, 14%) travels left to right across the fill every
7 s. The "now" edge eases forward when the minute changes (600 ms).

### 3.4 App page glow
```css
background:
  radial-gradient(48% 40% at 58% 0%, rgba(58,40,62,.85) 0%, rgba(42,32,44,.6) 35%, rgba(23,23,23,0) 75%),
  #171717;
```
**Motion:** the ellipse centre wanders 4% horizontally over 40 s.

### 3.5 Onboarding backdrop
Black (`#000`/`#05020B`) with a plum glow peaking at `#734B69` around frame (1300, 40), gone by y≈600 and
x<800. Faint indigo in the top-left (`#070410`).
`radial-gradient(520px 560px at 75% 4%, #744C6A 0%, rgba(116,76,106,.45) 40%, transparent 78%), #000`.
**Motion:** breathing. Opacity 0.85 ↔ 1 and a 3% radius change over 18 s.

### 3.6 Rail
Measured top → bottom at the left edge: `#281158` (0%), `#3E1E64` (25%), `#4D276B` (40%), `#592E72` (53%),
`#643577` (63%), `#723D7E` (79%), `#814686` (94%), `#854988` (100%). The right edge runs about 12 units
lighter, so the direction is about 172°.
`linear-gradient(172deg, #281158 0%, #3E1E64 25%, #4D276B 40%, #643577 63%, #723D7E 79%, #8A4C8B 100%)`.
**Motion:** none, or a 60 s ±3% position drift at most. The rail is chrome and should stay calm.

### 3.7 Wordmark gradient (app shell, onboarding)
Measured across "Flowbit": `#F4E5F0` → `#E6C6DE` (30%) → `#D4ABCD` (50%) → `#B68DB9` (70%) → `#806098` (90%) →
`#654988`. This lives in `public/brand/flowbit-logo-gradient.svg`. The mark's rays use a radial gradient
from the centre: `#4E3588` (inner end) → `#7D6AA2` → `#A47DAE` → `#BE83B5` → `#C98ABA` (outer end). The centre dot
uses a linear gradient, light at the top right (`#ECDCEB`) through `#C78DBA` to `#4F3C7E` at the bottom left.

### 3.8 Stat-card glow
A colour wash in each stat card's bottom-right corner: indigo `#3D3977`, red `#752F31` and teal `#1A544E`
where they meet the card edge. Use `radial-gradient(60% 70% at 100% 100%, <accent> @ 45%, transparent 70%)`.
The sparkline is 2 px with a glow, `filter: drop-shadow(0 0 6px <accent>99)` (est.).
**Motion:** draw the line on mount (stroke-dashoffset, 900 ms, ease-out), then leave it still.

### 3.9 Google button stroke
A 1 px conic/linear multicolour stroke around a pill: `#FD8036` (left) → `#FEAF18` → `#747220`/green
`#407030` → `#1A6C46` → `#3086FF` (right). Fill `#212121`. Use `linear-gradient(90deg, #EA4335, #FBBC05 35%,
#34A853 65%, #4285F4)` as a 1 px border image on a pill. No motion.

### 3.10 Option card selected stroke
3 px. White at the top-left → `#BF74B4` across the top → `#592E71` at the right/bottom → `#E9B1DE` along the
bottom. Use `linear-gradient(135deg, #FFFFFF 0%, #E9B1DE 35%, #BF74B4 60%, #592E71 100%)` as the border.

---

## 4. Glass recipe

Every glass value below was solved back from the colour it produces over a known backdrop.

| Surface | Visible fill | Backdrop | Solved recipe |
|---|---|---|---|
| Sign-in card (`login-desktop-b`) | `#1A1A1A`, up to `#222222` at the top-right | `#000` | `rgba(255,255,255,0.10)` + `backdrop-filter: blur(24px)` (est. from the blurred ribbons) |
| Onboarding card | `#1A1A1A` at the bottom, `#84627C` at the top-right (glow behind) | black + plum glow | `rgba(255,255,255,0.10)` + `blur(40px) saturate(120%)` (est.) |
| Arc card (dashboard) | `#2C2B31` at the top → `#453757` bottom-left / `#655C69` bottom-right | `#1E1B1F` | `rgba(255,255,255,0.06)` plus a purple radial light from the bottom: `radial-gradient(90% 60% at 30% 110%, rgba(140,90,170,.45), transparent 70%)` |
| Project overview card | `#3C383E` → `#423D47` | `#221C24` | `rgba(255,255,255,0.11)` + `blur(20px)` |
| Timeline card | `#362E38` → `#3B333C` | `#2A202C` | `rgba(255,255,255,0.05)` |
| Timeline track (inside) | `#59535B` | timeline card | `rgba(255,255,255,0.17)` |
| Stat cards | ≈ backdrop (`#261D28`) | `#271E29` | Transparent (≤ 0.02) plus the corner wash in §3.8 |
| Onboarding inputs | `#616065` → `#766D74` (lighter to the right, the glow showing through) | glass card | `rgba(255,255,255,0.28)`, border `rgba(255,255,255,0.18)` (`#464549`) |
| Onboarding option cards | `#656368` / `#6B676C` → `#797077` | glass card | `rgba(255,255,255,0.32)` |
| Unselected onboarding chips | `#626163`, border `#454446` | glass card | `rgba(255,255,255,0.30)` + 1 px `rgba(255,255,255,0.15)` |
| Arc input pill | `#3D2E52` (left) → `#837685` (right), bottom lip `#F5DCF0` | Arc card | `linear-gradient(90deg, rgba(120,80,160,.35), rgba(220,200,225,.35))` + `blur(12px)` |

**Border (the lit hairline).** On a 2x screen the Figma stroke is one device pixel: 0.5 CSS px at roughly
70% white on the lit side (`#C3BCC4` over `#26`), falling to about 25% on the far side and nearly 0 across the
top centre on stat cards. Recipe:
```css
.glass {
  position: relative; background: rgba(255,255,255,.06);
  backdrop-filter: blur(20px) saturate(120%);
  border-radius: var(--r-card);
}
.glass::before {               /* lit hairline, translucent, never a hue */
  content: ""; position: absolute; inset: 0; border-radius: inherit; padding: 1px;
  background: linear-gradient(115deg, rgba(255,255,255,.55) 0%, rgba(255,255,255,.10) 35%,
                              rgba(255,255,255,.04) 55%, rgba(255,255,255,.22) 100%);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor; mask-composite: exclude; pointer-events: none;
}
@media (min-resolution: 2dppx) { .glass::before { padding: .5px; } }   /* match the Figma's device-pixel line */
```
- **Inner highlight:** `box-shadow: inset 0 1px 0 rgba(255,255,255,.06)` (est.). It's subtle and not visible
  on every card.
- **Shadow:** none visible on dark cards. Depth comes from the hairline and the backdrop. Don't add drop shadows.
- Where the Figma border is bright all round (Project overview top `#ADA9B2`, sign-in card left/bottom
  `#7C7C7C`), raise the first stop to `.65`.

---

## 5. Radius scale (measured per component)

| Component | Radius |
|---|---|
| Main content panel (top-left corner; right edge runs off the frame) | 10 (est. 9–10) |
| Rail (left corners; the right side abuts the side panel) | 8–10 (est.) |
| Side panel section box, top-right corner | 8 (est.) |
| Stat cards | 8 (est.) |
| Arc card | 10 (est.) |
| My attendance card | 10 (est.) |
| Assign to me card | 12 (est.) |
| Project overview card | 14 (est.) |
| Timeline card | 16 (est. 14–16) |
| Timeline bar, half-day block | 8 |
| Check-in widget card | 10 (est.) |
| Sign-in card, onboarding card | 16 (est. 14–16) |
| Onboarding option cards | 14 (est.) |
| "Selected" tab | 8 top corners only |
| Arc tile in the rail | 10 (est.) |
| Workspace avatar | 6 (est.) |
| Rail active indicator | 6 on the right corners, 0 on the left (flush to the rail edge) |
| Legend key (Project overview) | 3 (12 × 12 square) |
| Inputs, buttons, chips, segmented control, dropdown, pills, day pills, attendance segments | full (height / 2) |

Tokens: `--r-xs: 3px; --r-sm: 8px; --r-md: 10px; --r-lg: 12px; --r-xl: 16px; --r-pill: 999px`.
The Figma isn't perfectly consistent. When building new surfaces, use `--r-md` for small cards and tiles,
`--r-lg` for content cards and tables, and `--r-xl` only for the hero glass (auth and onboarding card,
timeline). Nothing above 16.

---

## 6. Spacing scale

Measured gaps in the dashboard: 12 (stat card ↔ stat card, stat row ↔ Project overview), 14.5 (Arc ↔ stat column),
15 (Assign ↔ Attendance), 20 (row 2 ↔ row 3). Content padding: 28 left (panel edge 377 → card 405), 33 right.
Card inner padding: 11–15 on stat and Project overview cards, 23 on Assign, 13 on Attendance.

Scale: `4, 8, 12, 16, 20, 24, 28, 32, 48`. Use **12** between sibling cards in a dense row, **16** for the
standard grid gap, **20** between grid rows, **28** for content-area side padding, **16** (dense) or **20**
(content) for card padding.

---

## 7. Type scale (Work Sans; capHeight 0.66 em, so size = cap height ÷ 0.66)

| Role | Size / weight | Measured on |
|---|---|---|
| Auth heading "Sign in to Flowbit" | 40–44 / 600 (est. 44 from the F cap, 41 from the ascender) | login-desktop-b |
| Auth logo wordmark | 60 / 600 equivalent (F cap 40 px) | login left panel |
| Onboarding heading | 24 / 600 | onboarding-a/b |
| Mobile auth heading | 24 / 600 | login-mobile-dark |
| Big calendar date "20" | 56 / 600 | My attendance |
| Arc wordmark "arc.ai" | 28 / 600 (est.) | Arc card |
| Stat number, ring legend % | 24 / 600 | Stat cards, Project overview |
| Greeting "Good morning, Gaurav" | 20 / 500, name in `--name` | Top of content |
| Card title (project name, option card title) | 18 / 600 | Project overview, onboarding step 2 |
| Workspace name | 17–18 / 600 | Side panel |
| Body / labels / table / chips / inputs / buttons | 14 / 400–500 | Everywhere |
| Primary button label | 16 / 500 (auth), 15 / 600 (onboarding) | Buttons |
| Section label (ASSIGN TO ME, PROJECT OVERVIEW, MY ATTENDANCE) | 14 / 600, uppercase, letter-spacing 0.04em (est.) | Cards |
| Stat label (IN PROGRESS), check-in label, month label (JULY 2026) | 13 / 600, uppercase, 0.04em | Stat cards, widget |
| Side panel section label (CREATE NEW PROJECT, TEAMS, TOOLS) | 12 / 600, uppercase, 0.06em (est.) | Side panel |
| Breadcrumb, date line, rail labels | 13–14 / 400 | Top bar, greeting, rail |
| Card subtitle | 13 / 400, `--text-2` | Assign, Attendance |
| Small pills (−12%, In progress, dropdown) | 12 / 500 | |
| "Selected" tab | 12 / 500 | Onboarding |
| Check-in timer "02H 53MIN" | 17 / 700, uppercase | Widget |

Line heights: 1.4 for body, 1.2 for headings and numerals. Figures in data (counts, %, dates): `font-variant-numeric: tabular-nums`.

---

## 8. Iconography

- Outline icons, **1.5 px stroke**, rounded caps and joins, at 24 px (rail), 18 px (top bar, search, Arc input
  plus), 14–16 px (list icons, table headers). The rail Home icon is a rounded pentagon house with a short door
  stroke, which matches Hugeicons "home-01" in the stroke-rounded style. Use Hugeicons stroke-rounded, or Lucide
  at 1.5 px if Hugeicons isn't available, and don't mix sets.
- **One exception: post types.** The post-type badges in Work → Posts (`components/work/posts/post-type-icon.tsx`)
  use Phosphor **duotone** icons, chosen on purpose so a post's kind (announcement, kudos, poll, event…) reads at a
  glance. Import them one file per icon from `@phosphor-icons/react/dist/ssr/*`, never the barrel. Don't use
  Phosphor anywhere else; every other icon stays Lucide outline at 1.5 px.
- Colours: white in the rail and top bar, `--icon-muted` (`#7A787A`) for side panel list icons, white for card
  header icons. Priority uses a three-bar signal icon tinted with the priority colour.
- Task rows begin with a 15 px **dashed circle** (status "to do"), white, 1.5 px dashes.
- Avatars: 20 px circles with a 1.5 px white ring, overlapping by about 6 px. The user avatar is a 32 px white
  circle with the initial in `#200C55` 12 / 600.

---

## 9. Logo

Assets in `public/brand/`, all with tight viewBoxes and no stray paths:

| File | Content | Status |
|---|---|---|
| `flowbit-mark.svg` | White burst: 10 rays plus the centre dot. viewBox `0 0 41.87 40.43` | Verified: IoU 0.95 against the Figma auth mark (the remainder is anti-aliasing) |
| `flowbit-logo-white.svg` | Mark + "Flowbit" wordmark, white. viewBox `0 0 171.31 40.43` | Verified against the brand kit lockup |
| `flowbit-mark-gradient.svg` | **Rebuilt.** Vector mark with the Figma app gradient (rays: radial `#4E3588`→`#C98ABA`; dot: `#ECDCEB`→`#C78DBA`→`#4F3C7E`) | Matches the shell and onboarding logos (`docs/design/logo-verification.png`) |
| `flowbit-logo-gradient.svg` | **Rebuilt.** Gradient mark + gradient wordmark (`#F4E6F0`→`#E6C6DE`→`#D0A8CA`→`#A47CAD`→`#654988`) | This is the logo for the app shell (top-left) and the onboarding card |
| `flowbit-logo-brandkit-dark.svg` | The old file: brand-kit dark lockup (white wordmark, gradient "o", raster-mesh rays) | Kept for reference. Not what the app shows. |
| `flowbit-mark-brandkit-mesh.svg` | The old file: mark clipped over the kit's raster mesh (JPEG) | Kept for reference |

The rays are vector paths from the brand-kit PDF. The kit's gradient is a raster mesh image, so it has no
exact stops; the stops above were sampled from the Figma app logo. Placement:
- **Shell**: gradient lockup at x 20, y 23, mark 36 px tall (wordmark cap 23 px). It sits above the rail in the
  68 px logo row.
- **Auth panel**: white lockup, mark 67 px tall, centred in the panel; the tagline sits 16 px below in
  16 / 400 white. The Figma sets the wordmark about 8% larger and closer than the kit lockup (gap 13.5 px
  against 22). Use the kit lockup.
- **Mobile hero**: white lockup, mark 49 px, centred at y 102–151.
- **Onboarding card**: gradient lockup at the card's top-left (inset 46, 25), mark 35 px.
- **App icon** (`checkin-*` captures): brand mesh tile, white mark **without** the centre dot, mark ≈ 55% of
  the tile. This is the favicon / PWA icon direction.

---

## 10. Ribbons

Glossy 3D bent tubes: an elbow, pink highlight to deep indigo shade, raster in Figma. Extracted at 2x from the
dark captures into `public/brand/ribbons/`, RGB on pure black, for `mix-blend-mode: screen` on dark pages.
Inside the glass card the Figma shows the ribbon blurred through the glass. Where the extraction had to reach
under the card, the glass tint (a fitted plane, `#1A1A1A`–`#232323`) was removed and the card's hairline painted
out, so those parts are pre-blurred.

| File | Size (design px) | Source rect (frame px) | Placement |
|---|---|---|---|
| `auth-elbow-top.png` | 203 × 175 | login-desktop-b x 1437–1640, y 0–175 | Top-right corner of the sign-in card. The vertical arm enters from the frame's top edge at x≈1440–1500 and runs down to the card corner (1521, 86); the horizontal arm exits right to x≈1625, y 105–160, tilted about −8°. The bend sits **behind** the card's top-right corner. |
| `auth-elbow-bottom.png` | 215 × 180 | login-desktop-b x 1430–1645, y 600–780 | Bottom-right corner of the card. One arm goes down off the frame bottom at x≈1435–1485; the other goes right and down to x≈1635, y 625–725, tilted about +28°. The bend sits behind the card corner (1521, 679). |
| `onboarding-left-outer.png` | 113 × 232 | onboarding-a x 372–485, y 348–580 | Left of the onboarding card. The upper arm (tilted about +8°) and lower arm (about −50°) meet behind the card's left edge at y≈400–560, where they show as a soft pink glow through the glass. Only the parts outside the card are clean; the card holds form content. |
| `onboarding-right-outer.png` | 61.5 × 215 | onboarding-a x 1243–1305, y 545–760 | Right of the card. The upper arm exits right (about −10°), the lower arm runs down and right to (1260, 740). The bend is behind the card around (1180–1240, 620–720). |

Building notes:
- Put the ribbon layer **under** the glass card. The card's `backdrop-filter: blur(24–40px)` produces the
  soft glow where it overlaps. For onboarding, either rotate the auth elbows into place (they're the same asset
  family) or add a blurred `radial-gradient(#E9A9DD, transparent)` glow behind the card edge where the bend would be.
- No blur on the parts outside the card (they're sharp in Figma). Rotation is baked in.
- **Motion:** a float of ±6 px translate and ±1.5° rotate over 14 s for one ribbon and 17 s for the other,
  phase-offset so they never move in sync.
- The light frames use the same ribbons on white. Not needed.

---

## 11. Screens

### 11.1 Desktop sign-in, dark (`login-desktop-b`)
Frame 1728 × 780, background `#000`.
- **Left panel** x 0–786, full height: brand mesh (§3.1), animated. White lockup centred: mark at
  241.5–310.5 × 331–398; wordmark 324–543. Tagline "Everything in flow. Nothing in the way" at y 414–432,
  centred under the lockup, 16 / 400 white.
- **Card** x 1013–1521, y 86.5–679 (508 × 593), radius 16, glass (§4) with a lit hairline (`#7C7C7C` on the
  left/bottom, `#5F5F5F` along the top).
  - Heading "Sign in to **Flowbit**", centred, y 141–178, 44 / 600. "Flowbit" uses a muted lavender gradient
    in Figma (`#977DAB` → `#6C5C93`). Use the wordmark gradient (§3.7) at reduced brightness so it stays
    legible (the Figma value is low contrast).
  - Subtitle "Use the email your team invited you with." y 192–205, 15 / 400 white, centred.
  - Content column x 1097–1443 (346 wide, 84 inset).
  - Label "Email Address" y 250, 14 / 500. Input y 271–313 (**42 tall**), pill, fill `#1D1D1D`, 1 px `#4A4A4A`.
  - "Password" label y 336 with "Forgot password?" right-aligned in `#CA81B8`. Input y 357–399.
  - Checkbox 21 × 21 at (1096, 418), radius 5 (est.), 1.5 px `#AFAFAF` stroke. Terms text 14 / 400 white in two
    lines at x 1127.
  - **Sign in →** y 468–522 (**54 tall**), full width, pill, gradient §3.2, label 16 / 500 white, arrow 16 px.
  - "Or continue with" y 554–564, 14 / 400, with 1 px `#5F5F5F` rules either side (x 1096–1195 and mirrored).
  - **Sign in with Google** y 590–633 (43 tall), fill `#212121`, multicolour 1 px stroke (§3.9), G logo 18 px,
    label 14 / 500.
- Ribbons: `auth-elbow-top`, `auth-elbow-bottom` (§10).

Light (`login-desktop-a`, reference only): same geometry, white right half, card `#FFFFFF` glass, heading
"Flowbit" `#8A1FC0`→`#4B1A9A`, links `#1C1A6C`.

### 11.2 Mobile sign-in, dark (`login-mobile-dark`)
393 wide, `#000`.
- Hero 393 × 280 brand mesh, lockup centred (mark 84–135 × 102–151), tagline y 160–178, 13 / 400 white.
- Heading centred y 318–341, 24 / 600. Subtitle y 352–364, 13–14 / 400.
- Inputs x 28–375 (347), **48 tall** (442–490, 540–588), black fill, 1 px `#A3A3A3`.
- Sign in y 669–723 (54), Google y 789–838 (49, fill `#212121`).
- Figma bugs not to copy: "Flowbit" in the heading is `#A425BD` (light-theme colour), "Forgot password?" and the
  terms links are `#1C1A6C` on black (illegible), and the checkbox is invisible. Use `#CA81B8` links and the
  desktop checkbox.

### 11.3 Onboarding step 1: Create your workspace (`onboarding-a`)
Backdrop §3.5. **Card** x 485–1243, y 84.5–805.5 (758 × 721), radius 16, glass (rgba white 0.10, blur 40).
Content inset 48 from the left.
- Gradient lockup at (531.5, 110), mark 35 px.
- Step bars at y 176–180: two bars, 57 × 4, radius 2, gap 10. Active: `linear-gradient(90deg, #E7D5E7, #8B6AAE)`.
  Inactive `#625F67`. On step 2 both are active.
- Heading "Create your workspace" y 220, 24 / 600. Subtitle "All your work — unified." y 252, 14 / 400.
- Labels 14 / 500 white with a red `*` (`#F64A45`).
- Inputs x 533–1028 (495), **40 tall** (323–363 and 409–449), pill, glass input fill (§4).
- "How many people will use this workspace?*" at y 470. Chips are 3 per row, **150 × 36**, gap 18.5, row gap
  20: x 536.5 / 705.5 / 874.5, y 506 and 562.5. Selected chip fill `#56397D`, no stroke. Others glass-grey with a
  1 px border. Labels 14 / 500 centred: Just myself, 2–10, 11–50, 51–200, 200–500, 500+.
- "Invite team members" 14 / 500 + "Optional — you can also do this later" 12 / 400 `--text-2`. Input x 534–859
  (38 tall) + **Add Member** button x 873–1026, 36 tall (est.), `#56397D`, 14 / 500.
- Footer y 717–764: "Skip for now" text button (14 / 500 white) at the left; **Continue** 186 × 46, gradient
  §3.2b, 15 / 600, right-aligned at x 1022.5.
- The vertical word **"workspace"** runs inside the card's right strip at x 1097–1210, y 118–771, rotated −90°
  (reading bottom to top), Work Sans 700 at ~120 px, `rgba(0,0,0,0.18)` on dark (light theme: `#BDBDBD`-ish).
  It sits behind the content and the ribbon glow passes over it.
- Ribbons: §10.

### 11.4 Onboarding step 2: Choose how you want to work (`onboarding-b`)
Same backdrop. Card x 485–1243, y 104–788.
- Logo, step bars (both active), heading "Choose how you want to work" y 270, 24 / 600. Two-line subtitle,
  16 / 400 (est.).
- **Option cards**: selected x 529–844, y 316–661. Unselected x 865.5–1175.5, y 318.5–658.5. Gap 21, radius 14,
  glass fill rgba white 0.32. Selected: 3 px gradient stroke (§3.10). Unselected: 1 px `#585558`.
  - **"Selected" tab**: 83 × 17 at x 743–826, y 298–315, sitting on the card's top edge at the right. `#5D4083`,
    top radius 8, 12 / 500 white.
  - Inner padding 22. Icon ≈26 px outline in pink `#FAB5E8` at the top. Title 18 / 600.
    Description 14 / 400 (two lines).
  - Feature list: 16 px violet `#5D4083` circle with a white check + 14 / 400 text, 27 px pitch.
  - Path line "Workspace → Projects → Tasks → Subtasks", 14 / 400.
  - **"Best for:" band**: a full-width bottom band 49 tall, `#5D4083`, 14 / 400 with the audience in 600.
- **Create Workspace** 195 × 47 at the right (x 981–1176, y 698–745), gradient §3.2b.
- Card copy is in `docs/SPEC.md` §3; keep it verbatim.

### 11.5 Dashboard (`dashboard-dark`), card by card
Frame 1728 × 1416. All coordinates are in frame px.

**Greeting** at x 406: "Good morning, **Gaurav**" y 101–120, 20 / 500 (name `#EBCBE2`). Date "Tuesday, July 14"
y 128–141, 14 / 400 white.

1. **Workday timeline** card x 405–1695, y 172–264.5 (1290 × 92), radius 16, glass 0.05, lit hairline (left edge
   `#CAC7CA`). Bar x 422.5–1676.5, y 198–240 (**1254 × 42**), radius 8. Track `rgba(255,255,255,.17)`
   (`#59535B`). Fill from the start to "now" (x 767 in Figma) with gradient §3.3. Labels 14 / 500 white,
   vertically centred in the bar: "10AM" just inside the left end (x 430), the now-time at the fill end, "04PM",
   "07PM" at their hour positions (1 h = 139.3 px over a 10AM–7PM day). **Half day** marker: a solid block
   101 × 42 at the half-day hour, `#5E4084`, radius 8, label 14 / 600 white centred. (Figma's "01AM" is a typo
   for 01PM.)
2. **Arc card** x 405–937.5, y 279.5–683.5 (532.5 × 404), radius 10, glass + bottom purple light (§4). "arc.ai"
   logo centred at y 340–360 (arc mark ~32 px + 28 / 600 wordmark, ".ai" in a blush gradient).
   **Suggestion chips** y 490–530, **132 × 40**, gap 25, x 443.5 / 600.5 / 757.5, fill `#171717`, 14 / 500
   `#F1F1F1`. **Ask input** x 432–915.5, y 561–641 (**484 × 80**), pill, gradient glass (§4), a 1 px
   `#B19CB9` top hairline and a 2–3 px blush lip `#F5DCF0` along the bottom. A 22 px plus-circle icon at x 452.
   Placeholder 14 / 400 `#C1B8C4` in two lines.
3. **Stat cards** ×3 at y 277–398.5 (**240 × 121**), x 952 / 1203.5 / 1455, gap 12, radius 8, transparent glass
   with a hairline (left `#C3BCC4`) and the corner wash (§3.8). Label at (963, 299) 13 / 600 uppercase. Count at
   (962, 321) 24 / 600. **Change pill** 41 × 20, full radius, filled with the accent, 12 / 500 white ("−12%"),
   at x+134, y 311. **Sparkline** 2 px in the accent with a glow, from the left edge to x+228, y 320–380, ending
   in an 8–10 px filled marker under the pill.
4. **Project overview** x 952–1695, y 410.5–684.5 (743 × 274), radius 14, glass 0.11, bright top hairline.
   - Header y 430: 16 px icon + "PROJECT OVERVIEW" 14 / 600 + **project dropdown** pill (x 1143–1267, 22 tall,
     `#171717`, 12 / 500, chevron). "View all projects" right-aligned 12 / 500 white.
   - Legend at x 967: 12 × 12 rounded-square key (radius 3) + label 14 / 400, value 24 / 600 below. Rows at
     y 472, 535, 598: Project done `#E68763` 50%, In progress `#6160FF` 25%, Blocked `#FAB5E8` 15%.
   - **Ring chart** centred at (1189, 563.5): three concentric rings. Outer r 85.5, 15 px stroke, `#E68763`.
     Middle r 59.5, 14 px, `#6160FF`. Inner r 36.5, 13 px, `#FAB5E8`. Tracks `#505050`, butt caps. Centre
     "61" 16 / 600 + "Tasks" 11 / 400.
   - Divider: 1 px `#6B676C` at x 1309, y 462–655.
   - Details at x 1328: title 18 / 600, description 12 / 400 (two lines). Then Status / Assignees / Timeline rows
     (16 px icon + 14 / 400 label) at y 540, 572, 607 with values right-aligned at x 1640: an "In progress" pill
     82 × 24 `#6160FF`, a four-avatar stack, "Aug 2, 2026" 14 / 400.
5. **Assign to me** x 405–1137, y 702–1077 (732 × 375), radius 12, opaque `--surface-table`, left hairline
   bright.
   - Header: list icon + "ASSIGN TO ME" 14 / 600 at (449, 721), subtitle 13 / 400 `#959596` at y 742.
     **Segmented control** at the right: track x 946–1128, y 718–751 (33 tall) `#171717`; active segment
     66 × 24 `#313131`. Labels 14 / 400 white: All task / Done / Due.
   - Table header row y 767–800 between 1 px `#535353` rules: icons + "Task Name", "Priority", "Due",
     "Assignee" 14 / 400 white at x 428/454, 787, 920, 1043.
   - Rows 32 px pitch from y 812: dashed status circle 15 px, task 14 / 400 white, priority (signal icon +
     label in the priority colour), due (`#FF2D31` for Today, otherwise `#979797`), three-avatar stack (20 px).
   - The empty area below stays empty. No zebra rows.
6. **My attendance** x 1152–1695, y 702–1077 (543 × 375), radius 10, opaque `#27272B` → `#252629`, no stroke.
   - Header: icon + "MY ATTENDANCE" 14 / 600 at (1187, 722), subtitle 13 / 400 `#939395`. Legend at the right
     (x 1480+): **12 px round keys** + 14 / 400 labels: On Time, Late, Absent.
   - **Segmented attendance bar** x 1164–1664, y 780–828 (**500 × 48**). Three full-radius pills touching:
     mint 1164–1426.5, amber 1427–1558.5, pink 1559–1664. Above each segment's right end is a 1 px tick in the
     segment colour (y 758–800) with its % label right-aligned to the tick, 14 / 600 in the segment colour,
     y 761–771. Make widths proportional to the data (the Figma widths aren't).
   - **Big date** "20" 56 / 600 centred at x≈1252, y 910–947, with "‹ JULY 2026 ›" below (13 / 600, chevrons
     12 px).
   - **Calendar** 7 columns × 5 rows. Weekday header 14 / 400 `#929394` at y 861. Day pills **34 × 22**, full
     radius, column pitch 49 (x 1350 + n·49), row pitch 35 (y 878 + n·35). Fill by status (mint/amber/pink);
     empty or weekend days `#171717` with `#575D6A` numerals. Numerals 13 / 500 (`#575D6A` on mint/amber, white
     on pink).

### 11.6 The shell (`dashboard-dark`)
- **Logo row** y 0–89: gradient lockup at (20, 23). A 1 px `#535353` rule at y 89 from x 97.5 to the right edge.
- **Rail** x 8–101 (**93 wide**), y 87–1368, gradient §3.6, radius 8–10 on the left corners. The right edge
  abuts the side panel's left hairline (x 101). It is not a floating pill.
  - Items centred on x 54.5: 24 px icon (glyph 21) with a 13–14 / 400 white label 6–8 px below. **70 px pitch**
    (icons at y 122, 191 (Arc tile), 284, 352, 422, 492, 562, 632, 702).
  - **Arc** item: a 48 × 48 blush tile `#F5E8F2` (radius 10) holding the gradient arc mark, label "Arc" below.
  - **Active**: a white tab 18 × 49 flush with the rail's left edge (x 8–26), radius 6 on its right corners,
    vertically centred on the item. The icon and label stay white. No other highlight.
  - 1 px `rgba(255,255,255,.35)` (`#9B7FA9`) dividers across the rail at y 763 (above HR, the product group) and
    y 1209 (above Invite/Setting).
  - Order: Home, Arc, Task, Spaces, Team, Project, Client, Meeting, Reports | HR (Muster), [Orbit, Folio] | Invite,
    Setting.
- **Side panel** x 102–376 (**274 wide**) between 1 px `#535353` hairlines, fill `#1A1A1A`.
  - Workspace row y 90–145: 32 × 32 avatar `#784082` (radius 6) at x 112, name 17–18 / 600 white, a faint
    chevron at the right (`#2E2E37`, almost invisible).
  - Section box starts at y 145 with a 1 px top rule and an 8 px top-right corner joining the x 376 line.
  - **Search** pill x 116–362, y 168–208 (**246 × 40**), 1 px `#535153`, transparent fill, 18 px icon `#AAA9AB`
    at x 129, placeholder "Search" 14 / 400 `#797779`.
  - Sections: label 12 / 600 uppercase at x 124 with a 14 px "+" at x 338 for CREATE NEW PROJECT and TEAMS.
    Items 14 / 400 white at x 147.5 with 14 px `#7A787A` icons at x 124, **26 px pitch**, 27 px from label to
    first item, about 23 px between sections. TOOLS has no "+".
  - A 1 px rule at y 501 separates the check-in area.
- **Check-in widget** (§11.7) at x 123.5–356, y 516–593. Below it, a pill button x 126–356, y 605–637
  (**230 × 32**): transparent fill, 1 px gradient stroke (left `#B888BD`/`#3B2E3E` → right `#4C454C`, bottom
  `#804E97`), icon + "Check in" 13 / 500 white centred.
- **Main panel**: a 1 px `#4D4D4D` outline starting at x 376, y 21, radius 10 on the top-left; it runs off the
  frame's right edge and closes at y 1367. Top bar y 21–89 (**68 tall**) with a 1 px rule at the bottom (shared
  with the logo row rule). Breadcrumb: 18 px home icon at (406, 46) + "Home" 13 / 400 white. User avatar 32 px
  white circle at x 1663–1695, y 41–72.5, initial `#200C55`. No bell in Figma. If notifications are needed, add a
  plain 18 px bell icon left of the avatar, with a numeric count only when non-zero and no dot.
- **Content**: starts x 405 (28 in from the panel), ends x 1695 (33 short of the frame edge). The greeting
  starts at y 101, the first card at y 172.

### 11.7 Check-in widget and its variant
`dashboard-dark` (working) and `extra-338_483` (on break). Reference rasters: `public/brand/checkin/widget-checked-in@2x.png`,
`public/brand/checkin/widget-on-break@2x.png`.
- Card **232.5 × 77**, radius 10, fill `#202020` (top) → `#171717` (lower), 1 px hairline (`#838283` at the
  top-left).
- "CHECK IN" 13 / 600 uppercase `#8D8D8D` at (140, 541.5). Timer "02H 53MIN" 17 / 700 white at (140, 556).
- **Glossy clock disc**: about 90 px diameter, centred near (310, 562). The card clips it on the right and
  bottom. Hands are white with rounded ends: the hour hand points to about 10 o'clock, the minute hand to 3,
  plus a small hub. Colour by state: **green** (checked in: `#86F9CE` highlight top-left, `#03B870` body,
  `#02591D` rim), **amber/orange** (on break), **grey** (checked out; not in Figma, so desaturate the green
  disc). A faint coloured light leaks onto the card's top edge above the disc. Build it as an image, or in CSS
  as a sphere: `radial-gradient(circle at 30% 25%, #CFFFE9 0 6%, #3CEEAF 22%, #03B870 55%, #027A3B 85%, #02591D 100%)`.
  The hands rotate to the real time (clock hands ease 400 ms).
- The button below cycles through Check in / Take break / Resume / Check out.

---

## 12. How internal pages borrow from the dashboard

Every internal page (Tasks, Spaces, Team, Project, Client, Meeting, Reports, HR, Orbit, Folio, Settings) sits
in the same shell (§11.6) and is built from the dashboard's parts. Nothing new should look new.

**Page header**
- Breadcrumb in the top bar (icon + trail, 13 / 400). In the content: a page title 20 / 500 at x 405, y 101,
  in the greeting's style. A one-line description 14 / 400 below it, white at 70%. Primary actions sit at the
  right on the same baseline: a gradient pill button (§3.2, 40 tall, 14 / 500) and secondary pills in
  `#171717` + 1 px `rgba(255,255,255,.18)`.
- An optional hero strip for overview pages, like the timeline card: a 92 px glass card holding the page's key
  progress as a **thick** 42 px bar or a row of 3–4 stat cards (§11.5.3).

**List pages and tables** (copy "Assign to me")
- Opaque `--surface-table` card, radius 12. Header: icon + UPPERCASE 14 / 600 title, 13 / 400 `--text-2`
  subtitle, segmented control at the right (`#171717` track, `#313131` active, 33 tall) for views and filters.
- Column header row 33 tall between 1 px `#535353` rules, with 14 px icons before the header labels.
- Rows **32 px** (dense) or 44 px (when rows carry two lines), no zebra, no row borders. Hover: background
  `rgba(255,255,255,.04)`. Selected: `rgba(255,255,255,.06)` + a 2 px left inset in white at 60%.
- Status at the row start: dashed circle (to do), half-filled (in progress), filled check (done), always as
  outline icons and never coloured dots. Priority as the signal-bar icon + coloured word. Dates in `#979797`,
  except "Today"/overdue in `#FF2D31`. People as 20 px avatar stacks.
- Search/filter bar: the side panel search pill style (40 tall, 1 px `#535153`, transparent).

**Detail pages** (copy "Project overview")
- A two-column glass card: metrics/visual on the left, facts on the right, divided by a 1 px `#6B676C` line.
  Facts are icon + label rows with right-aligned values (pill / avatars / date), 32–35 px pitch.
- Titles 18 / 600, descriptions 12–14 / 400. Tabs below use the segmented control.
- Activity and comments in an opaque card like "Assign to me", rows of avatar + text.

**Charts**
- Rings like Project overview (concentric, 13–15 px strokes, `#505050` tracks, butt caps).
- Stat cards with a glowing sparkline and a corner wash.
- Thick segmented bars like attendance: 48 px full-radius segments with tick + % labels above.
- Calendar heatmaps from the day pills (34 × 22, status-filled).
- Legends use the Figma's keys: 12 px rounded squares (rings) or 12 px circles (status sets). Nothing smaller,
  never inline in text.

**Forms and settings** (copy onboarding step 1 and the sign-in card)
- Inside the app: an opaque `#27272B` card (radius 12). Labels 14 / 500 above the field, required `*` in red.
- Inputs: **40 tall** pills, fill `rgba(255,255,255,.06)`, 1 px `rgba(255,255,255,.18)`. Focus: border to
  `rgba(255,255,255,.45)` + `0 0 0 3px rgba(187,98,165,.25)`. Placeholder `#797779`.
- Choice sets as chips (36 tall pills, selected `#56397D`) or as option cards (onboarding step 2: grey glass,
  a 3 px gradient stroke and a "Selected" tab when chosen).
- Buttons: primary gradient pill (40–46 tall), secondary `#56397D` solid pill ("Add Member"), tertiary text
  button ("Skip for now"). One primary per view.
- Settings: left column of section names in side-panel style (12 / 600 uppercase labels, 14 / 400 items at a
  26 px pitch), content cards on the right. Toggles 36 × 20, track `#313131`, on `#56397D`, knob white.

**Empty states**
- In the card where the content would be: the white mark (40 px, 20% opacity) or a relevant outline icon (32 px,
  `#7A787A`), one sentence 14 / 400 white saying what's missing, one line in `--text-2` saying what to do, and one
  pill button. No illustrations of people, no emoji.
- Keep the card's header and segmented control visible, so the page shape doesn't jump.

**Dialogs, menus, toasts**
- Dialogs: sign-in-card glass (rgba white 0.10, blur 24, radius 16, lit hairline) over a `rgba(0,0,0,.55)`
  scrim. Title 18 / 600, body 14 / 400, actions right-aligned.
- Menus and popovers: `#1F1F1F` with a 1 px `rgba(255,255,255,.12)` border, radius 10, 36 px items, 14 / 400.
- Toasts: same as menus, with a 16 px status icon (outline) and no coloured dot.

**Motion everywhere**
- Hover lift: `translateY(-1px)` and the hairline brightens by +0.1 alpha, 160 ms. Press: scale 0.98, 120 ms.
- Page enter: content fades up 8 px, 220 ms, children staggered 30 ms. Charts draw once on mount.
- Gradients drift as in §3. Under reduced motion: no drift, no lift, no draw-on.

---

## 13. Light theme (reference only, not built)
`dashboard-light`, `login-desktop-a`, `login-mobile-light`, `onboarding-c/d`: white page `#FEFEFE`, the same rail
gradient, white cards with soft grey hairlines, a lilac glow at the top (`#F9F7FA`), text `#000`, heading
"Flowbit" in a saturated purple gradient, links `#1C1A6C`, attendance mint replaced by green `#16B66F` (est.).
The light theme keeps the layout identical.

---

## 14. Not captured / open items
- **Logo direction frames** (`logo-17466…17473`): the captures show only the brand swatch, so the logo
  variants on that Figma page are unknown. The mark and wordmark were taken from the brand kit PDF and checked
  against the logos visible on the auth, dashboard and onboarding frames.
- **Moodboarding page**: not captured (per the brief).
- Hover, focus, pressed and empty states are not in the Figma. §12 defines them in keeping with the dashboard.
- The **checked-out (grey)** clock state is not in the Figma.
- Onboarding ribbons are only available outside the card (the in-card portion is under form content).
- Exact Figma effect values (blur radii, stroke gradient stops) can't be read from rasters. The glass numbers are
  solved from the visible result and marked (est.).
