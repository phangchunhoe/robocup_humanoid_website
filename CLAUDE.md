# CLAUDE.md

Guidance for working on this repo's UI.

This project uses a **technical/instrument design language in dark mode** —
Apple's restraint in layout, spacing and motion, carrying a HUD's vocabulary
where the app is doing engineering work. It is a custom, token-driven system —
there is no UI component library. All new UI is built from the tokens defined
in [`src/styles/tokens.css`](src/styles/tokens.css) and composed into
components that live with the page or in `src/components/`.

> Supersedes an earlier direction that used IBM's Carbon Design System
> (`@carbon/react`, g10 light theme, IBM Plex). That is fully removed from
> the codebase. Do not reintroduce Carbon components, Carbon tokens, or IBM
> Plex — if you find leftovers, replace them with the tokens below.
>
> Also supersedes the pure Apple direction that preceded it: a peach accent,
> a system-font-only stack, and opaque chrome everywhere. The accent is
> emerald, the type is Space Grotesk / JetBrains Mono, and chrome stacked
> over the live field is glass. Those are described below; the layout,
> spacing, tap-target and motion discipline are unchanged.

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

**Two families, each with exactly one job:**

```css
--font-sans: "Space Grotesk", system-ui, -apple-system, sans-serif;
--font-mono: "JetBrains Mono", ui-monospace, "SF Mono", monospace;
```

- Do not add a third face. Hierarchy comes from **weight and size**, never
  from mixing families. Space Grotesk is the app's voice for everything that
  is language; JetBrains Mono is for everything that is a value.
- `--font-mono` is reserved strictly for file paths and technical values
  (`brain_tree.cpp`, `include/brain_tree.h`, a port name, a coordinate
  readout, a live HUD counter). Never for headings, buttons, nav, or prose.
- **Both faces are self-hosted**, vendored from npm (`@fontsource/space-grotesk`,
  `@fontsource/jetbrains-mono`) and imported in `src/main.jsx` ahead of
  `tokens.css`. Not a Google Fonts `<link>`: no third-party request on every
  page load, no render-blocking external stylesheet, and the app still works
  offline. Only the weights the type scale actually uses are imported —
  400/500/600/700 sans, 400/500/600 mono — and the latin subset only. Adding
  a weight to a token means adding its import too, or it will silently
  synthesise.
- This deliberately reverses the earlier system-stack-only rule. The trailing
  `system-ui, -apple-system` entries are now a *fallback* while the face
  loads, not the intended rendering.
- **Large headline type uses tight/negative letter-spacing.** The type tokens
  bake this in — bigger sizes get progressively tighter tracking. The values
  are tuned to Space Grotesk, a geometric face whose default fit already runs
  tight at display sizes, so it needs *less* negative tracking than the
  humanist stack it replaced (`-0.02em` headline, not `-0.03em`). Body-size
  text stays at normal tracking.

Type scale tokens: `--text-headline`, `--text-title`, `--text-body`,
`--text-callout`, `--text-caption`, `--text-micro`, each with a matching
`-tracking` and `-weight` token.

**`--text-micro` is the instrument step** — small, tracked *wide* (the
opposite of the headline), and set uppercase by the rules that use it. It is
for panel/section markings and live readouts: `Step 1 · Role`, `Step 2 ·
Source`, `Physics`, the progress readout. Pair it with `--font-mono` for
anything that updates during a run. It is **not** for status indicators —
those stay sentence-case caption text with no chrome (see Components).

## Color

Semantic, role-named tokens only — never hardcoded hex in page CSS, and never
a raw color name that describes appearance instead of purpose.

The palette is **neutral charcoal carrying one emerald accent**. The grounds
are desaturated cool charcoals whose only job is to separate by *value*; the
one vividly saturated color on the page is interactive. Nothing decorative
competes with it.

| Token | Value | Role |
|---|---|---|
| `--color-background` | `#0b0f14` | Near-black cool charcoal page canvas |
| `--color-elevated-background` | `#161b22` | Panel/card surface. Must read as clearly **raised** above the canvas — this is the first elevation level |
| `--color-elevated-background-hover` | `#1a2029` | The second elevation level: the raised surface hovered, or a surface sitting on another surface |
| `--color-separator` | `#2a3038` | Hairline borders and dividers. An opaque charcoal, not a translucent white — it reads the same on either ground |
| `--color-accent` | `#10b981` | Emerald — the single interactive color: links, primary buttons, active segments, selected cards, focus rings. Clears 6.7:1 as text on a panel |
| `--color-accent-hover` | `#059669` | The accent's hover/pressed state. Same flavor, one step deeper |
| `--color-on-accent` | `#090d11` | Charcoal ink for text/glyphs sitting *on* an accent fill. Clears 7.6:1 on the base and 5.2:1 on the hover step, so hover is a background change only |
| `--color-label` | `#f0ede9` | Warm off-white primary text |
| `--color-secondary-label` | `#9ba3af` | Muted gray secondary text |
| `--color-tertiary-label` | `#7d8590` | Faintest text — hints, placeholders |
| `--color-success` | `#7fbf8c` | Desaturated sage. Success/found status only |
| `--color-error` | `#d9776f` | Warm-toned red. Error/missing status only |

**Separation is by value, saturation is by role.** Canvas, panel, and hover
surface are three distinct steps up the same neutral ramp — a panel must be
visibly lighter than the canvas it sits on, so never flatten those steps or
paint a panel with the canvas token. Conversely, saturation means *this is
interactive*: if a color is vividly saturated, it is the accent, and if it is
the accent, it responds to a pointer. Neutrals never carry meaning; the accent
never decorates.

### Green means three things, and saturation is what tells them apart

This is the palette's one real hazard and it is worth stating plainly. Since
the accent went emerald, green carries three unrelated meanings in this app:

1. **the accent** — interactive chrome,
2. **the `kick` decision** — one branch of the simulate step's categorical
   legend,
3. **the pitch** — the playing surface itself.

The rule that keeps them apart is the one already stated above: *vivid
saturation is reserved for the accent*. Two tokens are deliberately shifted to
respect it, and both are scoped to the simulate step's own custom-property
block, not `tokens.css`:

- **`--turf: #102a1c`** (was `#163826`) — pushed deeper and duller. It is a
  large, passive field of color; if it carried the accent's saturation the
  ground itself would read as a control. Darkening it also gives the glass
  HUD floating on top of it something dark to separate against.
- **`--decision-kick: #56bccb`** (was `#63c894`) — moved off green entirely,
  to a cooler and less saturated cyan-teal at ~188°. The accent is emerald at
  ~160°, so the old value sat about 10° from "this is clickable" — a real
  ambiguity on a robot fill and a dashed kick ray. Cyan reads as
  instrumentation.

`--color-success` (`#7fbf8c`) is **left as it is**. It is a neighbouring hue
(~132°) but a desaturated one — ~33% against the accent's ~84% — so the same
saturation rule already separates it, and it never appears as chrome. If a
future change makes it more vivid, it has to move.

The remaining decision colors (`--decision-chase`, `--decision-adjust`,
`--decision-idle`) are untouched: none of them is near green.

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
- **No *depth* shadows on UI chrome** — not on panels, cards, buttons,
  inputs, or popovers. Separate surfaces with `--color-elevated-background`
  and `--color-separator` hairlines instead. There are exactly three named
  exceptions, below; only the third is genuinely depth, and it is the one
  case where depth is the point.
- **Exception 1 — `--shadow-hero`.** A single soft drop-shadow beneath
  hero/product-style *imagery* sitting on a surface. Nothing else may use it.
- **Exception 2 — `--glow-accent`.** An accent-colored glow
  (`0 0 12px color-mix(in srgb, var(--color-accent) 20%, transparent)`), and
  its brighter sibling `--glow-accent-lead`. This is **light, not depth**: no
  offset, no spread, no darkening — it reads as the control lighting up, not
  as it rising. It is scoped to exactly two uses:
  - the **hover/active state of an interactive element** (buttons, active
    segments, the selected card, the stats-card toggle). Never at rest, and
    never on a `:disabled` control — a glow is a response to a pointer, and
    something that cannot respond must not appear to.
  - the **progress bar's lead edge** (`--glow-accent-lead`), where it is the
    falloff of the moving tick.

  It is not a general licence for shadows. A panel, a card, a popover or a
  static surface still gets a hairline and nothing else.
- **Exception 3 — `--shadow-glass`** (`0 4px 6px -1px rgba(0,0,0,0.2)`). The
  only *depth* shadow in the system, and the narrow reason it is allowed:
  it sits beneath a glass fill that physically **slides** over its own
  track — `RoleToggle`'s selected pane — so the moving element reads as a
  pane travelling above the surface rather than as a background being
  repainted underneath the labels. Tight and tucked-under (6px blur, -1px
  spread) so it never reads as the pane floating off the control. Scoped to
  that one element. A *static* surface — panel, card, button, popover —
  still gets a hairline and nothing else, glass or not.
- **No blur/translucency on chrome, except where chrome is genuinely stacked
  over moving content.** That is the whole test, and on this route only the
  simulate step meets it — there, the field is live and everything sits on
  top of it, so all of its chrome is glass. Two levels, both in
  `RobotSimulator.css`:
  - **`.rs-hud`** — the floating chrome itself: the console and the legend.
    `--glass-hud` (`--color-elevated-background` at 70%) plus `--blur-hud`
    (16px) and a `--color-separator` hairline.
  - **`.rs-glass`** — surfaces stacked on or within that: the physics drawer,
    a compact rounded card floating on the pitch.
    `--glass-panel` (65%) plus `--blur-panel` (20px) and the same hairline.

  Both are still the same elevated-surface and separator tokens as an
  ordinary `.rs-panel`, given translucency instead of opacity, and both have
  a near-opaque fallback (`--glass-*-fallback`) under `@supports not
  (backdrop-filter: …)` so legibility never depends on the effect landing.
  The landing step's panels sit on a static canvas, so they stay opaque
  `.rs-panel`s. If it isn't over moving content, it doesn't get glass.
- **Named exception — `RoleToggle`'s selected pane is glass on a static
  canvas.** It is the one control that gets the treatment without sitting
  over moving content, because *it* is the thing that moves: the pane slides
  across its own track, and a translucent fill is what lets the unselected
  label stay legible underneath as it passes. Its fill is
  **`--glass-neutral`** — the neutral counterpart to `--glass-chrome`,
  carrying no accent at all — under a `--border-neutral-subtle` hairline,
  with `--shadow-glass` and `--blur-control` (8px). Both neutral tokens are
  `color-mix`ed from `--color-label` rather than a raw white, so the app
  still has exactly one white.

  Two deviations from the surrounding rules are deliberate and worth naming
  rather than letting a future reader "fix" them:
  - **It writes `backdrop-filter: var(--blur-control)` directly, not
    `var(--chrome-blur)`.** The rule below says blur is inherited from
    context because a literal blur over an opaque panel is invisible; that
    is still true here, and this control accepts the cost anyway so its
    material is the same wherever it is reused. If a second static-canvas
    glass control appears, generalise this rather than copying it.
  - **The selected state carries no accent.** *Open question* — this is the
    one control on the route where selection is signalled by material and
    ink weight rather than by hue, which is in tension with "saturation
    means interactive". Candidates if it proves too subtle: an accent
    hairline on the pane (`--border-accent-strong`), accent ink on the
    active label, or a short accent underline. Resolve this and delete this
    paragraph either way.
- **Glass controls declare blur through `--chrome-blur`, not directly.**
  Whether a translucent button actually blurs is a property of *where it
  sits*, not of what it is — so it is inherited. `--chrome-blur` is `none` at
  `:root`, and `.rs-run-layout` (the one container stacking chrome over the
  live field) sets it to `var(--blur-chrome)`. Every glass control writes
  `backdrop-filter: var(--chrome-blur)` and switches on automatically in that
  subtree. This matters: over a flat opaque panel there is nothing behind to
  blur, so a literal `backdrop-filter` there is invisible while still costing
  a compositor layer per control. Add a glass control by reading the
  property, never by hardcoding a blur.
- **Don't stack backdrop-filters.** Each one blurs whatever is painted behind
  it, so nesting them re-blurs an already-blurred backdrop for no visible
  gain. The stats card sits *inside* `.rs-hud` and therefore takes a plain
  translucent tint, not glass — see the comment on `.rs-stats-card`.

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

- **Segmented control** — pill-shaped track, single glass active segment.
  This is the pattern for switching views (e.g. the simulate step's playback
  speed, `0.5× / 1× / 2×`), *not* a tab bar with underlines. The active segment takes the glass chrome
  treatment: `--glass-chrome` fill, `--border-accent-subtle` hairline, the
  label in `--color-accent`, and `--glow-accent`. Every segment carries a
  `1px solid transparent` border at rest so the active one's hairline costs
  no layout — without it the whole track jumps by 2px each time the selection
  moves.
- **Buttons** — pill-shaped. Exactly two variants, and they are deliberately
  *not* the same treatment. No tertiary, no danger variant.
  - **Primary** stays a **solid `--color-accent` fill** with `--color-on-accent`
    ink, deepening to `--color-accent-hover` plus `--glow-accent` on
    hover/press. It is the single dominant action in its row; if it read the
    same as its neighbours the hierarchy would be gone. Do not convert it to
    glass.
  - **Secondary** is **glass**: `--glass-chrome` fill, `--border-accent-subtle`
    hairline, `--color-accent` label, going to `--glass-chrome-hover` +
    `--border-accent-strong` + `--glow-accent` on hover.
  - A button may carry one leading icon when it needs a visual anchor rather
    than being pure text — the landing step's `Choose folder…` is the
    reference (`.rs-btn-icon` in `RobotSimulator.css`). It is always
    **outline/stroke only, never filled** (same convention as the info `(i)`
    icons), `currentColor` so it inherits the button's own ink, and sized
    deliberately larger than the 16px corner-icon convention — 24px
    (`--space-6`) — since on a button it *is* the anchor rather than a small
    inline glyph. `.btn` carries `gap: var(--space-2)` for the icon/label
    pair; this costs nothing on the many text-only buttons that don't use it.
- **Selected state** — a selected `SelectableCard` reads the same as an active
  segment: glass fill, accent hairline, glow. One treatment for "this is the
  chosen one", wherever it appears.
- **Sliding-pane toggle** (`RoleToggle`) — a **named variant** of the
  segmented control above, for exactly one case: a two-way choice that
  benefits from a persistent, always-visible selected state animating
  *between* positions rather than an instant swap — the striker/goalkeeper
  role toggle. Same tap targets as `SegmentedControl`, but four real
  differences:
  - **It is squared off, not a capsule.** Track, segments and sliding pane
    all take `--radius-subtle` (8px, the tightest step on the shape scale)
    rather than `--radius-pill`. This is the only control on the route that
    does; a plain `SegmentedControl` is still a pill.
  - **It centres itself** in its container (`width: fit-content` +
    `margin-inline: auto` on the track). Its `<legend>` deliberately does
    *not* follow — that is the numbered-workflow marking (`Step 1 · Role`)
    and has to stay left-aligned with `Step 2 · Source` in the same card.
  - **The selected state is neutral glass, not the accent** — see the
    named glass exception under Surfaces, and the open question recorded
    there.
  - **The pane's motion is spring-driven** (framer-motion, `SPRING_UI`)
    rather than `--duration-base`/`--ease-out`. See Motion → Spring-based
    controls for why this gets a second motion system and
    `SegmentedControl` doesn't.

  Two implementation traps, both consequences of the pane now carrying a
  hairline of its own where the old accent capsule had none:
  - The pane is sized from `getBoundingClientRect` and **must be
    `box-sizing: border-box`**, or its 1px border is added *outside* the
    segment width JS measured and it overhangs by 2px in both axes.
  - `getBoundingClientRect` returns the track's **border** box, but the
    pane is absolutely positioned and resolves against the track's
    **padding** box. Subtract `track.clientLeft` in `measure()` or the pane
    lands one hairline right of the segment it covers.

  Don't reach for this over the plain `SegmentedControl` by default — it
  earns the extra weight (a JS dependency, measured-DOM positioning)
  specifically where the sliding motion is the point, not for every two-way
  switch on the page.
- **Cursor-following hover highlight** — a soft radial tint that tracks the
  pointer inside a control, currently on `RoleToggle`'s segments only. Two
  rules make it cheap and make it read right:
  - **The position is written to custom properties on the element, not to
    React state.** `onMouseMove` sets `--mouse-x`/`--mouse-y` via
    `style.setProperty`; a `radial-gradient(circle at var(--mouse-x)
    var(--mouse-y), var(--glow-cursor), transparent 60%)` on a `::before`
    reads them. A `setState` per mousemove would re-render the whole control
    on every frame of a pointer sweep.
  - **Only the opacity transitions; the position tracks live.** Fade the
    highlight in over `--duration-base`/`--ease-out` on `:hover`, but never
    transition the gradient itself — a lagging highlight reads as the light
    being *dragged* rather than as the surface catching it (and background
    position does not interpolate anyway). This is the one place the
    instant-state-swap ban does not apply to a moving value.

  The `::before` takes `z-index: -1` so it lights the control from behind
  its own label without washing the text out; that requires the host element
  to establish a stacking context (`position` + `z-index`) or the highlight
  escapes behind the parent. Under `prefers-reduced-motion` it is removed
  outright (`display: none`) rather than merely un-faded — a highlight that
  follows a pointer is motion — leaving the plain hover ink change as the
  affordance.
- **Numbered workflow** — where a page is a sequence, say so in the panel
  markings: `Step 1 · Role`, then `Step 2 · Source`. And **name modes with
  nouns, actions with verbs**: the one button inside the source section says
  what pressing it does (`Choose folder…`, becoming `Choose a different
  folder…` once a scan has landed). An earlier version had an `Open folder`
  segment sitting directly above a `Choose folder` button, and the pair read
  as the same control twice — that segment (`Local folder` / `Pasted text`)
  is gone now; local folder is the only source method, so there is nothing
  left to switch between.
- **Merged step card** — where two numbered steps are small and always used
  together, they can share one `.rs-panel` rather than stack as two. The
  robot-simulator landing step's `.rs-setup-card` is the reference: role
  (`Step 1 · Role`) and source (`Step 2 · Source`) live in one card, still
  carrying their own numbered markings internally. Don't generalize this to
  steps that are independently skippable or reorderable — it fits here
  specifically because picking a role and giving it source are always done
  as one motion.
- **Stage-swapped card content** — a card whose content is fully replaced
  (not layered, not disclosed) once a later stage begins, rather than
  showing the form and the results at once. `.rs-setup-card` does this
  twice over: it holds the role/source form during the `setup` stage, then
  swaps to the checks summary (`DiagnosticsSummary`) during `checks`,
  driven by one `stage` state value in `RobotSimulator.jsx`. Pair it with a
  single primary action button whose **label is the verb for the current
  stage** — `Load & Check` in `setup`, `Start Simulation` in `checks` —
  rather than a static label; provide an explicit way back (`Edit setup`)
  since the earlier stage's controls are no longer on screen to change
  directly.
- **Pinned card, internal scroll** — a card that must stay in view while the
  rest of its column scrolls past it (so its own contents scroll internally
  once they outgrow the viewport, rather than carrying the card away) uses
  `position: sticky` with its own `overflow-y: auto` and a `max-height`
  derived from the viewport — `.rs-setup-card` is the reference. This only
  works if **no ancestor up to the true scrolling root carries a non-visible
  `overflow` or a persistent non-`none` `transform`** — either one silently
  breaks `position: sticky` by giving it the wrong containing block/scroll
  reference. Both traps exist elsewhere on this exact page — see the two
  sizing/motion traps called out under Migration status below — and are
  exactly why the run step's physics drawer uses `position: fixed` instead;
  a sticky card should default to fixed too unless the ancestor chain has
  been specifically audited clean.
- **Progress / status indicator** (`ProgressBar`) — a technical HUD readout,
  not a generic progress bar. A 2px etched hairline track on
  `--color-separator`; an accent fill; a short bright **lead edge** riding the
  head of the fill with `--glow-accent-lead`; a `--text-micro` uppercase
  label and a `--font-mono` live readout (`2/4 FILES`, `READY`) that turns
  accent on completion. No numerals inside the bar, no rounded capsule, no
  step chrome. Fill and lead edge are both driven from **one**
  `--progress-ratio` custom property set on the track, so the two marks
  cannot drift apart, and both move on a compositor transform rather than on
  `width`/`left`. The lead edge hides itself at 0 and at 100% — a tick pinned
  at either end reads as a rendering artifact rather than a position.
  The `ballTip` prop is a named variant, not a second component: it swaps
  the lead tick for a small soccer-ball mark, using the identical
  full-track-plus-transform positioning trick, so it is still one source of
  truth for the position. That mark is **the one raster asset on this
  route** — `src/images/icons/football.png`, black-on-transparent artwork,
  resolved through the bundler at its full 512px resolution and scaled down
  by the browser at paint time. It sits above the inline limit, so it is
  emitted as a hashed file and costs one cached request; that is the
  deliberate trade for keeping a single asset on disk rather than a source
  plus a derivative that can drift. Because the artwork carries no ground of
  its own, the panels are
  whatever sits behind them: a `--color-ball-face` beige fill clipped to a
  circle by `--radius-pill`, under a 2px ring that redraws the silhouette
  (the artwork's own rim renders under a pixel wide at this size and washes
  out). **It is a background layer on a `<span>`, not an `<img>`, and that
  is load-bearing:** a replaced element's content box stops at its border,
  so an image could only ever sit inside that ring with its own pale edge
  showing between the two. As a background painted across the whole border
  box (`background-origin: border-box`), the ring lands on top of the
  artwork's edge and eats into it, so the two read as one ring. Any future
  raster mark that needs a ring around it has the same constraint.
  That token is the ball's *material*, not chrome — the one warm value
  allowed outside the neutral ramp, and scoped to this mark alone. An
  earlier version drew the ball as inline SVG from `--color-label` /
  `--color-background` to match the run step's own ball; that is gone, and
  the two balls are now allowed to differ. Unlike the tick it has
  no idle state — the ball is meaningful even at ratio 0, marking the
  not-yet-started tip — and it gets a one-time entrance pop
  (`--duration-slow`/`--ease-out`, scale 0.4 → 1) on load rather than
  replaying on every ratio change. Its glow reuses `--glow-accent-lead` via
  `filter: drop-shadow(...)`, which accepts the same offset/blur/color
  triple the token already carries — a reuse, not a new glow. The
  robot-simulator landing step uses this variant for its one progress bar,
  now keyed to 3 workflow stops (Setup / Checks / Simulation) rather than a
  per-file count — see Migration status.
- **Corner icon button** — a circular, icon-only glass control pinned to a
  corner: `--tap-target-min` square hit area with a 16px glyph inside, glass
  fill, hairline border, and accent + `--glow-accent` on hover. Two instances,
  and they are deliberately the same object: `.rs-back` (top-left of the
  field, the only in-page route back to the editor, since this step renders
  no header or site nav) and `.rs-stats-toggle` (the stats card's flip). A
  third corner control should reuse this pattern rather than invent one.
  `.rs-back` lives *inside* `.rs-field-panel`, not in `.rs-run-layout`, so it
  stays anchored to the field in the stacked sub-900px layout where the run
  layout itself is `position: static`. Anything else claiming a corner insets
  itself past it by deriving from the same tokens — see `.rs-legend`'s
  `left: calc(var(--space-6) + var(--tap-target-min) + var(--space-4))`, which
  moves automatically if the button does.
- **Scrollbars are styled once, page-wide** — the native scrollbar is a
  light-mode artifact (white track, mid-grey thumb) and is glaring against
  dark glass. `.robot-simulator-page` restyles every scrollable box: thin,
  transparent track (a painted one reads as a seam across a glass panel), and
  a muted thumb at 40% `--color-secondary-label` that brightens to full on
  hover. **Both mechanisms are required and are not interchangeable** —
  Firefox reads only `scrollbar-width`/`scrollbar-color`, Chrome and Safari
  only the `::-webkit-scrollbar` pseudo-elements; each browser applies the one
  it knows. The run step's **window** scrollbar belongs to the root element
  and none of those rules reach it, so it takes its own
  `html:has(.rs-run-layout)` block — scoped with `:has()` rather than declared
  globally, because a global takeover would hand the unmigrated light-themed
  pages a dark scrollbar.
- **HUD reticle** — four faint corner brackets framing the canvas
  (`.rs-reticle`), in `--color-separator` at reduced alpha. Brackets, **not a
  grid**: this canvas already carries its own markings (touch lines, centre
  circle, penalty spots) and a grid laid over them would compete for the same
  reading. Corner marks frame the view instead of drawing on it. Purely
  decorative — `aria-hidden` and `pointer-events: none`, so it never
  intercepts a drag meant for the ball.
- **Hero artwork** — one large piece of imagery sitting *on the canvas*,
  opposite the content column. The landing route is the reference:
  `src/pages/HeroField.jsx` on `#/robot-simulator` — a line-art pitch with a
  striker shooting into the opponent goal.
  - The content column narrows to ~58% and keeps its normal vertical flow; the
    artwork takes the rest of the hero area, running under the column's right
    edge so the scrim, not a hard boundary, is what ends it.
  - **No card, border, radius, or elevated surface**, and no shadow. It is
    atmosphere, not a panel. (`--shadow-hero` is still the only permitted
    shadow, and only under a raster product image — it is a *box* shadow, so
    it applies to neither a cut-out subject nor an SVG.)
  - It is decorative: `aria-hidden` and `pointer-events: none` so it never
    intercepts a click meant for the form. A raster hero also takes an empty
    `alt`.
  - Where text may meet it, fade it into the canvas with a legibility scrim
    rather than boxing the text in a panel.
  - It enters **last**, sliding in from off the right edge — the payoff at the
    end of the load sequence, not competing with the form for the first
    glance. See Motion.
  - **Drawn artwork is built from the tokens like anything else.** Pitch
    markings are `--color-separator`, the same hairline value as any other
    divider, so the field reads as ground; the subject climbs the neutral ramp
    above it (`--color-secondary-label` for the figure, `--color-label` for
    the ball).
  - **Exactly one element of the hero carries the accent: the trajectory**
    (`.rs-shot-line`), and only mixed well back toward the neutral ramp —
    `color-mix(in srgb, var(--color-accent) 55%, var(--color-tertiary-label))`.
    The narrow reason it may: this is the same predicted-path vector the
    simulator itself draws on the live field, so the hero is quoting the
    product rather than decorating itself. Kept dilute so it reads as a tinted
    trace and never as something clickable. The pitch markings, the striker
    and the ball stay fully neutral — a hero is not interactive, and
    saturation on this page still means *this responds to a pointer*.
  - **A scroll-scrubbed hero holds its place.** It is `position: fixed` against
    the right of the viewport, so the page scrolls under it rather than past
    it, and scroll position drives one custom property (`--rs-kick`, 0 → 1) that
    the artwork reads. Keep the scrub to one property, written once per frame
    from `requestAnimationFrame`. Geometry that two elements share — a
    trajectory and the ball riding it — is authored once in the markup and
    measured with `getTotalLength()`/`getPointAtLength()`, never restated in
    CSS where the two copies can drift apart.
  - **The scrub is eased, not pinned.** Scroll sets a *target*; the artwork
    eases toward it and arrives a beat later. Pinning it frame-exactly to the
    wheel is the same instant state swap that is banned on hover — it reads as
    mechanical where the rest of the page reads as physical. Use an exponential
    approach (each frame closes a fraction of the remaining gap): it eases out
    for free, cannot overshoot, and behaves identically at any refresh rate.
    Take the time constant from the duration tokens rather than inventing a
    number in JS — `--duration-base`, read once with `getComputedStyle`. Clamp
    the frame delta, since a backgrounded tab hands back one enormous one. This
    is `src/lib/useScrollScrub.js`, not a one-off in `HeroField.jsx` — the
    simulate step's physics drawer is the second call site; extend the shared
    hook for a third rather than re-deriving this loop again.
  - Under `prefers-reduced-motion`, a scrub is motion too: hold a still frame
    (the moment before contact) instead of following the scroll.
  - A raster hero instead **bleeds off the viewport edge** — anchored top-right,
    running past the right edge, clipped by `overflow-x: clip` on the page
    container. Use `clip`, not `hidden`: `hidden` makes the page a scroll
    container and traps popovers. Overshoot the fold slightly so the subject is
    cropped on two sides; a bleed reads as atmosphere, a fully contained image
    reads as a picture. This does not apply to the fixed field above, whose
    subject — the goal — has to stay in frame.
- **Collapsible diagnostics summary** — the pattern that pairs with hero
  artwork, because the artwork takes the space a side panel used to occupy.
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
  icons is noise. The simulate step's stats card wraps a `StatusIndicator` in
  a `<button>` for its collapsed error/overrun alert — that's still one
  `StatusIndicator`, not a list of them, so the no-badge rule still applies to
  it; the button chrome around it is a hit target, not status chrome.
- **Decision pill** (simulate step only) — a **named exception** to the status
  indicator's no-filled-background rule: `.rs-decision-pill` in
  `RobotSimulator.css`, a glass pill carrying the robot's current
  chase/adjust/kick/idle state — a tinted translucent fill under a low-alpha
  hairline, both `color-mix`ed from the decision's own color so the pill says
  which state it is by hue alone. It's exempt because it isn't a status in a
  list — it's the one always-visible headline of the stats card, playing the
  role a prominent stat tile plays elsewhere, and it draws from the
  decision-legend colors (see Color → Green means three things), not
  success/error/secondary-label, and not the accent: it is a readout, not a
  control. The decision changes mid-run, so the color change is a transition
  over `--duration-base` rather than a swap — the same rule as any hover
  state. Don't generalize from it: a second status anywhere else still
  follows the plain-text rule above.
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
  (0ms), then the form panels (~180ms), then the hero artwork (~320ms) sliding
  in on X from off the viewport edge — same `--duration-slow` and `--ease-out`
  as everything else, so it reads as the payoff of the load rather than a
  separate effect. Under `prefers-reduced-motion` the artwork skips the slide
  entirely and is simply present; restate its resting `opacity`/`transform`
  when you cancel the animation, since `animation: none` alone can strand an
  element at its unfilled `from` state.
- **Tab/segment switches**: smooth cross-fade (`--duration-base`).
- **Hover/press feedback**: always a real transition, never an instant state
  swap. Color, background, and border animate over `--duration-base`; the
  transform nudge that accompanies them uses `--duration-fast` so the control
  still feels responsive under the finger. Every interactive element needs a
  `:hover` *and* an `:active` state, both eased with `--ease-out`.
- **No scroll-triggered animation** on single-screen views, and no
  scroll-*triggered* entrances anywhere — content does not fade in as it comes
  into view. Entrance runs once, on load.
- **Scroll-scrubbed elements are the one exception**, and only on a view that
  already scrolls. A scrub is *scrubbed*, not triggered: it tracks scroll
  position continuously in both directions, has no threshold, and never
  animates on its own. Exactly one such element per *view* — the landing/edit
  step's hero shot and the simulate step's physics drawer are each the only
  scrub in their own view, and the two views are mutually exclusive (this
  route never mounts both at once), so this still holds one-at-a-time even
  though both live under `#/robot-simulator`. A scrub is decorative or purely
  supplementary chrome, never the only way to reach required content, and
  scrolling back up must return it exactly to where it started.
- **A scrub eases toward scroll, it does not track it frame-exact.** Scroll
  sets a target; the value approaches it (exponential approach — each frame
  closes a fraction of the remaining gap) rather than snapping straight to
  it, so it trails the wheel by a beat the same way a hover state transitions
  instead of swapping instantly. Take the time constant from `--duration-base`
  via `getComputedStyle`, read once, not a number invented in JS. Both current
  scrubs share one implementation, `src/lib/useScrollScrub.js` — extend that
  rather than writing a third copy of the easing loop.
- **A scrub's origin is scroll position zero, so the view it lives on must
  start there.** React does not reset scroll on a state change the way a
  route change would, and the simulate step replaces a tall editor step the
  user has usually scrolled some way down. Without an explicit
  `window.scrollTo(0, 0)` on entering the step, the scrub initialises from a
  stale `window.scrollY` already past its reveal distance and the scrubbed
  element renders **fully revealed on the first paint** — which is exactly
  the regression that produced the current physics drawer code. Declare that
  reset effect *before* the `useScrollScrub` call: effects fire in hook
  order, so it has to run first for the scrub to read a zeroed scroll.
- **A scrub that reveals in place must become inert when closed.** The old
  drawer slid outside the field's clipped bounds, so at rest it was genuinely
  gone. One that fades and scales in place is still a full-size, fully
  transparent box sitting over the content beneath it — it will swallow every
  pointer event aimed through it, and its controls stay in the tab order
  while invisible. Toggle `visibility: hidden; pointer-events: none` from the
  scrub's frame callback below a small threshold (`.is-hidden` on
  `.rs-physics-drawer`), and set that class in the initial markup too so the
  first paint is correct rather than only the first scrub frame.
- Always honor `prefers-reduced-motion: reduce` by disabling animation —
  including a scrub, which holds a still resting frame instead (the moment
  before the hero's shot connects; the physics drawer closed). **Known gap:**
  because the drawer holds closed *and* is now correctly inert, reduced-motion
  users have no route to the physics sliders at all. That is not a regression
  in reach — they were previously invisible but still tabbable, which was its
  own bug — but it does mean the controls are unreachable for those users. If
  they ever stop being supplementary, they need a non-scroll affordance.

Duration tokens: `--duration-fast` (150ms), `--duration-base` (300ms),
`--duration-slow` (1000ms). Easing: `--ease-out`, `--ease-in-out`.

### Spring-based controls — a second, named motion system

Everything above is one motion system: CSS `transition`/`animation` on
`--duration-*`/`--ease-*`, plus the rAF/exponential-approach scrub in
`useScrollScrub.js` for the two scroll-driven elements. `framer-motion` (a
real dependency, see `package.json`) is a **second, separate** motion
system, and it is scoped narrowly rather than left to spread — a page
should not have to guess which of two systems a given piece of motion
belongs to.

**Where it's used, and where it stops:** exactly two controls on the
robot-simulator landing step, both because the reference-quality feel comes
specifically from spring *physics* (a value that can overshoot slightly and
settle, driven by stiffness/damping/mass) rather than from a fixed-duration
curve, which `--ease-out` cannot produce:

- **`RoleToggle`** (`src/components/RoleToggle.jsx`) — the striker/
  goalkeeper toggle's sliding selected-state pill. The pill's `x`/`width`/
  `height` are measured off the real button DOM (`getBoundingClientRect`)
  on every selection change and on resize, not hardcoded per-option pixel
  values — these are organic text labels, not a fixed step count, so a
  hardcoded width would drift from the actual rendered text the moment a
  label changed.
- **The two-stage primary button** (`RobotSimulator.jsx`, `.rs-stage-btn`)
  — `motion.button` with the `layout` prop animates the button's own box as
  its label's natural width changes between `Load & Check` and `Start
  Simulation`, and `AnimatePresence` cross-fades the label content
  (`--duration-fast`-scale, plain opacity, not spring) including a
  `CircleCheck` (`lucide-react`) that mounts in once checks have actually
  passed. `layout`, again rather than a hardcoded width, for the same
  reason as the toggle.

**The spring config is one shared, named constant** —
`SPRING_UI` in `src/lib/motionSpring.js` — imported by both, not
re-tuned independently per control:

```js
export const SPRING_UI = { type: "spring", stiffness: 500, damping: 40, mass: 0.8 };
```

Tuned heavier on damping than framer-motion's own default so it settles
rather than visibly overshooting/wobbling — a bouncy spring next to the
rest of the page's strictly ease-out, no-bounce motion language would read
as a different app. Both consumers fall back to `{ duration: 0 }` under
`prefers-reduced-motion: reduce` (read via framer-motion's own
`useReducedMotion()`, the same media query the CSS side answers) rather
than trying to express "no motion" as a spring with zero stiffness.

**Don't reach for this a third time without reconsidering.** Two named,
scoped uses is a deliberate, audited exception, the same shape as
`--shadow-hero` (one use) or `--glow-accent` (two named uses); it is not a
general license to animate other page motion with springs instead of the
token-driven CSS system above. If a future control also needs true spring
physics, extend this section explicitly rather than letting a third
untracked spring config appear inline somewhere.

## File conventions

- `src/styles/tokens.css` — the single source of truth for the design system.
  Imported once in `src/main.jsx`. Add new tokens here, never redefine them
  per page.
- Page-level CSS stays colocated with its page as `<PageName>.css`.
- Shared components go in `src/components/`.
- Plain CSS is preferred. Only introduce Sass for a file that genuinely needs
  it; the token layer removes most reasons to.

## Migration status

**Migrated.** The entire `#/robot-simulator` route is on the token set now,
both steps:

- The **landing/edit step** — hero, hero field artwork, the ball-tip progress
  bar, and the merged role/source/checks card. Local-folder is the only
  source method now; the pasted-text mode and its per-file code editor were
  removed outright, not collapsed, along with the segmented control that
  used to switch between the two.
- The **simulate step** — field, the floating HUD console, playback controls,
  the stats card, the reticle, and the physics drawer. There is no
  constants/assumptions reference any more; it was removed outright (not
  collapsed) when this step went full-viewport, to reclaim the vertical space
  rather than find it a new home.

It contains no Carbon, no IBM Plex, and no hardcoded hex or spacing values
outside the scoped exceptions below. Use it as the reference implementation —
for the hero-artwork and collapsible-summary patterns above, the glassmorphism
and card-stack patterns below, as much as for the tokens.

Its landing layout is a single column at ~58% with the hero field occupying
the rest; below 900px the field is dropped and the column takes the full
width back, rather than shrinking it into a smear behind the text.

**The landing step is now explicitly two-staged: `setup` then `checks`**,
tracked by one `stage` value in `RobotSimulator.jsx`, independent of the
`step` value that switches between the landing and run pages. `setup` shows
the role toggle and the folder picker; `checks` swaps the same card over to
the parse-diagnostics summary and adds an `Edit setup` way back. The single
primary button's label is the verb for whichever stage is active — `Load &
Check`, then `Start Simulation` — rather than a static `Run simulation`.
The progress bar tracks this as 3 stops (Setup / Checks / Simulation) rather
than a per-file count; "Simulation" is only ever reached by leaving this
step for the run page, so 2/3 is as far as the bar visibly climbs while
still here. See Components → Merged step card / Stage-swapped card content /
Pinned card, internal scroll for the reusable shapes this introduced.

Two sizing/motion traps specific to this step, both about `.rs-setup-card`'s
`position: sticky`:

- **The hero's off-screen entrance clip moved off `.robot-simulator-page`
  and onto a small dedicated `.rs-hero-clip` wrapper** (`position: fixed;
  inset: 0; overflow: clip`), and `.robot-simulator-page` itself no longer
  declares any `overflow`. It used to carry `overflow-x: clip` for exactly
  the same reason the run step documents further down — the CSS Overflow
  spec forces the *other* axis to compute to `auto` the moment one axis is
  non-`visible`, which silently makes that box (not the real viewport) the
  reference for any `position: sticky` descendant. `.rs-setup-card` needed a
  working sticky, so the clip had to move somewhere that isn't an ancestor
  of it. `overflow: clip` on the new wrapper still reaches its
  `position: fixed` child for painting purposes — clipping applies to a
  box's rendered subtree regardless of a descendant's own positioning
  scheme; only the fixed descendant's *containing block* (where its
  coordinates resolve from) skips past non-transformed ancestors, which
  clipping doesn't change.
- **`.rs-init-col`'s entrance dropped its translateY lift and animates
  opacity only** (`rs-enter-fade`, not the shared `rs-enter` keyframes
  `.rs-hero` still uses). `fill-mode: both` holds an animation's last
  keyframe value forever once it completes, and `transform: translateY(0)`
  is still a non-`none` transform even at rest — which becomes the
  containing block for anything positioned beneath it, exactly like a
  transformed ancestor breaks `position: fixed`. `.rs-setup-card` lives
  inside `.rs-init-col`, so that lingering transform would have quietly
  broken its sticky positioning. `.rs-init-col` still gets its stacking
  context from `position: relative` + `z-index: 1` (for the same
  popover-escaping reason `.rs-hero` needs one), so dropping the transform
  costs nothing there.

**`framer-motion` and `lucide-react` are real dependencies now, used in
exactly two places.** The role/goalkeeper toggle (`RoleToggle`, replacing
the old `SelectableCard` two-up layout for this one case — `SelectableCard`
itself is untouched and still available for other selection UI, it just has
no current call site) and the two-stage button's expand/collapse both use
framer-motion spring physics, ported from a reference progress-indicator
component and adapted to this app's own state and token set rather than
copied. See Motion → Spring-based controls above for the shared
`SPRING_UI` config and why it's scoped to exactly these two controls.

**The simulate step is a HUD, not a split layout.** It has no header, no back
control, and no site nav — navigation back to the editor is the top-left
`.rs-back` corner button (or browser-back)
— and its `position: fixed` root occupies the full viewport edge to edge. The
field is the *entire* viewport (`.rs-field-panel`, `position: absolute; inset:
0`, no border, no radius) and the console floats **on** it as a glass panel
inset by `--space-6` on all four sides, so the field reads as running
underneath and past it rather than stopping at a seam. This replaced an
earlier two-column flex row where the field and console sat side by side.

The **physics drawer** is a compact rounded glass card floating at the bottom
centre of the pitch area — not the full-width bottom-docked tray it used to
be. Bottom centre because the pitch's own landmarks are symmetric about that
axis and both goal labels sit at the top, so it is the one region that crowds
neither goal nor merges with the console into a lopsided right-hand mass. It
is centred on `calc((100% - var(--rs-hud-reserve)) / 2)`, capped at a width
that leaves a clear margin inside the pitch area on both sides, and scrolls
internally past `max-height`. Its reveal is scale + fade + a slight rise
rather than a slide: a small card sliding its own height reads as a jump,
where growing into place reads as settling. The `translateX(-50%)` that
centres it is part of the same `transform` as the reveal — an element has only
one, and the centring has to survive every frame of the animation.

Everything that must stay clear of the HUD — the pitch drawing, the legend,
the physics drawer, the reticle — insets itself by **one** custom property,
`--rs-hud-reserve`, derived on `.rs-run-layout` from `--rs-hud-width`. One
number, so the chrome and the drawing it must not cover cannot disagree about
where the boundary is. Below 900px the HUD unstacks into an ordinary column
and that single property is zeroed, which releases all four at once.

Two sizing traps worth keeping in mind here:

- The pitch `<svg>` states `width: calc(100% - var(--rs-hud-reserve))`
  explicitly rather than relying on a `right` inset with `width: auto`. An
  `<svg>` carrying a `viewBox` and no width/height attributes is a *replaced*
  element with an intrinsic ratio but no intrinsic size, so `width: auto`
  resolves from `height × ratio` and the `right` inset is dropped as
  over-constrained — the pitch would render straight under the HUD.
- `.rs-field-panel` is one element, not a sizing wrapper around a separately
  sized visual box. An earlier version split those and the two disagreed
  about width, with the visual box spilling into the console.

The legend is an overlay pinned to the field's top edge, not a row below it —
a flush, full-height field has no spare row left for one.

Named, scoped exceptions living in the simulate step's own custom-property
block at the top of its section in `RobotSimulator.css` (not the shared
`tokens.css`, since none is reusable outside this one view):

- **The pitch stays green, but deeper** (`--turf: #102a1c`, was `#163826`).
  It's a functional playing surface, not decorative chrome, unlike the
  landing page's neutral line-art hero field — so it's exempt from
  "separation is by value" rather than a leftover. It was darkened when the
  accent went emerald and the console became glass floating on it: see Color
  → *Green means three things*. `--turf-line` is now `color-mix`ed from
  `--color-label` rather than a raw `rgba()`, so the chalk is a transparency
  of the app's one white.
- **The four-way decision legend** (chase/adjust/kick/idle,
  `--decision-chase`/`--decision-adjust`/`--decision-kick`/`--decision-idle`)
  keeps a fixed categorical palette distinct from status colors and the
  accent. A legend needs more hues than the two-color status system provides;
  these are never used for interactive chrome, same rule as
  success/error. `renderer.js`'s `DECISION_COLOR` map and the CSS legend/pill
  both read from these same four custom properties, so they can't drift
  apart. `--decision-kick` was moved off green for the reason above.
- **The ball colors** (`--ball-fill`/`--ball-stroke`) are now plain aliases of
  `--color-label` and `--color-background` rather than their own hex. A
  two-tone ball still reads against the pitch, and it can no longer drift
  from the app's own white and black.
- **The field surface has zero border-radius and no border**, unlike every
  panel and card elsewhere on this page. It *is* the viewport now: there is
  nothing outside it to be separated from by a hairline, and a rounded corner
  sitting exactly on the viewport edge reads as a rendering bug. Don't
  generalize from it — a panel that doesn't touch the viewport edge still
  gets `--radius-panel` and its hairline.

Components built for this route and available for reuse (`src/components/`):
`SegmentedControl`, `SelectableCard`, `StatusIndicator`, `Notice`,
`ProgressBar`, `InfoHint`. The simulate step also introduced
`src/lib/useScrollScrub.js`, shared with the landing hero field — see Motion.

**Not yet migrated**, still on legacy bespoke styling:

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
