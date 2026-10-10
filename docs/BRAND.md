# Focus Realm Workspace — brand rules

The Workspace wears the **blue-and-white Focus Realm brand**, taken from the FR
monogram: a sky-blue **F** interlocked with a royal-blue **R**. Every screen —
including Mission Control — follows these rules. They are enforced by the
design tokens in `src/app/globals.css`; this page explains them.

## 1. Colour

**Only tokens. Never a hex value in a component.** Components use the Tailwind
utilities generated from the tokens (`bg-surface`, `text-fg-muted`,
`border-line`, `bg-brand`, `text-danger`, `bg-brand-500` …) or, inside SVG,
`var(--brand)`, `var(--color-brand-400)`, `var(--danger)` and so on. That is
what keeps light and dark mode in lockstep.

| Role | Tokens | Use |
|---|---|---|
| **Brand blue** | `brand-50 … brand-950`, `--brand`, `--brand-hover`, `--brand-soft`, `--brand-soft-fg` | The one accent. Actions, focus, active state, progress, charts, highlights. Sky (`brand-300/400`) is the F, royal (`brand-600/700`) is the R. |
| **White & neutrals** | `--bg`, `--surface`, `--surface-2`, `--surface-sunken`, `--surface-hover`, `--line`, `--line-strong`, `--fg`, `--fg-muted`, `--fg-subtle` | Everything else. White surfaces on a cool off-white canvas (light); deep navy surfaces (dark). |
| **Status** | `--success`, `--warning`, `--danger`, `--info` (+ `-soft`) | Meaning only, never decoration: success = done / on time, warning = due soon, danger = overdue / blocked, info = in review / waiting on an update. |
| **Utility** | `--scrim` (behind dialogs), `--shadow-xs … --shadow-lg`, `--shadow-brand`, `--shadow-press`, `--glow`, `brand-ink` (the deep navy of always-blue hero panels), `canvas-light` / `canvas-dark` (fixed swatches for theme previews only) | Depth and atmosphere. |

Not part of the brand: cyan, teal, violet, purple, pink, gold, and pure black.

Documented exceptions — the only places a literal colour may appear:

- **Data colours**: the department palette (categorical, in
  `components/ui/badge.tsx`) and avatar hues (a person's chosen colour, used
  only on their avatar).
- **The logo itself** (`components/brand/logo.tsx`, `src/app/icon.svg`,
  `public/brand/`).
- **Values that leave CSS**: `<meta name="theme-color">` in the root layout,
  which must mirror `--bg`.
- **`app/global-error.tsx`**, which renders when the app's styles may be
  unavailable and so carries its own.

Gradients are brand-only: `bg-brand-gradient` (brand-500 → brand-600 →
brand-800) for hero moments and primary calls to action, and
`text-gradient-brand` for a single highlighted word or number.

## 2. Light and dark

Light (white and blue) is the default. Dark (navy and blue) is the same design
with the tokens swapped. **No surface is "always dark"** — a screen that ignores
the theme is off-brand. Test every screen in both.

## 3. Logo

Use `<BrandMark />` (`components/brand/logo.tsx`) — `color` on light
surfaces, `inverse` on brand blue, `tile` where it needs a frame. Never redraw,
recolour, stretch or rotate the monogram.

## 4. Type

- **Geist Sans** for all text and all numbers (with `tabular` for figures that
  update).
- Headings: semibold, tight tracking (`tracking-[-0.02em]` to `-0.03em`).
- Labels / eyebrows: 11–12px, semibold, uppercase, `tracking-[0.14em]`, in
  `text-fg-subtle` or `text-brand`.
- **Geist Mono** only for identifiers and machine values: `T-128`, `FR-0042`,
  clock readouts, log timestamps. Never for prose or labels.

## 5. Shape and depth

- Cards: `rounded-2xl border border-line bg-surface shadow-sm` (use `Card`).
- Inner tiles: `rounded-xl`; controls: `rounded-[10px]`; pills: `rounded-full`.
- Icon tiles: `bg-brand-soft text-brand-soft-fg`, `rounded-[10px]`.
- Elevation from `shadow-xs … shadow-lg` and `shadow-brand` for the primary
  action. A thin brand gradient bar (`from-brand-400 via-brand-600
  to-brand-800`) marks something featured.
- Backgrounds: `bg-grid` and `var(--glow)` for atmosphere. No CRT scanlines,
  HUD brackets or neon glows.

## 6. Motion

- Easing `cubic-bezier(0.16, 1, 0.3, 1)` (out-expo); 150–300 ms for UI,
  up to ~1.2 s for data reveals (charts drawing, numbers counting up).
- Animate `transform` and `opacity` only; continuous loops in CSS.
- Motion explains state (arrival, change, urgency) — it never decorates for its
  own sake, and everything respects `prefers-reduced-motion`.
- **Live screens** (Mission Control) may carry slow ambient loops that say
  "this is live": the radar sweep, rings turning, pings, the ticking clocks.
  They stay in brand blue, run in CSS on `transform`/`opacity`, pause while
  the radar is pointed at or focused, and stop entirely under reduced motion
  (numbers then appear at their final value, charts appear already drawn).
- Urgency is the only thing that pulses: an overdue person or the overdue
  count. Nothing pulses when everything is on track.

## 7. Voice

Plain, warm and exact. Name things by what they are — "Overdue", "Waiting on
updates", "Due tomorrow, 10:00 AM" — not jargon ("anomalies", "comms", "SLA
breach"). A countdown may read `T– 02:13:45` because it is unambiguous. Brand
names: **Focus Realm**, **Focus Realm Workspace**, and **Mission Control** for
the founders' live dashboard.
