# CLAUDE.md

Guidance for future AI and human edits to this website.

This repo is a React/Vite single-page website for RoboCup Humanoid strategy
documentation, interactive behavior-tree explainers, and a live robot simulator.
The visual target is a dark technical HUD with liquid-glass controls: precise,
instrument-like, and interactive without becoming decorative.

## Tech Stack

- App framework: React 18 with Vite 5.
- Routing: `react-router-dom` v6 with `HashRouter`, so routes are written as
  `/#/robot-simulator`, `/#/simulation-math`, etc.
- Animation: `framer-motion` for magnetic controls, click springs, sliding
  panels, and eased simulator UI.
- Icons: `lucide-react`; use lucide icons for UI controls when an icon exists.
- Math rendering: KaTeX through the local `Tex`/`FormulaBlock` components.
- PDF export: `jspdf`, currently used for the approach-and-kick report.
- Fonts: self-hosted `@fontsource/space-grotesk` and
  `@fontsource/jetbrains-mono`, imported in `src/main.jsx`.
- Styling: plain CSS modules-by-convention, one CSS file beside each component
  or page. There is no Tailwind, Sass, CSS-in-JS, or component library.
- Deployment: `gh-pages` and the GitHub Actions workflow under
  `.github/workflows/deploy.yml`.

## Project Map

- `src/App.jsx` owns the route table.
- `src/main.jsx` imports webfonts, `src/styles/tokens.css`, and `src/index.css`.
- `src/styles/tokens.css` is the design-system source of truth.
- `src/pages/` contains route-level views.
- `src/components/` contains shared UI.
- `src/components/simmath/` contains Simulation Math formula sections and
  visualizations.
- `src/content/` contains editable page data and copy.
- `src/lib/sim/` contains the simulator runtime, physics, perception, field
  mapping, curves, and behavior-tree XML helpers.
- `src/lib/cpp/` contains the C++ lexer/parser/interpreter used by the simulator.
- `src/lib/pdf/` contains report generation.

When changing text lists, links, command snippets, test definitions, or formula
TOC entries, check `src/content/` before editing component structure.

## Design Direction

The site should feel like an engineering instrument for robot soccer strategy:
dark, readable, quiet, technical, and responsive to pointer movement. It is not
a marketing landing page and should not use oversized hero cards, loud gradients,
or decorative illustration where a real field diagram, chart, code readout, or
simulator surface is more useful.

The current target design is:

- dark charcoal canvas;
- warm off-white text;
- muted gray secondary text;
- one emerald interactive accent;
- self-hosted Space Grotesk for language;
- JetBrains Mono only for technical values;
- glass panels and controls where UI floats over data, field visuals, or dense
  simulator surfaces;
- hairline borders and value changes instead of heavy drop shadows;
- precise 8-point spacing with 44px minimum hit targets.

Some older pages still have legacy bespoke CSS. Do not expand that older style.
When touching a legacy page, migrate the affected area toward the tokenized
liquid-glass system instead of adding more raw colors or one-off typography.

## Design Tokens

Use `src/styles/tokens.css` for all reusable visual decisions.

Do:

- use `var(--color-...)`, `var(--space-...)`, `var(--radius-...)`,
  `var(--duration-...)`, and `var(--ease-...)`;
- add a token when a genuinely reusable design value is missing;
- keep page-only data colors scoped to that page if they are not reusable;
- scope dark page canvas styles to the page root, not to `body`.

Do not:

- add raw hex colors outside token definitions or page-scoped data palettes;
- invent arbitrary spacing values for margins, padding, or gaps;
- add a third font family;
- reintroduce Carbon, IBM Plex, Bootstrap, Tailwind, Material UI, or another UI
  kit;
- use decorative gradients, decorative glow fields, blobs, or one-note color
  palettes.

Narrow exceptions are fine for 1px hairlines, 1-2px focus outlines, container
dimensions, SVG coordinate math, and media-query breakpoints.

## Typography

The app has two font families, each with one job:

```css
--font-sans: "Space Grotesk", system-ui, -apple-system, sans-serif;
--font-mono: "JetBrains Mono", ui-monospace, "SF Mono", monospace;
```

Use Space Grotesk for headings, body text, buttons, nav, labels, tabs, cards,
and normal UI language.

Use JetBrains Mono only for technical values: file names, commands, byte values,
coordinates, formula symbols, ports, counters, logs, parser output, and live HUD
readouts. Do not use mono for ordinary prose or buttons.

Use the token scale:

- `--text-headline`: page titles and primary simulator headings.
- `--text-title`: section titles, modal titles, card-group titles.
- `--text-body`: regular explanatory prose.
- `--text-callout`: controls, compact descriptions, important inline UI copy.
- `--text-caption`: secondary UI text, supporting descriptions, card metadata.
- `--text-micro`: uppercase instrument labels and small HUD markings.

Use the matching `-weight` and `-tracking` tokens. Do not hand-tune tracking
unless the text is inside an SVG or a page-specific data visualization.

## Color

The main palette is neutral charcoal plus one emerald accent:

- `--color-background`: page canvas.
- `--color-elevated-background`: raised panels and cards.
- `--color-elevated-background-hover`: hover or second-level raised surface.
- `--color-separator`: borders and dividers.
- `--color-label`: primary text.
- `--color-secondary-label`: secondary text.
- `--color-tertiary-label`: hints, placeholders, inactive markings.
- `--color-accent`: the only interactive accent.
- `--color-accent-hover`: hover/pressed state for the accent.
- `--color-on-accent`: text/icons on an opaque accent fill.
- `--color-success` and `--color-error`: status only, never controls.

Saturation means interactivity. If something is vivid, it should usually be an
interactive element using the accent. Status colors and field/decision colors
must stay muted enough that they do not compete with controls.

Use the field/input token family only for data-entry surfaces:

- `--color-field-background`
- `--color-field-border`
- `--color-field-placeholder`
- `--color-control-fill`
- `--color-control-fill-hover`
- `--color-control-border`

## Liquid Glass Theme

Use liquid glass as the preferred chrome for controls, drawers, modals, and HUD
surfaces that sit over field visuals, simulator state, math visualizations, or
other content where translucency helps the interface feel physical.

Liquid glass in this app means:

- translucent fills from `--glass-*` tokens;
- `backdrop-filter` blur when there is meaningful content behind the control;
- SVG turbulence/displacement filters for droplet wobble on buttons and large
  drawers;
- inset rim highlights via `--shadow-glass-rim` or `--shadow-glass-rim-panel`;
- magnetic pointer pull and spring click feedback via `framer-motion`;
- opaque fallbacks under `@supports not (backdrop-filter: blur(1px))`.

Use these existing pieces first:

- `GlassButton.jsx` / `GlassButton.css`: canonical liquid-glass button.
- `GlassButtonFilter`: render once on a page that uses `GlassButton`; all
  buttons reference the shared `#glass-button-noise` filter.
- `GlassSlider.jsx` / `GlassSlider.css`: segmented slider with a glass thumb.
- `GlassModal.jsx` / `GlassModal.css`: glass modal shell.
- `ArtifactsDrawer.jsx` / `ArtifactsDrawer.css`: glass drawer pattern.
- `SegmentedControl.jsx` / `SegmentedControl.css`: normal segmented control
  with glass active segment.
- `RoleToggle.jsx` / `RoleToggle.css`: neutral-glass sliding selection.
- `SelectableCard.jsx` / `SelectableCard.css`: selectable elevated card with
  accent-tinted glass selected state.

Glass should not be sprayed everywhere. Prefer normal elevated panels for static
content, repeated list cards, and nested surfaces inside already-glass panels.
Avoid nested backdrop filters; they blur blur and quickly become muddy.

Common liquid-glass implementation pattern:

```css
.example-floating-control {
  background: var(--glass-fill-droplet);
  backdrop-filter: var(--blur-hud) url("#glass-button-noise");
  -webkit-backdrop-filter: var(--blur-hud) url("#glass-button-noise");
  box-shadow: var(--shadow-glass-rim);
  border: 1px solid var(--border-accent-subtle);
}

@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .example-floating-control {
    background: var(--glass-fill-droplet-fallback);
  }
}
```

Prefer using the shared component instead of copying this pattern.

## Surfaces

Use three main surface types:

- Canvas: `--color-background`, applied at the page root.
- Elevated static surface: `--color-elevated-background` with a
  `--color-separator` hairline.
- Glass floating surface: `--glass-*` fill plus blur/rim/fallback when it sits
  over active visuals or needs a tactile overlay feel.

Avoid drop shadows on ordinary UI. The accepted shadow-like tokens are:

- `--shadow-hero`: only for hero/product-style imagery.
- `--glow-accent`: hover/active response for interactive elements.
- `--glow-accent-lead`: progress bar lead edge.
- `--shadow-glass`: moving glass pane in `RoleToggle`.
- `--shadow-glass-rim` and `--shadow-glass-rim-panel`: inset glass edge light.

Do not use gradients as decoration. A canvas-to-transparent scrim for text
legibility over imagery or the hero field is acceptable.

## Layout

Use the 8-point spacing scale:

- `--space-1`: 4px
- `--space-2`: 8px
- `--space-3`: 12px
- `--space-4`: 16px
- `--space-5`: 20px
- `--space-6`: 24px
- `--space-8`: 32px
- `--space-10`: 40px
- `--space-12`: 48px
- `--space-16`: 64px
- `--space-20`: 80px
- `--space-24`: 96px

Use `max-width: 1240px` for broad app shells unless the page has an established
reason to be narrower. Keep dense simulator and math layouts scan-friendly:
sticky navigation, stable panels, fixed-format field/canvas areas, and clear
left-to-right or top-to-bottom workflow.

Every interactive target must meet `--tap-target-min` (`44px`) even if the
visible shape is smaller.

Cards should use `--radius-control` or `--radius-panel`. Buttons can use
`--radius-pill` when they are truly pill controls. Avoid soft, oversized,
decorative card stacks.

## Motion

Motion should feel physical, useful, and restrained.

- Use `--duration-fast`, `--duration-base`, `--duration-slow`, and
  `--duration-slowest`.
- Use `--ease-out` and `--ease-in-out`.
- Use shared spring constants from `src/lib/motionSpring.js` for magnetic and
  click motion.
- Respect `prefers-reduced-motion`.
- Do not add CSS transitions to transforms that `framer-motion` controls.
- Cursor-following effects should update motion values, not React state on
  every mousemove.

Use motion for state transitions, drawer travel, progress, active segments, and
simulator overlays. Avoid idle ornamental movement unless it communicates live
simulation state.

## Components

### Header

`Header.jsx` is shared by route pages and owns the artifacts drawer trigger plus
the Areas for Improvement button. The header still contains some legacy hardcoded
colors in `Header.css`; when editing it, move it toward the token system.

### Artifacts Drawer

Use the drawer as the global route navigator for artifacts. Add or edit entries
in the component/data it already uses; keep the drawer glass, fixed, right-side,
and scrollable.

### Buttons

Use `GlassButton` for liquid-glass actions. Use the `accent` variant only for the
single dominant action in a local action row. Secondary actions should usually be
glass, elevated, or text/icon-only depending on context.

Icon-only buttons should use lucide icons, include accessible labels, and keep a
44px hit target.

### Segmented Controls, Toggles, Sliders

Use:

- `SegmentedControl` for small mode choices.
- `RoleToggle` where a sliding neutral-glass pane communicates a binary role.
- `GlassSlider` for simulator speed or option sliders with a physical glass
  thumb.

### Modals and Drawers

Use `GlassModal` for modal shells. Use elevated inner surfaces inside modals
instead of more glass. Use transparent or minimal overlays unless legibility
requires a scrim.

### Code and Formulas

Use `CodeSnippet`, `CommandRow`, `Tex`, `FormulaBlock`, and the Simulation Math
visualization components instead of inventing one-off renderers.

Commands, paths, and logs should be mono. Explanatory text remains sans.

## Page Patterns

### Home

The home page is an artifact directory plus command cheat sheet. Keep it direct:
run-simulator CTA, quick links/resources, and operational commands. It is not a
marketing landing page.

### Category Pages

Category pages list artifacts for striker, goalie, and freekick strategy. They
currently share `CardList.css`, which is partially legacy. When editing, migrate
toward tokenized dark surfaces and Space Grotesk rather than adding more
hardcoded color or system-font rules.

### Strategy Explanation Pages

`BezierAnatomy`, `TeamCommByteFormat`, and parts of explorer pages use older
document-style palettes and custom CSS variables. Preserve their diagrams and
technical clarity, but when making design updates move toward:

- dark charcoal canvas;
- Space Grotesk prose;
- JetBrains Mono technical labels;
- emerald interactive accent;
- elevated panels or glass overlays as appropriate.

### Field Explorers

`FreekickExplorer` and `GoalieExplorer` share `explorer-shared.css`. The field is
the main object. Keep controls compact, side panels dense, and SVG field
geometry stable. Drag interactions should not resize the layout.

### Robot Simulator

`RobotSimulator.jsx` is the strongest expression of the current design system.
Use it as the reference for:

- full dark canvas;
- atmospheric field hero;
- setup workflow cards;
- liquid-glass back buttons, drawers, controls, and HUD panels;
- parser diagnostics;
- run console, stats, logs, and physics controls;
- scroll-scrubbed drawer behavior.

The simulator also contains some deliberate page-scoped data colors such as turf
and decision-state colors. Keep them scoped to the simulator unless they become
shared design tokens.

### Simulation Math

`SimulationMath.jsx` is tokenized and uses a sticky table of contents plus
formula blocks. Keep formula IDs synchronized with `src/content/simulationMathToc.js`.
Visualizations should call the real math helpers in `src/lib/sim/` whenever
possible rather than duplicating formulas.

## Content Conventions

Use `src/content/` for editable lists and text:

- `homeLinks.js`: home resources.
- `handyCommands.js`: command cheat sheet.
- `strikerStrategyItems.js`, `freekickStrategyItems.js`,
  `goalieStrategyItems.js`: category cards.
- `areasForImprovement.js`: improvement modal content.
- `teamCommSpecText.js`: authoritative copied team-communication spec.
- `testDefinitions.js`: simulator test cards.
- `physicsSliders.js`: simulator and report slider metadata.
- `simulatorPasteGuide.js`: simulator paste instructions.
- `simulationMathToc.js`: Simulation Math navigation.

Keep content data plain and easy to edit. Put behavior in components or libs.

## Accessibility And Responsiveness

- Use semantic buttons for actions and links for navigation.
- Preserve visible focus states using `--color-accent`.
- Add accessible labels to icon-only controls.
- Keep touch targets at least 44px.
- Maintain readable contrast on `--color-elevated-background`.
- Ensure text fits in controls at mobile widths.
- Use stable dimensions for fields, boards, SVG canvases, charts, HUD counters,
  and sliders so interaction does not shift the layout.
- Test narrow widths when changing headers, drawers, simulator controls, or
  formula visualizations.

## Migration Status

Current state:

- Tokenized/liquid-glass reference: Robot Simulator setup/run UI, Simulation
  Math, GlassButton, GlassSlider, GlassModal, ArtifactsDrawer, SegmentedControl,
  RoleToggle, SelectableCard, InfoHint, TestCard, and related simulator shared
  controls.
- Partially migrated: Home page and shared header.
- Legacy styling remains: `CardList.css`, `BezierAnatomy.css`,
  `TeamCommByteFormat.css`, and `explorer-shared.css`/field explorer pages.

When future prompts ask for design changes, prefer migration toward the current
tokenized liquid-glass system. Do not do broad unrelated restyles unless the
request explicitly asks for it.

## Development Commands

```bash
npm install
npm run dev
npm run build
npm run preview
npm run deploy
```

Run `npm run build` before finishing code changes when feasible.

## Editing Rules

- Edit only files relevant to the request.
- Preserve the existing React/CSS architecture.
- Prefer existing components and content files over new abstractions.
- Keep CSS scoped by page or component.
- Keep comments short and useful.
- Do not add dependencies unless they clearly reduce complexity.
- Do not change simulator math, parser behavior, or content semantics while doing
  visual-only work.
- When changing simulation formulas or behavior, update both the implementation
  and the matching explanatory content.
