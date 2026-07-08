# frontend-design.md — Visual & UI Design

Companion to `design.md` #7 (frontend notes). That file says _what screens exist_; this
file says _what they look like_. If a rule here conflicts with `business.md`, `business.md`
wins — this file only covers presentation, never money math or business logic.

---

## 1. Personality

This is a personal ledger, not a SaaS dashboard. The owner opens it once a month, fills it
in, and leaves. Design for that rhythm:

- **Pastel ice-cream, but still a ledger.** The look is soft and sweet — vanilla-cream
  surfaces, mint / blueberry / strawberry accents, rounded corners, soft-fill pills. The
  sweetness lives in _surfaces, fills, and shape_; the _numbers stay dark and crisp_ so the
  thing is still readable at a glance. Pastel is a mood, not an excuse for low-contrast text
  (#3 spells out which tone is decoration and which is ink, and every functional color here
  was contrast/CVD-validated — don't swap in a prettier pastel without re-checking).
- **Calm over exciting.** No color should raise the reader's pulse. `รอจ่าย` (to pay) is a
  plan, not a warning — it gets a neutral treatment, not amber/red alarm styling. (The
  ice-cream palette helps here: even the payable color is a soft berry, not a fire-alarm red.)
- **Numbers-forward.** Money is the content; chrome should recede. Every screen answers
  "how much, of what, has it happened yet" at a glance.
- **Thai-first, not Thai-retrofitted.** Group labels, person names, and item names are
  Thai/mixed UTF-8 (`docs/business.md`). Typography, line-height, and truncation rules are
  chosen for Thai script, not bolted on after an English-first build.
- **No invented features.** Don't add trends, sparklines, or cross-month charts — v1 is
  explicitly single-month (`business.md` #12). A month has no history to visualize.

## 2. Screen structure (from `design.md` #7)

```
┌─────────────────────────────────────────────────────────────┐
│  Month switcher (label, created date)      [New cycle ▾]    │
├─────────────────────────────────────────────────────────────┤
│  Dashboard strip: 4 stat tiles + 1 hero figure                │
│  จ่ายแล้ว · รอจ่าย · รับแล้ว · รอรับ         [ สุทธิเดือนนี้ ]  │
├───────────────────────────────┬───────────────────────────────┤
│  Expenses panel                │  Income panel                 │
│  (grouped rows, status pill)   │  (rows, status pill)          │
├───────────────────────────────┴───────────────────────────────┤
│  People (per-person ledger cards)                              │
│  [Person A  net +6,010 · รอรับ]  [Person B  …]  [+ Add person]│
└─────────────────────────────────────────────────────────────┘
Split modal and New-cycle modal float above this as overlays.
```

- Desktop-first (this is opened at a desk once a month), but panels stack vertically under
  ~768px: dashboard strip wraps to 2×2 + hero, Expenses/Income go full-width stacked, person
  cards go 1-column.
- The hero figure (`สุทธิเดือนนี้`) is visually distinct from the four stat tiles — bigger, own
  card, right-aligned or top-right of the strip — because it's the one number the owner
  actually came to check.

## 3. Color

Two different color jobs happen on this screen and must not be conflated:

1. **Binary status** (pending vs. done) — `expense_status`, `income_status`. This is not
   severity; there is no failure state. Treat "done" as the one accent, and "pending" as its
   absence, not as a warning color. (People have no binary status — they carry a signed running
   net, which is color job #2.)
2. **Signed net** (`ledger_entries` sum) — genuinely diverging: positive = receivable, negative
   = payable. Use a real diverging pair here, not good/bad framing (`business.md` #7 — a
   negative net is a normal payable, not an error).

The pastel look comes from a **two-tier** system per accent hue: a pale **fill/wash** tier
(backgrounds — pill fills, card tints, hover states — where low contrast is expected and
fine) and a deeper **ink** tier (text, net figures, the check mark — validated to clear
WCAG 4.5:1 on both the surface and its own pale fill). Never draw _text_ in a fill-tier
pastel; never fill a large area with an ink-tier color. That split is what keeps it soft
_and_ legible.

### Neutrals (the vanilla base)

| Role                 | Light                 | Dark                     | Used for                                                       |
| -------------------- | --------------------- | ------------------------ | -------------------------------------------------------------- |
| Page background      | `#fbf3ea`             | `#0d0c0b`                | app shell (warm cream / night)                                 |
| Card / panel surface | `#fffaf5`             | `#1c1a18`                | stat tiles, panels, person cards, modals                       |
| Primary ink          | `#2b2622`             | `#f7f2ea`                | names, amounts (near-black cocoa, not pure black)              |
| Secondary ink        | `#6b6058`             | `#c3bab0`                | group labels, helper text                                      |
| Muted ink            | `#9a8f84`             | `#8b8178`                | placeholders, disabled, reference figures (`amount`/`minimum`) |
| Hairline border      | `rgba(43,38,34,0.10)` | `rgba(247,242,234,0.10)` | card borders, row dividers                                     |

### Accents (ice-cream scoops) — ink / fill tiers

| Role                                        | Light ink                   | Light fill | Dark ink                    | Dark fill | Used for                                |
| ------------------------------------------- | --------------------------- | ---------- | --------------------------- | --------- | --------------------------------------- |
| **Done** (paid / received / settled) — mint | `#137a51`                   | `#dff5ea`  | `#5fd6a3`                   | `#173a2e` | done status pill, checkbox check        |
| **Receivable** (net > 0) — blueberry        | `#345fb8`                   | `#e2ebfb`  | `#8fb3f3`                   | `#1e2b45` | net figure, receivable pill             |
| **Payable** (net < 0) — strawberry          | `#b23a5b`                   | `#fbe4ea`  | `#f3a0b6`                   | `#42212b` | net figure, payable pill                |
| **Interactive** — grape (optional)          | `#6a5acb`                   | `#ece8fb`  | `#a99bf5`                   | `#2a2540` | primary buttons, focus ring, active tab |
| **Pending** (no scoop)                      | secondary ink, outline only | —          | secondary ink, outline only | —         | pending status pill                     |
| **Neutral net** (net = 0)                   | muted ink                   | —          | muted ink                   | —         | net figure when nothing to settle       |

Contrast (validated, see #3.1): every light ink ≥ 5.0:1 on the cream surface and ≥ 4.6:1 on
its own pale fill; every dark ink ≥ 6.9:1 on the night surface and on its fill. CVD: the
three status/net hues separate cleanly (worst adjacent ΔE 48 normal / 19 tritan) so a
red-green or blue-yellow colorblind owner still tells receivable from payable.

Rules:

- Never use the receivable/payable colors for anything except signed net. They are not a
  general-purpose "success/error" pair — a payable is not an error.
- "Done" is a single mint, not a status ramp — there is no warning/critical tier in this
  domain (#1). Don't invent an amber or red alarm state.
- Status is never color-alone: pair the pill with its Thai label (`จ่ายแล้ว`, `รอจ่าย`, …)
  every time. Never a bare colored dot — pastels are especially weak as color-only signals.
- Grape/interactive is chrome, not data: it may never stand in for a status or a net sign.
- These are the app's canonical hues. If a future view ever needs a chart, build its
  categorical/sequential ramp from _these same scoops_ (mint, blueberry, strawberry, grape
  as slots 1–4) rather than importing a different palette — and re-run the validator against
  the cream/night surfaces, which are not the palette's built-in defaults.

### 3.1 Validation (already run — keep it true on any change)

The functional hues above were checked with the dataviz skill's validator
(`scripts/validate_palette.js`) against **light surface `#fffaf5`** and **night surface
`#1c1a18`**, plus a WCAG pass for every ink-on-fill pill combination. If you retune any
accent, re-run before shipping:

```bash
# categorical CVD + band + contrast, against THIS app's surfaces
node scripts/validate_palette.js "#137a51,#345fb8,#b23a5b,#6a5acb" --surface "#fffaf5" --mode light
node scripts/validate_palette.js "#5fd6a3,#8fb3f3,#f3a0b6,#a99bf5" --surface "#1c1a18" --mode dark
```

A pastel that fails the band/contrast check is decoration, not a functional color — either
deepen the ink tier until it passes or keep the pretty tone for a fill-only role.

## 4. Typography

- **Font:** `IBM Plex Sans Thai`, loaded via `next/font/google`, as the sole UI face for Thai
  _and_ Latin _and_ digits. It ships matching weights across all three scripts, which the
  default Geist scaffold does not (Geist has no Thai glyphs — swap it out, don't layer a
  fallback font in and hope the browser picks well). Fall back to `"Noto Sans Thai", system-ui,
sans-serif`. It reads clean and legible — the ice-cream softness comes from the color and
  the rounded shapes (#5), not from a novelty face; do **not** reach for a bubbly display font
  for body text or numbers (money must stay unambiguous). _Optional:_ a single rounded display
  face — `Mali` or `Fredoka` (both cover Thai + Latin on Google Fonts) — may be used **only**
  for the hero figure's label and section headings if more sweetness is wanted; never for
  amounts, table rows, or ledger entries.
- **Line-height:** `1.7` for any Thai body text (names, labels), not the `1.5` that reads fine
  for Latin-only UI. Thai vowel/tone marks sit above and below the consonant line and clip
  under tighter leading.
- **No letter-spacing tricks and no uppercase transforms.** Thai has no case, and tracking
  adjustments break vowel-mark positioning. If a Latin label wants emphasis, use weight, not
  spacing or caps.
- **Never truncate Thai text at a fixed character count.** Truncate by measured width
  (`text-overflow: ellipsis` on a constrained container), never `slice(0, N)` — Thai
  characters are not fixed-width and a mixed Thai/English name will clip mid-glyph otherwise.
- **Figures:**
  - Hero figure (`สุทธิเดือนนี้`) and stat-tile values: proportional figures, semibold, ≥28px
    (hero ≥40px). These are read once, not scanned column-wise, so default proportional digits
    look better than tabular.
  - Ledger entry amounts, expense/income table columns, and anything in a vertically-stacked
    list of numbers: `font-variant-numeric: tabular-nums`, so digits align.
  - Always format via the edge formatter in `design.md` #2 —
    `฿${(satang/100).toLocaleString('th-TH', {minimumFractionDigits: 2})}` — never hand-roll
    division or rounding in a component.

## 5. Spacing, radius, elevation

- Base spacing unit: `4px`. Card padding `16px`/`24px`; row padding `12px` vertical.
- Radius: **rounder than default — the corners carry the ice-cream feel.** `20px` on
  cards/modals, `12px` on inputs, and pills/status chips are **fully rounded** (`999px`).
  Keep it consistent — don't mix radii between the stat tiles and the person cards. Round is
  the theme; a sharp corner reads as a different app.
- Elevation is the hairline border from #3 (light `rgba(43,38,34,.10)` / dark
  `rgba(247,242,234,.10)`), not a drop shadow, for cards on the page plane — the cream/surface
  contrast already separates them. Reserve a soft shadow for the two modals (split,
  new-cycle) so they read as temporarily above the page: keep it _soft and low_ (a wide,
  diffuse, low-opacity shadow), never a hard drop shadow — hard shadows fight the pastel calm.
- Modal overlay: the page-plane cream at ~55% opacity (a warm haze), never a pure-black
  scrim — black fights both the pastel mood and dark mode.

## 6. Components

**Stat tile** (จ่ายแล้ว / รอจ่าย / รับแล้ว / รอรับ): label in sentence case (no trailing
colon) + value. No delta, no trend line — there's nothing to compare against within a month
(#1). Four tiles in a row, equal width.

**Hero figure** (สุทธิเดือนนี้): one per screen. Own card, larger type, no icon needed — its
position and size already say "this is the answer."

**Status pill:** fully rounded (#5), two states only, per enum. Pending = ghost/outline
using secondary ink on a transparent (or faintest neutral) fill; done = **soft-fill** — the
pale mint fill (`#dff5ea` light / `#173a2e` dark) with the mint _ink_ text and a small check,
not a saturated block with white text. Soft-fill is the ice-cream idiom and it keeps text
contrast (#3.1); avoid a hard green pill. Tapping/clicking the pill toggles it directly —
don't hide status behind a separate edit form, since checking things off through the month
(`business.md` #2) is the primary interaction.

**Expense / income row:** group tag (Expenses only) as a small muted label, name, `amount`
and `minimum` shown small/muted as reference, `custom` shown prominent (tabular-nums) since
it's the only figure that's real money (`business.md` #5), status pill, row actions
(split, delete) revealed on hover/focus rather than always-on icons cluttering the row.

**Person card:** (in the global People section — `business.md` D6) name, the **running net**
figure colored per #3 (blueberry receivable / strawberry payable ink / muted zero) with its Thai
direction word next to it (e.g. "net +฿6,010 · รอรับ"), then a compact list of **charges**
(`label`, signed amount, tabular-nums), each with inline edit/delete, plus "+ add charge", and a
**"เคลียร์ / settle"** action that opens the settle modal. There is no pending/settled pill — a
person is squared up exactly when their net is 0. Split-generated charges need no visual
distinction from manual ones (independent snapshots per D1) — don't add a "from split" badge
that implies a live link back to the expense.

**Settle modal:** records money actually changing hands with a person — an `amount` (default =
their full current net) and which **month** the cash event lands in (default: the month being
viewed). Positive = they paid you (→ that month's รับแล้ว); negative = you paid them (→ จ่ายแล้ว).
Show the resulting running net (usually 0) so it's clear the tab is cleared. This is the only
People action that moves a month's dashboard (`business.md` #9, D6).

**Split modal:** two tabs, Even / Manual. Even mode: checklist of people (+ "include me"
toggle) with a live per-share preview computed the same way the backend rounds (floor per
share, owner absorbs remainder — show the owner's absorbed remainder explicitly so the
rounding isn't invisible). Manual mode: one amount field per participant, running total vs.
`custom` shown live, and if entered shares exceed `custom` surface that plainly (e.g. the
owner's implied share flips to the payable strawberry ink) rather than blocking submission —
`business.md` #8 allows it, it just shouldn't be a silent surprise.

**New-cycle (clone) modal:** two checklists (expenses, direct incomes) to carry forward and a
label field for the new month. No note about people is needed — people are global and live in
their own section (`business.md` D6), so clone never touches them; the People section looks the
same before and after opening a new cycle.

## 7. States

- **Empty month:** each panel gets a one-line prompt + add action, not a blank void — "No
  expenses yet · + Add expense".
- **Loading:** skeleton rows matching the row height of the real content, not a full-page
  spinner — writes return the full month (`design.md` #5), so only the very first load needs
  a skeleton at all.
- **Error:** surface the envelope's `error.message` in a small inline banner near the action
  that failed (e.g. above the split modal's submit button), never a raw driver/HTTP error,
  per the backend's own rule (`CLAUDE.md` — don't leak driver errors, and don't leak them to
  the UI either).

## 8. Dark mode

`prefers-color-scheme: dark` (already scaffolded in `tallo_app/app/globals.css`) drives it —
no separate toggle needed for this tool. Swap tokens per #3's Dark column; nothing
else changes shape. Dark mode is a **reinterpretation, not a flip**: there are no pastels in
the dark, so the night theme is warm charcoal surfaces (`#1c1a18`) with the same three scoops
stepped _brighter_ (mint/blueberry/strawberry as light ink on dark tint fills) — soft-serve
under a night light, not neon. Validate any new color pair against the night surface
(`#1c1a18`) before shipping it, the same way the accents above were validated (#3.1).

## 9. Multi-user, linking & disputes

New in this version (`business.md` §13, D7). Presentation only — the money rules, per-viewer
signs, and privacy live in `business.md`/`design.md`; keep everything here on-brand: same
ice-cream palette (#3), Thai-first labels (#4), calm over alarm (#1).

**Login & signup.** A single centered card on the cream page plane (`#fbf3ea` / night `#0d0c0b`),
same `20px` radius and hairline border as every other card (#5) — this is still the ledger, not a
marketing page. Email + password in `12px`-radius inputs (#5), a grape primary button (`#6a5acb`
/ dark `#a99bf5` — the only interactive accent, #3) for "เข้าสู่ระบบ / Log in", and a quiet text
link to switch to "สมัคร / Sign up". Wrong-password / email-taken errors use the same inline
banner as everywhere else (#7), never a red alarm block. No social-login buttons in v1 (email +
password only — `design.md` §10).

**Invite / link action on a person card.** Add a quiet "เชื่อมบัญชี / Link" action to the person
card (#6), sitting with the card's other row actions (revealed on hover/focus, not a permanent
loud button — chrome recedes, #1). It opens a small modal: one email field + "ส่งคำเชิญ / Send
invite", styled like the settle/split modals (soft low shadow, warm-cream haze overlay — #5).
Nothing on the ledger changes until the other side accepts.

**"Linked" indicator.** A linked person carries a small calm badge beside the name — a grape
(chrome/interactive) pill reading "เชื่อมแล้ว / linked". Keep the data hues reserved: mint,
blueberry, strawberry stay for done / receivable / payable only (#3), so a link badge must never
borrow them. Not color-alone — pair the pill with its Thai word (#3). A person with an unanswered
outgoing invite reads instead as a ghost/outline "รอตอบรับ / pending" pill (same idiom as the
pending status pill, #6), so "invited" is distinguishable from "linked" at a glance.

**Dispute affordance.** Each linked charge / settlement row gets a quiet "โต้แย้ง / dispute"
action in its inline row actions (#6). A disputed item stays visible but reads as **parked**: dim
it to muted ink and tag it "กำลังโต้แย้ง / disputed" so it is obviously excluded from the running
net and month totals (`business.md` §13) — do not remove it from view, and make it visible that
its amount is not counting toward the net while disputed. Resolving returns it to normal ink. Keep
it calm — a dispute is a disagreement to reconcile, not a failure, so no red/amber alarm (#1).

**Pending-link & dispute markers.** The owner needs to notice incoming invites and new disputes
without a push/notifications engine (v1 has none — `business.md` #12). Use small, quiet **in-app**
markers only: a count badge on an "คำเชิญ / invites" affordance in the header for pending link
requests addressed to you (accept / decline inline), and a subtle marker on any person card that
holds a disputed item. Grape / neutral chrome only — these are prompts, not alarms, and must never
borrow the mint/berry data colors (#3).
