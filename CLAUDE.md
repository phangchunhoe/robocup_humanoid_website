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

The palette is **neutral charcoal carrying one warm accent**. The grounds are
desaturated cool charcoals whose only job is to separate by *value*; every
warm, saturated color on the page is interactive, and there is exactly one of
them. Nothing decorative competes with it.

| Token | Value | Role |
|---|---|---|
| `--color-background` | `#0b0f14` | Near-black cool charcoal page canvas |
| `--color-elevated-background` | `#161b22` | Panel/card surface. Must read as clearly **raised** above the canvas — this is the first elevation level |
| `--color-elevated-background-hover` | `#1a2029` | The second elevation level: the raised surface hovered, or a surface sitting on another surface |
| `--color-separator` | `#2a3038` | Hairline borders and dividers. An opaque charcoal, not a translucent white — it reads the same on either ground |
| `--color-accent` | `#e8a87c` | Peach — the single interactive color: links, primary buttons, active segments, focus rings |
| `--color-accent-hover` | `#c67b54` | Terracotta — the accent's hover/pressed state. Same flavor, one step deeper |
| `--color-on-accent` | `#0b0f14` | Charcoal ink for text/glyphs sitting *on* an accent fill. Clears 4.5:1 on both peach and terracotta, so hover is a background change only |
| `--color-label` | `#f0ede9` | Warm off-white primary text |
| `--color-secondary-label` | `#9ba3af` | Muted gray secondary text |
| `--color-tertiary-label` | `#7d8590` | Faintest text — hints, placeholders |
| `--color-success` | `#7fbf8c` | Muted green. Success/found status only |
| `--color-error` | `#d9776f` | Warm-toned red. Error/missing status only |

**Separation is by value, saturation is by role.** Canvas, panel, and hover
surface are three distinct steps up the same neutral ramp — a panel must be
visibly lighter than the canvas it sits on, so never flatten those steps or
paint a panel with the canvas token. Conversely, saturation means *this is
interactive*: if a color is warm and saturated, it is the accent, and if it is
the accent, it responds to a pointer. Neutrals never carry meaning; the accent
never decorates.

**Contrast is checked against `--color-elevated-background`,** not the canvas.
The panel is the lighter of the two grounds, so anything legible there is
legible on the canvas too. Add a token that renders on a panel, check it there
first.

**One accent color.** Every interactive element — links, primary buttons,
active segmented-control segments, focus rings — uses `--color-accent`, with
`--color-accent-hover` for its hover/pressed state. Those two are one accent
in two states, not two accents; do not introduce a second accent flavor for
interactive chrome. `--color-success` and `--color-error` are *status
semantics*, not accents; never use them for interactive chrome. They are
deliberately muted so they read as annotation next to the accent, not as
rival accents.

## Surfaces, shadows, gradients

- **No decorative gradients.** Anywhere. The one exception is a **legibility
  scrim**, and it is not decoration: a single-hue fade from
  `--color-background` to transparent, laid over imagery so text stays
  readable where the two meet. It introduces no color of its own — only the
  canvas at varying alpha. If a gradient is doing anything other than keeping
  text legible, it does not belong.
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
- **Symmetric padding.** Top matches bottom, left matches right, on every
  padded box. The only exception is optical centering on a pill control. If
  you find `padding: a b c d` with four different values, it is a bug.
- **Border-box, always.** There is no app-wide `box-sizing` reset — `index.css`
  resets margins only, and a global takeover would reach the unmigrated pages.
  Each migrated page scopes its own reset to its container. Any component that
  sets an explicit width *and* carries padding or a border must also set
  `box-sizing: border-box` on itself, so it stays correct wherever it is
  reused; otherwise it renders wider than its column by exactly its padding
  plus border, and silently stops lining up with its siblings.
- **Nothing sits flush.** No button — or any other control — may butt against
  the element above it with zero space. Spacing between siblings comes from
  the parent's `gap`, not from one-off margins on the children; if a column
  has no `gap`, give it one rather than adding a margin to the odd child.
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
- **Hero image** — a large product image sitting *on the canvas*, opposite the
  content column. The landing route is the reference: `src/images/optimus.webp`
  on `#/robot-simulator`.
  - The content column narrows to ~58% and keeps its normal vertical flow; the
    image takes the remaining ~42% of the hero area.
  - It **bleeds off the viewport edge** — anchored to the top-right, running
    past the right edge, clipped by `overflow-x: clip` on the page container.
    Use `clip`, not `hidden`: `hidden` makes the page a scroll container and
    traps popovers.
  - **No card, border, radius, or elevated surface**, and no shadow. It is
    atmosphere, not a panel. (`--shadow-hero` is still the only permitted
    shadow, but it is a *box* shadow — on a transparent cut-out image it draws
    a rectangle behind the subject, so it does not apply here.)
  - It is decorative: `aria-hidden`, empty `alt`, and `pointer-events: none`
    so it never intercepts a click meant for the form.
  - Where text may meet it, fade the image into the canvas with a legibility
    scrim rather than boxing the text in a panel.
  - Scaled against the hero viewport, overshooting it slightly so the subject
    is cropped by the fold as well as by the right edge — a bleed on two sides
    reads as atmosphere; a fully contained image reads as a picture. With
    `object-fit: contain` a tall subject is *height*-bound, so height is the
    control that sizes it and `width` only has to stay out of the way. It is
    still one hero section, one clear idea.
  - It enters **last**, sliding in from off the right edge — the payoff at the
    end of the load sequence, not competing with the form for the first
    glance. See Motion.
- **Collapsible diagnostics summary** — the pattern that pairs with a hero
  image, because the image takes the space a side panel used to occupy.
  Detail that once filled a full-height column becomes a compact strip below
  the primary actions: a few short color-only status lines (the headline
  count, any critical error, any advisory count) plus a `View full
  diagnostics` disclosure, closed on load, expanding **inline** so it pushes
  content down rather than overlaying it. The expanded view must not repeat
  the lines the collapsed strip already shows — the strip stays visible when
  it opens.
- **Status indicators** — minimal. A short text label in `--color-success` /
  `--color-error` / `--color-secondary-label`, optionally preceded by a small
  dot. No badge or tag chrome: no filled pill backgrounds, no borders, no
  uppercase micro-labels, and no tick/checkmark glyphs. In a dense list of
  statuses — the parse diagnostics panel is the case — drop the dot too and
  let **color alone** carry the status (`glyph={false}`); a column of repeated
  icons is noise.
- Anything reused across pages goes in `src/components/`. Page-specific
  components can live alongside the page.

## Motion

Restrained and physical. Motion should feel unhurried and inevitable, never
attention-seeking.

- **Ease-out on entrance** (`--ease-out`). No bounce or spring unless
  *very* subtle.
- **Entrance**: fade plus slight upward movement (~8–12px). The initial page
  load is deliberate and cinematic — Apple's motion is slower than utility-UI
  motion, so `--duration-slow` (1000ms) is the entrance duration, staggered
  across a few elements.
- **Entrance order is reading order, and imagery lands last.** Header first
  (0ms), then the form panels (~180ms), then the hero image (~320ms) sliding
  in on X from off the viewport edge — same `--duration-slow` and `--ease-out`
  as everything else, so it reads as the payoff of the load rather than a
  separate effect. Under `prefers-reduced-motion` the image skips the slide
  entirely and is simply present; restate its resting `opacity`/`transform`
  when you cancel the animation, since `animation: none` alone can strand an
  element at its unfilled `from` state.
- **Tab/segment switches**: smooth cross-fade (`--duration-base`).
- **Hover/press feedback**: always a real transition, never an instant state
  swap. Color, background, and border animate over `--duration-base`; the
  transform nudge that accompanies them uses `--duration-fast` so the control
  still feels responsive under the finger. Every interactive element needs a
  `:hover` *and* an `:active` state, both eased with `--ease-out`.
- **No scroll-triggered animation** on single-screen views. Entrance runs once,
  on load.
- Always honor `prefers-reduced-motion: reduce` by disabling animation.

Duration tokens: `--duration-fast` (150ms), `--duration-base` (300ms),
`--duration-slow` (1000ms). Easing: `--ease-out`, `--ease-in-out`.

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
set — hero, hero image, progress bar, role selector, source panel, *and* the
inline parse-diagnostics summary. It contains no Carbon, no IBM Plex, and no
hardcoded hex or spacing values. Use it as the reference implementation, for
the hero-image and collapsible-summary patterns above as much as for the
tokens.

Its landing layout is a single column at ~58% with the hero image occupying
the rest; below 900px the image is dropped and the column takes the full
width back, rather than shrinking the image into a smear behind the text.

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
