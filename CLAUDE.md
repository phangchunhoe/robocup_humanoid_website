# CLAUDE.md

Guidance for working on this repo's UI.

This project uses an **Apple-style design language in dark mode**. It is a
custom, token-driven system — there is no UI component library. All new UI is
built from the tokens defined in
[`src/styles/tokens.css`](src/styles/tokens.css) and composed into components
that live with the page or in `src/components/`.

> Supersedes an earlier direction that used IBM's Carbon Design System
> (`@carbon/react`, g10 light theme, IBM Plex). That is fully removed from
> the codebase. Do not reintroduce Carbon components, Carbon tokens, or IBM
> Plex — if you find leftovers, replace them with the tokens below.

## Core discipline

**Define tokens once, reuse everywhere.** Every color, space, duration, and
easing comes from a custom property in `tokens.css`. New CSS must not contain
raw hex colors, arbitrary pixel spacing, or hand-picked cubic-beziers. If
something genuinely needs a value the token set doesn't cover, add a token
rather than a one-off.

Narrow carve-outs, because these aren't spacing and tokenizing them adds noise:
1px hairline borders, 1–2px focus-ring widths and offsets, sub-pixel-ish
transform nudges, and container dimensions (a page `max-width`, a media-query
breakpoint, a minimum editor height). Everything that positions or separates
content — margin, padding, gap — uses the spacing scale, no exceptions.

Tokens are declared on `:root` so they're available everywhere, but the dark
canvas itself (`background`/`color`) is applied only on the page container
(e.g. `.robot-simulator-page`), not on `body`. Other pages in this app still
have their own older styling; a global body takeover would break them. Scope
the canvas per page as those pages are migrated.

## Typography

**One family, no exceptions:**

```css
--font-sans: -apple-system, "SF Pro Display", "SF Pro Text", system-ui, sans-serif;
--font-mono: "SF Mono", ui-monospace, monospace;
```

- Do not add a second display font. Hierarchy comes from **weight and size**,
  never from mixing families.
- `--font-mono` is reserved strictly for file paths and technical values
  (`brain_tree.cpp`, `include/brain_tree.h`, a port name, a coordinate
  readout). Never for headings, buttons, nav, or prose.
- **Large headline type uses tight/negative letter-spacing**, like Apple's
  product page headlines. The type tokens below bake this in — bigger sizes
  get progressively tighter tracking. Body-size text stays at normal tracking.
- Note on platform: `-apple-system` and SF Pro only resolve on Apple devices.
  Elsewhere the stack falls through to `system-ui` (Segoe UI on Windows, Roboto
  on Android). This is intentional — it is a *system* font stack, so it is
  correct to look native on each platform. Do not "fix" this by loading a web
  font.

Type scale tokens: `--text-headline`, `--text-title`, `--text-body`,
`--text-callout`, `--text-caption`, each with a matching `-tracking` and
`-weight` token.

## Color

Semantic, role-named tokens only — never hardcoded hex in page CSS, and never
a raw color name that describes appearance instead of purpose.

| Token | Role |
|---|---|
| `--color-background` | Near-black page canvas |
| `--color-elevated-background` | Raised surface (panels, popovers) sitting on the canvas |
| `--color-label` | Off-white primary text |
| `--color-secondary-label` | Muted gray secondary text |
| `--color-tertiary-label` | Faintest text — hints, placeholders |
| `--color-separator` | Hairline dividers and borders |
| `--color-accent` | The single accent — links, primary buttons, active states |
| `--color-accent-hover` | Accent hover/pressed state |
| `--color-success` | Success/found status only |
| `--color-error` | Error/missing status only |

**One accent color.** Every interactive element — links, primary buttons,
active segmented-control segments, focus rings — uses `--color-accent`. Do not
introduce a second accent. `--color-success` and `--color-error` are *status
semantics*, not accents; never use them for interactive chrome.

## Surfaces, shadows, gradients

- **No decorative gradients.** Anywhere.
- **No shadows on UI chrome** — not on panels, cards, buttons, inputs, or
  popovers. Separate surfaces with `--color-elevated-background` and
  `--color-separator` hairlines instead.
- The **only** permitted shadow is a single soft drop-shadow beneath
  hero/product-style *imagery* sitting on a surface, via `--shadow-hero`.
  Nothing else may use it.

## Layout and spacing

- **8pt grid, with 4pt subdivisions** for fine adjustment. Spacing tokens are
  `--space-1` (4px) through `--space-16` (128px); everything divisible by 8
  except the deliberate 4pt steps. No arbitrary pixel values.
- **44px minimum tap target** for every interactive element (buttons, tabs,
  segmented control segments, icon buttons). Use `--tap-target-min`. If a
  control looks smaller than 44px, pad it out or give it a transparent hit
  area — visual size and hit size are allowed to differ.
- **Generous whitespace.** Prefer too much over too little. Sections breathe.
- **Full-bleed sections; one clear idea per section.** Avoid dense multi-panel
  layouts. A section should do one thing and be legible at a glance.

## Components

There is no component library. Build from tokens, following Apple's patterns:

- **Segmented control** — pill-shaped track, single accent-colored active
  segment. This is the pattern for switching views (e.g. Open Folder / Paste
  Source), *not* a tab bar with underlines.
- **Buttons** — pill-shaped. Exactly two variants: **primary** (filled
  `--color-accent`) and **secondary** (plain/ghost text or hairline outline).
  No tertiary, no danger variant.
- **Status indicators** — minimal. A small dot or checkmark plus a short text
  label, in `--color-success` / `--color-error` / `--color-secondary-label`.
  No badge or tag chrome: no filled pill backgrounds, no borders, no uppercase
  micro-labels.
- Anything reused across pages goes in `src/components/`. Page-specific
  components can live alongside the page.

## Motion

Restrained and physical. Motion should feel unhurried and inevitable, never
attention-seeking.

- **Ease-out on entrance** (`--ease-out`). No bounce or spring unless
  *very* subtle.
- **Entrance**: fade plus slight upward movement (~8–12px). The initial page
  load may be slightly deliberate/cinematic — Apple's motion is slower than
  utility-UI motion, so `--duration-slow` (~600ms) is appropriate here, staggered
  across a few elements.
- **Tab/segment switches**: smooth cross-fade (`--duration-base`).
- **Hover/press feedback**: quick (`--duration-fast`), so controls stay responsive.
- **No scroll-triggered animation** on single-screen views. Entrance runs once,
  on load.
- Always honor `prefers-reduced-motion: reduce` by disabling animation.

Duration tokens: `--duration-fast` (150ms), `--duration-base` (300ms),
`--duration-slow` (600ms). Easing: `--ease-out`, `--ease-in-out`.

## File conventions

- `src/styles/tokens.css` — the single source of truth for the design system.
  Imported once in `src/main.jsx`. Add new tokens here, never redefine them
  per page.
- Page-level CSS stays colocated with its page as `<PageName>.css`.
- Shared components go in `src/components/`.
- Plain CSS is preferred. Only introduce Sass for a file that genuinely needs
  it; the token layer removes most reasons to.

## Migration status

**Migrated.** The entire `#/robot-simulator` landing route is on the token
set — hero, progress bar, role selector, source panel, *and* the parse
diagnostics panel. It contains no Carbon, no IBM Plex, and no hardcoded hex
or spacing values. Use it as the reference implementation.

Components built for it and available for reuse (`src/components/`):
`SegmentedControl`, `SelectableCard`, `StatusIndicator`, `Notice`,
`ProgressBar`, `InfoHint`.

**Not yet migrated**, still on legacy bespoke styling:

- The robot simulator's **simulate step** (field, console, physics sliders) —
  its legacy custom properties are confined to a clearly marked block at the
  bottom of `RobotSimulator.css`, pinned to dark values so it stays coherent
  on the dark canvas. Nothing on the landing route depends on that block.
- The shared **site header** (`src/components/Header.css`) and
  **improvement modal**.
- The two **field explorers** (`FreekickExplorer`, `GoalieExplorer`). They are
  visually the same page apart from the roles and overlays they draw, so their
  common layout, palette, and console chrome lives in one place —
  `src/pages/explorer-shared.css`, on a shared `.explorer-page` class. Each
  page keeps only its own rules and imports the shared sheet *first*, so
  page-specific rules win on equal specificity. Both classes stay on the root
  element: `className="explorer-page freekick-explorer-page"`. When these get
  their token pass, migrate the shared sheet once rather than twice.
- All other pages (`Home`, `CategoryPage`, `BezierAnatomy`, …).

Don't treat those as precedent — migrate toward the tokens above, don't copy
what's there.

A note on what "legacy" means here: it marks styling that is *off-system*, not
dead. It is all live and rendering. Dead code — rules whose selector can never
match, custom properties nothing reads — should just be deleted; the
`[data-theme]` blocks that once shadowed every page palette were exactly that,
since nothing ever set the attribute.
